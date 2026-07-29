const NATIVE_HOST = "com.tonethree.codex";
const CAPTURE_KEY = "toneThreeCapture";

const source = document.querySelector("#source");
const charCount = document.querySelector("#charCount");
const captureButton = document.querySelector("#capture");
const rewriteButton = document.querySelector("#rewrite");
const resultsSection = document.querySelector("#results");
const statusBox = document.querySelector("#status");
const resultText = document.querySelector("#resultText");
const resultKicker = document.querySelector("#resultKicker");
const resultTitle = document.querySelector("#resultTitle");
const copyButton = document.querySelector("#copy");
const copyIcon = document.querySelector("#copyIcon");
const replaceButton = document.querySelector("#replace");

const labels = {
  natural: ["NATURAL VERSION", "Relaxed. Clear. Genuinely you."],
  personal: ["PERSONAL VERSION", "More human. More you."],
  viral: ["VIRAL VERSION", "Built to stop the scroll."]
};

let variations = null;
let activeStyle = "natural";
let capturedTabId = null;

document.addEventListener("DOMContentLoaded", initialize);
source.addEventListener("input", updateCount);
captureButton.addEventListener("click", captureFromPage);
rewriteButton.addEventListener("click", rewrite);
copyButton.addEventListener("click", copyCurrent);
copyIcon.addEventListener("click", copyCurrent);
replaceButton.addEventListener("click", replaceOnPage);
document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => showStyle(button.dataset.style));
});

async function initialize() {
  const stored = await chrome.storage.session.get(CAPTURE_KEY);
  const recent = stored[CAPTURE_KEY];

  if (recent?.text && Date.now() - recent.createdAt < 5 * 60 * 1000) {
    source.value = recent.text;
    capturedTabId = recent.tabId;
    await chrome.storage.session.remove(CAPTURE_KEY);
  } else {
    await captureFromPage({ quiet: true });
  }

  updateCount();
  source.focus();
  source.setSelectionRange(source.value.length, source.value.length);
}

async function captureFromPage(options = {}) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active page found.");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: capturePageState
    });

    capturedTabId = tab.id;
    if (result?.text?.trim()) {
      source.value = result.text.trim();
      updateCount();
      if (!options.quiet) showStatus("Draft captured from the page.");
    } else if (!options.quiet) {
      showStatus("Select text or click inside an editor, then try again.", true);
    }
  } catch {
    if (!options.quiet) {
      showStatus("This browser page cannot be read. Paste your draft here instead.", true);
    }
  }
}

function capturePageState() {
  const active = document.activeElement;
  const selection = window.getSelection()?.toString()?.trim();

  const makeLocator = (element) => {
    if (!element || element === document.body) return null;
    if (element.id) return { kind: "id", value: element.id };

    const path = [];
    let current = element;
    while (current && current !== document.body && path.length < 8) {
      const parent = current.parentElement;
      if (!parent) break;
      const index = [...parent.children].indexOf(current);
      path.unshift(index);
      current = parent;
    }
    return { kind: "path", value: path };
  };

  if (selection) {
    return { text: selection, locator: makeLocator(active), selectionOnly: true };
  }

  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? active.value.length;
    const selectedText = active.value.slice(start, end);
    window.__toneThreeTarget = { element: active, start, end, selectionOnly: Boolean(selectedText) };
    return { text: selectedText || active.value, locator: makeLocator(active) };
  }

  if (active?.isContentEditable) {
    window.__toneThreeTarget = { element: active, selectionOnly: false };
    return {
      text: active.innerText || active.textContent || "",
      locator: makeLocator(active)
    };
  }

  return { text: "" };
}

async function rewrite() {
  const text = source.value.trim();
  if (!text) {
    showStatus("Add a draft first.", true);
    source.focus();
    return;
  }

  setLoading(true);
  showStatus("Codex is preserving your voice and shaping three variations…");

  try {
    const response = await chrome.runtime.sendNativeMessage(NATIVE_HOST, {
      action: "rewrite",
      text
    });

    if (!response?.ok) throw new Error(response?.error || "Codex did not return a result.");
    validateVariations(response.data);
    variations = response.data;
    resultsSection.classList.remove("hidden");
    statusBox.classList.add("hidden");
    showStyle("natural");
  } catch (error) {
    const detail = normalizeNativeError(error);
    showStatus(detail, true);
  } finally {
    setLoading(false);
  }
}

function validateVariations(value) {
  for (const key of ["natural", "personal", "viral"]) {
    if (typeof value?.[key] !== "string" || !value[key].trim()) {
      throw new Error(`Codex returned an invalid ${key} variation.`);
    }
  }
}

function normalizeNativeError(error) {
  const message = error?.message || String(error);
  if (/native messaging host.*not found|specified native messaging host/i.test(message)) {
    return "Local companion not found. Run install.ps1 from the ToneThree folder, then reopen the extension.";
  }
  if (/access is denied|not callable|not found on PATH/i.test(message)) {
    return "The callable Codex CLI is missing. Run install.ps1, then sign in with “codex login”.";
  }
  return message;
}

function showStyle(style) {
  if (!variations) return;
  activeStyle = style;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.style === style);
  });
  resultKicker.textContent = labels[style][0];
  resultTitle.textContent = labels[style][1];
  resultText.textContent = variations[style];
}

async function copyCurrent() {
  if (!variations) return;
  await navigator.clipboard.writeText(variations[activeStyle]);
  const original = copyButton.textContent;
  copyButton.textContent = "Copied";
  setTimeout(() => { copyButton.textContent = original; }, 1200);
}

async function replaceOnPage() {
  if (!variations) return;
  try {
    const tabId = capturedTabId || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
    if (!tabId) throw new Error("No target page found.");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: replaceCapturedText,
      args: [variations[activeStyle]]
    });

    if (!result?.ok) throw new Error(result?.error || "Click inside the editor and use Read page first.");
    showStatus("Replaced on the page.");
  } catch (error) {
    showStatus(error.message || "Could not replace text on this page.", true);
  }
}

function replaceCapturedText(replacement) {
  const target = window.__toneThreeTarget;
  let element = target?.element;

  if (!element?.isConnected) element = document.activeElement;
  if (!element) return { ok: false, error: "The original editor is no longer available." };

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const start = target?.selectionOnly ? target.start : 0;
    const end = target?.selectionOnly ? target.end : element.value.length;
    element.focus();
    element.setRangeText(replacement, start, end, "end");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }

  if (element.isContentEditable) {
    element.focus();
    element.innerText = replacement;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: replacement }));
    return { ok: true };
  }

  return { ok: false, error: "The captured element is not editable." };
}

function setLoading(loading) {
  rewriteButton.disabled = loading;
  captureButton.disabled = loading;
  rewriteButton.classList.toggle("loading", loading);
}

function showStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.remove("hidden");
  statusBox.classList.toggle("error", isError);
}

function updateCount() {
  charCount.textContent = `${source.value.length.toLocaleString()} characters`;
}
