const DEFAULT_APP_URL = "https://iskipped.com";

function cleanAppUrl(value) {
  if (!value || typeof value !== "string") return DEFAULT_APP_URL;
  return value.replace(/\/+$/, "");
}

function buildSkipUrl(appUrl, payload) {
  const url = new URL("/extension/skip", cleanAppUrl(appUrl));
  url.searchParams.set("source", "chrome");
  if (payload.amount) url.searchParams.set("amount", payload.amount);
  if (payload.item) url.searchParams.set("item", payload.item);
  if (payload.merchant) url.searchParams.set("merchant", payload.merchant);
  if (payload.sourceUrl) url.searchParams.set("sourceUrl", payload.sourceUrl);
  return url.toString();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "OPEN_SKIP") return false;

  chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, ({ appUrl }) => {
    const skipUrl = buildSkipUrl(appUrl, message.payload || {});
    chrome.tabs.create({ url: skipUrl });
    sendResponse({ ok: true });
  });

  return true;
});
