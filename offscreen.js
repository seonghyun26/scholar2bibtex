/*
 * Offscreen document: the only place in an MV3 extension that can reliably
 * write to the clipboard without a focused, user-visible page.
 *
 * Write only. The extension never reads the clipboard.
 */

const sink = document.getElementById('sink');

function copy(text) {
  sink.value = text;
  sink.focus();
  sink.select();
  const ok = document.execCommand('copy');
  sink.value = '';
  if (!ok) throw new Error('document.execCommand("copy") returned false');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'offscreen') return false;

  if (message.type === 'COPY') {
    try {
      copy(String(message.text || ''));
      sendResponse({ ok: true });
    } catch (err) {
      // Fall back to the async clipboard API in case execCommand is unavailable.
      navigator.clipboard
        .writeText(String(message.text || ''))
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String(e && e.message) }));
      return true;
    }
    return false;
  }

  return false;
});
