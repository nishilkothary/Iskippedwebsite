const DEFAULT_APP_URL = "https://iskipped.com";

const amountInput = document.getElementById("amount");
const itemInput = document.getElementById("item");
const appUrlInput = document.getElementById("appUrl");
const savedMessage = document.getElementById("saved");
const giveAmount = document.getElementById("giveAmount");
const giveLine = document.getElementById("giveLine");
const rewardAmount = document.getElementById("rewardAmount");
const rewardLine = document.getElementById("rewardLine");
const logButton = document.getElementById("logSkip");
const saveButton = document.getElementById("saveUrl");
const clearSnoozeButton = document.getElementById("clearSnooze");
const clearMutedButton = document.getElementById("clearMuted");

let activeCauseSummary = null;

function hostMerchant(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "Online";
  }
}

function formatDollars(value) {
  return `$${Number(value).toFixed(2)}`;
}

function pluralize(label, count) {
  if (!label) return "impact";
  if (Math.abs(count - 1) < 0.01) return label;
  if (/s$/i.test(label)) return label;
  return `${label}s`;
}

function formatImpact(amount, cause) {
  const unitCost = Number(cause?.unitCost);
  if (!unitCost || unitCost <= 0 || !cause?.unitName) return null;
  const givePercent = Math.min(100, Math.max(0, Number(cause.givePercent ?? 50)));
  const give = amount * (givePercent / 100);
  if (give <= 0) return null;

  if (cause.unitIsGoal) {
    const percent = Math.max(1, Math.round((give / unitCost) * 100));
    return `${percent}% of ${cause.unitPhrase || `a ${cause.unitName}`}`;
  }

  const rawCount = give / unitCost;
  const count = rawCount >= 10 ? Math.round(rawCount) : Number(rawCount.toFixed(1));
  return `${count} ${cause.unitDisplay || pluralize(cause.unitName, count)}`;
}

function formatRewardProgress(reward, cause) {
  const label = cause?.rewardGoalLabel || "Reward Jar";
  const target = Number(cause?.rewardGoalTargetAmount);
  if (Number.isFinite(target) && target > 0) {
    const percent = Math.max(1, Math.round((reward / target) * 100));
    return `= ${percent}% of ${label}`;
  }
  return `toward ${label}`;
}

function updateSplit() {
  const amount = Number(amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    giveAmount.textContent = "$0.00";
    giveLine.textContent = "Enter an amount";
    rewardAmount.textContent = "$0.00";
    rewardLine.textContent = activeCauseSummary?.rewardGoalLabel || "Reward Jar";
    return;
  }

  const givePercent = Math.min(100, Math.max(0, Number(activeCauseSummary?.givePercent ?? 50)));
  const give = amount * (givePercent / 100);
  const reward = Math.max(0, amount - give);
  const impact = formatImpact(amount, activeCauseSummary);

  giveAmount.textContent = formatDollars(give);
  giveLine.textContent = impact ? `= ${impact}` : "toward your cause";
  rewardAmount.textContent = formatDollars(reward);
  rewardLine.textContent = formatRewardProgress(reward, activeCauseSummary);
}

function showSavedMessage(message, timeout = 2200) {
  savedMessage.textContent = message;
  window.setTimeout(() => {
    savedMessage.textContent = "";
  }, timeout);
}

function refreshActiveShoppingTab(successMessage) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) {
      showSavedMessage(successMessage);
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "ISKIPPED_REFRESH_PROMPT", clearPageDismissal: true }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        showSavedMessage("Cleared. Refresh this shopping page.", 3200);
        return;
      }
      showSavedMessage(successMessage);
    });
  });
}

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, ({ appUrl }) => {
  appUrlInput.value = appUrl;
});

chrome.storage.sync.get({ activeCauseSummary: null }, (result) => {
  activeCauseSummary = result.activeCauseSummary;
  updateSplit();
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  itemInput.value = tab.title?.replace(/\s*[-|:].*$/, "").trim() || `${hostMerchant(tab.url)} purchase`;
});

amountInput.addEventListener("input", updateSplit);

saveButton.addEventListener("click", () => {
  const appUrl = (appUrlInput.value || DEFAULT_APP_URL).replace(/\/+$/, "");
  chrome.storage.sync.set({ appUrl }, () => {
    showSavedMessage("Saved.");
  });
});

clearSnoozeButton.addEventListener("click", () => {
  chrome.storage.sync.set({ snoozedUntil: 0 }, () => {
    refreshActiveShoppingTab("Snooze cleared.");
  });
});

clearMutedButton.addEventListener("click", () => {
  chrome.storage.sync.set({ mutedSites: [] }, () => {
    refreshActiveShoppingTab("Site mutes cleared.");
  });
});

logButton.addEventListener("click", () => {
  const amount = amountInput.value.trim();
  if (!amount || Number(amount) <= 0) {
    amountInput.focus();
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.runtime.sendMessage({
      type: "OPEN_SKIP",
      payload: {
        amount,
        item: itemInput.value.trim() || "Online purchase",
        merchant: hostMerchant(tab?.url),
        sourceUrl: tab?.url || ""
      }
    });
    window.close();
  });
});
