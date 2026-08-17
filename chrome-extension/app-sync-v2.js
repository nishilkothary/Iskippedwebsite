function storeSummary(rawSummary) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.sync) return;
    const summary = typeof rawSummary === "string" ? JSON.parse(rawSummary) : rawSummary;
    chrome.storage.sync.set({
      activeCauseSummary: summary || null
    });
  } catch {
    // Reloading an unpacked extension can invalidate old content-script contexts.
    // A fresh page load after extension reload injects this bridge again.
  }
}

storeSummary(document.documentElement.getAttribute("data-iskipped-extension-summary"));

window.addEventListener("iskipped-extension-sync", (event) => {
  storeSummary(event.detail);
});
