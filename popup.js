const DEFAULTS = { enabled: true, diagrams: true, dimImages: false };
chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const key of Object.keys(DEFAULTS)) {
    const el = document.getElementById(key);
    el.checked = !!s[key];
    el.addEventListener('change', () => chrome.storage.sync.set({ [key]: el.checked }));
  }
});
