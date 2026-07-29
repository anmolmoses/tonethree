const CAPTURE_KEY = "toneThreeCapture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "tone-three-rewrite",
    title: "Rewrite as Natural, Personal & Viral",
    contexts: ["selection", "editable"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "tone-three-rewrite") return;

  let text = (info.selectionText || "").trim();
  if (tab?.id) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: captureEditableText
      });
      text ||= result?.text?.trim() || "";
    } catch {
      // Restricted browser pages cannot be inspected.
    }
  }

  await chrome.storage.session.set({
    [CAPTURE_KEY]: { text, tabId: tab?.id ?? null, createdAt: Date.now() }
  });

  try {
    await chrome.action.openPopup();
  } catch {
    // Some Chromium builds do not allow programmatic popup opening.
  }
});

function captureEditableText() {
  const active = document.activeElement;
  const selected = window.getSelection()?.toString()?.trim();
  if (selected) {
    window.__toneThreeTarget = { element: active, selectionOnly: false };
    return { text: selected };
  }

  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? active.value.length;
    const selectedText = active.value.slice(start, end);
    window.__toneThreeTarget = { element: active, start, end, selectionOnly: Boolean(selectedText) };
    return { text: selectedText || active.value };
  }

  if (active?.isContentEditable) {
    window.__toneThreeTarget = { element: active, selectionOnly: false };
    return { text: active.innerText || active.textContent || "" };
  }

  return { text: "" };
}
