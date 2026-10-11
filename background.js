// Fetches cross-origin stylesheets (e.g. on kastatic.org) so the content script can read their rules.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'kad-fetch-css') return;
  try {
    const u = new URL(msg.url);
    if (u.protocol !== 'https:' || !/(^|\.)(khanacademy\.org|kastatic\.org)$/.test(u.hostname)) {
      sendResponse({ ok: false });
      return;
    }
    fetch(u.href)
      .then((r) => r.text())
      .then((text) => sendResponse({ ok: true, text }))
      .catch(() => sendResponse({ ok: false }));
    return true; // async response
  } catch (e) {
    sendResponse({ ok: false });
  }
});
