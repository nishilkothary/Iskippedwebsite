const SHOPPING_SITES = [
  { host: "amazon.com", merchant: "Amazon" },
  { host: "target.com", merchant: "Target" },
  { host: "walmart.com", merchant: "Walmart" },
  { host: "bestbuy.com", merchant: "Best Buy" },
  { host: "ebay.com", merchant: "eBay" },
  { host: "etsy.com", merchant: "Etsy" },
  { host: "nike.com", merchant: "Nike" },
  { host: "sephora.com", merchant: "Sephora" },
  { host: "doordash.com", merchant: "DoorDash" },
  { host: "ubereats.com", merchant: "Uber Eats" },
  { host: "instacart.com", merchant: "Instacart" },
  { host: "stubhub.com", merchant: "StubHub" },
  { host: "ticketmaster.com", merchant: "Ticketmaster" },
  { host: "seatgeek.com", merchant: "SeatGeek" },
  { host: "vividseats.com", merchant: "Vivid Seats" }
];

const CART_PATH_RE = /\/(cart|checkout|basket|bag|order|payment|buy|purchase|tickets|event|resale|gp\/cart|shopping-cart)/i;
const AMAZON_CART_PATH_RE = /\/gp\/cart\/view\.html|\/cart(?:\/|$)|\/shopping-cart/i;
const MONEY_RE = /\$\s?([0-9]{1,4}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/g;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function currentSite() {
  const host = window.location.hostname.replace(/^www\./, "");
  const site = SHOPPING_SITES.find((candidate) => host === candidate.host || host.endsWith(`.${candidate.host}`));
  return site ? { ...site, currentHost: host } : null;
}

function isAmazonSite(site) {
  return site?.host === "amazon.com";
}

function isAmazonCartMoment() {
  return AMAZON_CART_PATH_RE.test(window.location.pathname);
}

function getAmazonActiveCartRoot() {
  return document.querySelector("#sc-active-cart, [data-name='Active Items'], #sc-active-cart-container");
}

function getAmazonActiveCartItemCount() {
  const subtotalText = [
    document.querySelector("#sc-subtotal-label-activecart")?.textContent,
    document.querySelector("#sc-subtotal-label-buybox")?.textContent,
    document.querySelector("[data-name='Subtotals']")?.textContent
  ].filter(Boolean).join(" ");
  const count = subtotalText.match(/\((\d+)\s+items?\)/i)?.[1];
  if (count !== undefined) return Number(count);

  const root = getAmazonActiveCartRoot();
  if (!root) return 0;
  return root.querySelectorAll("[data-asin][data-itemtype], .sc-list-item, .sc-list-item-content").length;
}

function hasAmazonActiveCartItems() {
  const amount = Number(detectAmazonAmount());
  const count = getAmazonActiveCartItemCount();
  return (Number.isFinite(amount) && amount > 0) || count > 0;
}

function isLikelyCheckoutMoment(site) {
  if (isAmazonSite(site)) return isAmazonCartMoment() && hasAmazonActiveCartItems();
  return CART_PATH_RE.test(window.location.pathname);
}

function parseMoney(text) {
  if (!text) return null;
  const matches = [...text.matchAll(MONEY_RE)]
    .map((match) => Number(match[1].replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 10000);
  if (!matches.length) return null;
  return Math.max(...matches);
}

function parsePriceElement(element) {
  if (!element) return null;

  const whole = element.querySelector?.(".a-price-whole")?.textContent?.replace(/[^\d]/g, "");
  const fraction = element.querySelector?.(".a-price-fraction")?.textContent?.replace(/[^\d]/g, "");
  if (whole) {
    const value = Number(`${whole}.${fraction || "00"}`);
    if (Number.isFinite(value) && value > 0 && value < 10000) return value;
  }

  return parseMoney(element.textContent || element.getAttribute?.("aria-label") || "");
}

function detectAmazonAmount() {
  const selectors = [
    "#sc-subtotal-amount-activecart .sc-price",
    "#sc-subtotal-amount-activecart .a-price",
    "#sc-subtotal-amount-buybox .sc-price",
    "#sc-subtotal-amount-buybox .a-price",
    "[data-name='Subtotals'] .sc-price",
    "[data-name='Subtotals'] .a-price",
    ".sc-subtotal .sc-price",
    ".sc-subtotal .a-price"
  ];

  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const value = parsePriceElement(element);
      if (value) return value.toFixed(2);
    }
  }

  const subtotalBlocks = [
    document.querySelector("#sc-subtotal-label-activecart")?.parentElement,
    document.querySelector("#sc-subtotal-label-buybox")?.parentElement,
    ...document.querySelectorAll("[id*='subtotal' i], [class*='subtotal' i]")
  ];

  for (const block of subtotalBlocks) {
    const value = parseMoney(block?.textContent || "");
    if (value) return value.toFixed(2);
  }

  return "";
}

function detectAmazonItemLabel() {
  const titles = [...document.querySelectorAll(".sc-list-item-content .sc-product-title, [data-name='Active Items'] .sc-product-title, .sc-product-title")]
    .map((element) => element.textContent?.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (titles.length === 1) return titles[0].slice(0, 70);
  if (titles.length > 1) return `Amazon cart (${titles.length}+ items)`;

  const subtotalText = document.querySelector("#sc-subtotal-label-activecart")?.textContent || "";
  const itemCount = subtotalText.match(/Subtotal\s*\((\d+)\s+items?\)/i)?.[1];
  return itemCount ? `Amazon cart (${itemCount} items)` : "Amazon cart";
}

function cleanAmazonTitle(value) {
  const title = value?.replace(/\s+/g, " ").trim();
  if (!title || title.length < 3) return "";
  if (/^(delete|save for later|compare|share|sponsored|open in (a )?new tab|opens in (a )?new tab)$/i.test(title)) return "";
  if (/^opens?\s+.+\s+in\s+(a\s+)?new\s+tab$/i.test(title)) return "";
  return title;
}

function amazonItemKey(title, price) {
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 72);
  return `${normalizedTitle}:${price.toFixed(2)}`;
}

function detectAmazonCartItems() {
  const seen = new Set();
  const items = [];
  const activeCart = getAmazonActiveCartRoot();
  if (!activeCart || !hasAmazonActiveCartItems()) {
    storeAmazonDiagnostics(getAmazonDiagnosticsSnapshot(items, [], [], activeCart));
    return [];
  }

  const addItem = (title, price) => {
    const cleanedTitle = cleanAmazonTitle(title);
    if (!cleanedTitle || cleanedTitle.length < 3 || !price) return;

    const key = amazonItemKey(cleanedTitle, price);
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      title: cleanedTitle.slice(0, 90),
      amount: price.toFixed(2)
    });
  };

  const rows = [...activeCart.querySelectorAll([
    "[data-name='Active Items'] [data-asin]",
    "[data-asin][data-itemtype]",
    ".sc-list-item",
    ".sc-list-item-content",
    "[data-itemid]",
    "[data-csa-c-item-id]"
  ].join(","))];

  for (const row of rows) {
    const titleCandidates = [
      row.querySelector(".sc-product-title")?.textContent,
      row.querySelector("[data-cy='title-recipe-title']")?.textContent,
      row.querySelector("[data-csa-c-content-id*='title']")?.textContent,
      row.querySelector("[data-a-word-break]")?.textContent,
      row.querySelector("span.a-truncate-full")?.textContent,
      row.querySelector("span.a-truncate-cut")?.textContent,
      row.querySelector("img[alt]")?.getAttribute("alt"),
      row.querySelector("a[href*='/dp/']")?.getAttribute("title"),
      row.querySelector("a[href*='/gp/product/']")?.getAttribute("title"),
      row.querySelector("a[href*='/dp/']")?.textContent,
      row.querySelector("a[href*='/gp/product/']")?.textContent
    ];
    const title = titleCandidates.map(cleanAmazonTitle).find(Boolean) || "";

    const priceElement =
      row.querySelector(".sc-product-price") ||
      row.querySelector("[data-csa-c-content-id*='price']") ||
      row.querySelector(".a-price .a-offscreen") ||
      row.querySelector(".a-price") ||
      row.querySelector(".sc-price");
    const price = parsePriceElement(priceElement) ?? parseMoney(row.textContent || "");
    addItem(title, price);
  }

  const productLinks = [...activeCart.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']")];

  for (const link of productLinks) {
    const title = [
      link.querySelector("img[alt]")?.getAttribute("alt"),
      link.getAttribute("title"),
      link.textContent,
      link.getAttribute("aria-label")
    ].map(cleanAmazonTitle).find(Boolean);
    if (!title) continue;

    let node = link;
    let price = null;
    for (let depth = 0; node && depth < 7 && !price; depth += 1) {
      const priceElement =
        node.querySelector?.(".sc-product-price") ||
        node.querySelector?.(".a-price .a-offscreen") ||
        node.querySelector?.(".a-price") ||
        node.querySelector?.(".sc-price") ||
        node.querySelector?.("[class*='price' i]");
      price = parsePriceElement(priceElement) ?? parseMoney(node.textContent || "");
      node = node.parentElement;
    }
    addItem(title, price);
  }

  if (items.length === 0) {
    const subtotal = Number(detectAmazonAmount());
    const priceElements = [...activeCart.querySelectorAll(".a-price, .sc-price, [class*='price' i]")]
      .filter((element) => {
        const text = element.textContent || "";
        const ancestorText = element.closest?.("[id*='subtotal' i], [class*='subtotal' i], [data-name*='Subtotals' i]")?.textContent || "";
        return text.includes("$") && !ancestorText;
      });

    const prices = priceElements
      .map((element) => parsePriceElement(element))
      .filter((price) => price && (!subtotal || Math.abs(price - subtotal) > 0.01));

    for (const price of prices) {
      addItem("Amazon item", price);
    }
  }

  storeAmazonDiagnostics(getAmazonDiagnosticsSnapshot(items, rows, productLinks, activeCart));

  return items.slice(0, 8);
}

function getAmazonDiagnosticsSnapshot(items, rows, productLinks, activeCart) {
  const cartRoot = activeCart || getAmazonActiveCartRoot();
  return {
    rowCount: rows?.length ?? document.querySelectorAll("[data-name='Active Items'] [data-asin], [data-asin][data-itemtype], .sc-list-item, .sc-list-item-content, [data-itemid], [data-csa-c-item-id]").length,
    activeCartFound: !!cartRoot,
    activeCartItemCount: getAmazonActiveCartItemCount(),
    productLinkCount: productLinks?.length ?? cartRoot?.querySelectorAll("a[href*='/dp/'], a[href*='/gp/product/']").length ?? 0,
    detectedItemCount: items?.length ?? 0,
    sampleItems: (items || []).slice(0, 6).map((item) => `${item.title} - ${formatDollars(item.amount)}`),
    priceTextCount: cartRoot?.querySelectorAll(".a-price, .sc-price, [class*='price' i]").length ?? 0,
    subtotal: detectAmazonAmount() || null,
    path: window.location.pathname,
    updatedAt: new Date().toISOString()
  };
}

function storeAmazonDiagnostics(details) {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    chrome.storage.local.set({ amazonDiagnostics: details });
  } catch {
    // Diagnostics are best-effort only.
  }
}

function detectAmount(site) {
  if (isAmazonSite(site)) {
    const amazonAmount = detectAmazonAmount();
    if (amazonAmount) return amazonAmount;
  }

  const selectors = [
    "[data-testid*='total' i]",
    "[aria-label*='total' i]",
    "[id*='total' i]",
    "[class*='total' i]",
    "[id*='subtotal' i]",
    "[class*='subtotal' i]",
    "[data-testid*='subtotal' i]",
    "[aria-label*='subtotal' i]"
  ];

  const candidates = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      const value = parseMoney(element.textContent || element.getAttribute("aria-label") || "");
      if (value) candidates.push(value);
      if (candidates.length > 30) break;
    }
    if (candidates.length > 30) break;
  }

  if (candidates.length) return Math.max(...candidates).toFixed(2);
  const pageValue = parseMoney(document.body?.innerText?.slice(0, 50000) || "");
  return pageValue ? pageValue.toFixed(2) : "";
}

function detectItem(site) {
  if (isAmazonSite(site)) return detectAmazonItemLabel();

  const title = document.title
    .replace(/\s*[-|:].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title && title.length <= 70) return title;
  return `${site.merchant} purchase`;
}

function formatDollars(value) {
  return `$${Number(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pluralize(label, count) {
  if (!label) return "impact";
  if (Math.abs(count - 1) < 0.01) return label;
  if (/s$/i.test(label)) return label;
  return `${label}s`;
}

function formatUnitsForPrompt(amount, cause) {
  const unitCost = Number(cause?.unitCost);
  if (!unitCost || unitCost <= 0 || !cause?.unitName) return null;

  const givePercent = Number(cause.givePercent ?? 50);
  const giveAmount = amount * (Math.min(100, Math.max(0, givePercent)) / 100);
  if (giveAmount <= 0) return null;

  if (cause.unitIsGoal) {
    const percent = Math.max(1, Math.round((giveAmount / unitCost) * 100));
    const phrase = cause.unitPhrase || `a ${cause.unitName}`;
    return `${percent}% of ${phrase}`;
  }

  const rawCount = giveAmount / unitCost;
  const count = rawCount >= 10 ? Math.round(rawCount) : Number(rawCount.toFixed(1));
  const label = cause.unitDisplay || pluralize(cause.unitName, count);
  return `${count} ${label}`;
}

function formatRewardProgress(liveAmount, cause) {
  const label = cause?.rewardGoalLabel || "Reward Jar";
  const target = Number(cause?.rewardGoalTargetAmount);
  if (Number.isFinite(target) && target > 0) {
    const percent = Math.max(1, Math.round((liveAmount / target) * 100));
    return `= ${percent}% of ${label}`;
  }
  return `toward ${label}`;
}

function causeCopy(cause) {
  if (!cause?.title) {
    return {
      title: "Is there anything you can skip?",
      copy: "Turn this into impact and a reward."
    };
  }

  return {
    title: "Is there anything you can skip?",
    copy: "Turn this into impact and a reward."
  };
}

function splitForAmount(amount, cause) {
  const givePercent = Math.min(100, Math.max(0, Number(cause?.givePercent ?? 50)));
  const giveAmount = amount * (givePercent / 100);
  return {
    giveAmount,
    liveAmount: Math.max(0, amount - giveAmount)
  };
}

function updateSplitSummary(amountInput, root, cause) {
  const amount = Number(amountInput.value);
  const giveAmountElement = root.querySelector("[data-field='give-amount']");
  const giveDetailElement = root.querySelector("[data-field='give-detail']");
  const rewardAmountElement = root.querySelector("[data-field='reward-amount']");
  const rewardDetailElement = root.querySelector("[data-field='reward-detail']");

  if (!Number.isFinite(amount) || amount <= 0) {
    giveAmountElement.textContent = "$0.00";
    giveDetailElement.textContent = "Enter an amount";
    rewardAmountElement.textContent = "$0.00";
    rewardDetailElement.textContent = cause?.rewardGoalLabel || "Reward Jar";
    return;
  }

  const { giveAmount, liveAmount } = splitForAmount(amount, cause);
  const impact = formatUnitsForPrompt(amount, cause);
  giveAmountElement.textContent = formatDollars(giveAmount);
  giveDetailElement.textContent = impact ? `= ${impact}` : "toward your cause";
  rewardAmountElement.textContent = formatDollars(liveAmount);
  rewardDetailElement.textContent = formatRewardProgress(liveAmount, cause);
}

function optionHtml(value, kind, amount, title, label) {
  return `<option value="${escapeHtml(value)}" data-kind="${escapeHtml(kind)}" data-amount="${escapeHtml(amount || "")}" data-title="${escapeHtml(title || "")}">${escapeHtml(label)}</option>`;
}

function hasPositiveAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function buildSkipChoiceOptions(cartDefaults, cartItems) {
  const options = [];
  if (hasPositiveAmount(cartDefaults.amount)) {
    options.push(optionHtml("cart", "cart", cartDefaults.amount, cartDefaults.item || "Shopping cart", `Entire cart - ${formatDollars(cartDefaults.amount)}`));
  }

  const cleanItems = cartItems.slice(0, 6);
  for (const [index, item] of cleanItems.entries()) {
    const title = item.title && item.title !== "Amazon item" ? item.title : `Item ${index + 1}`;
    const label = `${title.slice(0, 34)} - ${formatDollars(item.amount)}`;
    options.push(optionHtml(`item-${index}`, "item", item.amount, item.title || title, label));
  }

  options.push(optionHtml("custom", "custom", "", "", "Custom amount"));
  return options.join("");
}

function refreshSkipChoices(root, site, cartDefaults) {
  if (!isAmazonSite(site)) return;
  const choice = root.querySelector("[data-field='skip-choice']");
  const currentItems = Number(choice.dataset.itemCount || "0");
  const cartItems = detectAmazonCartItems();
  if (cartItems.length <= currentItems) return;

  const previousValue = choice.value;
  choice.innerHTML = buildSkipChoiceOptions(cartDefaults, cartItems);
  choice.dataset.itemCount = String(cartItems.length);
  storeAmazonDiagnostics({
    ...getAmazonDiagnosticsSnapshot(cartItems),
    dropdownOptionCount: choice.options.length,
    dropdownItemsShown: Math.max(0, choice.options.length - 2)
  });
  console.debug(`[iSkipped] detected ${cartItems.length} Amazon cart item(s); showing ${Math.max(0, choice.options.length - 2)}`);
  if ([...choice.options].some((option) => option.value === previousValue)) {
    choice.value = previousValue;
  }
}

function watchAmazonCartItems(root, site, cartDefaults) {
  if (!isAmazonSite(site)) return;

  let attempts = 0;
  const refresh = () => {
    attempts += 1;
    refreshSkipChoices(root, site, cartDefaults);
    if (attempts >= 10) window.clearInterval(interval);
  };

  const interval = window.setInterval(refresh, 750);
  refresh();

  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 8000);
}

function applySkipChoice(root, cause) {
  const choice = root.querySelector("[data-field='skip-choice']");
  const amountInput = root.querySelector("[data-field='amount']");
  const itemInput = root.querySelector("[data-field='item']");
  const amountWrap = root.querySelector("[data-field='amount-wrap']");
  const itemWrap = root.querySelector("[data-field='item-wrap']");
  const selected = choice.selectedOptions[0];
  const isCustom = selected?.dataset.kind === "custom";

  amountWrap.hidden = !isCustom;
  itemWrap.hidden = !isCustom;

  if (isCustom) {
    if (itemInput.value === "Shopping cart" || itemInput.value.startsWith("Amazon cart")) itemInput.value = "";
    amountInput.focus();
  } else if (selected) {
    amountInput.value = selected.dataset.amount || "";
    itemInput.value = selected.dataset.title || selected.textContent || "";
  }

  updateSplitSummary(amountInput, root, cause);
}

function sendSkip(amountInput, itemInput, site) {
  const amount = amountInput.value.trim();
  const item = itemInput.value.trim() || `${site.merchant} purchase`;
  if (!amount || Number(amount) <= 0) {
    amountInput.focus();
    amountInput.select();
    return;
  }

  chrome.runtime.sendMessage({
    type: "OPEN_SKIP",
    payload: {
      amount,
      item,
      merchant: site.merchant,
      sourceUrl: window.location.href
    }
  });
}

function pageDismissKey(site) {
  return `iskipped-dismissed:${site.currentHost}:${window.location.pathname}`;
}

function isPageDismissed(site) {
  return sessionStorage.getItem(pageDismissKey(site)) === "1";
}

function dismissForPage(root, site) {
  sessionStorage.setItem(pageDismissKey(site), "1");
  root.remove();
}

function snoozeForDay(root, site) {
  const snoozedUntil = Date.now() + ONE_DAY_MS;
  chrome.storage.sync.set({ snoozedUntil }, () => root.remove());
}

function muteSite(root, site) {
  chrome.storage.sync.get({ mutedSites: [] }, ({ mutedSites }) => {
    const next = Array.from(new Set([...(Array.isArray(mutedSites) ? mutedSites : []), site.host]));
    chrome.storage.sync.set({ mutedSites: next }, () => root.remove());
  });
}

function shouldSkipPrompt(site, settings) {
  if (!site || !isLikelyCheckoutMoment(site)) return true;
  if (isPageDismissed(site)) return true;
  const mutedSites = Array.isArray(settings?.mutedSites) ? settings.mutedSites : [];
  if (mutedSites.includes(site.host) || mutedSites.includes(site.currentHost)) return true;
  const snoozedUntil = Number(settings?.snoozedUntil || 0);
  return Number.isFinite(snoozedUntil) && snoozedUntil > Date.now();
}

function mountPrompt(cause, settings) {
  if (document.getElementById("iskipped-checkout-pause")) return;
  const site = currentSite();
  if (shouldSkipPrompt(site, settings)) return;

  const promptCopy = causeCopy(cause);
  const cartDefaults = {
    amount: detectAmount(site),
    item: detectItem(site)
  };
  const cartItems = isAmazonSite(site) ? detectAmazonCartItems() : [];
  const customOnly = !hasPositiveAmount(cartDefaults.amount) && cartItems.length === 0;
  const choiceOptions = buildSkipChoiceOptions(cartDefaults, cartItems);
  const root = document.createElement("div");
  root.id = "iskipped-checkout-pause";
  root.innerHTML = `
    <div class="iskipped-card" role="dialog" aria-label="iSkipped checkout pause">
      <button class="iskipped-close" type="button" aria-label="Dismiss">x</button>
      <div class="iskipped-kicker">iSkipped</div>
      <div class="iskipped-title">${escapeHtml(promptCopy.title)}</div>
      <div class="iskipped-copy">${escapeHtml(promptCopy.copy)}</div>
      <div class="iskipped-split" aria-live="polite">
        <div class="iskipped-jar-row">
          <div>
            <div class="iskipped-jar-label iskipped-giving">Giving Jar</div>
            <div class="iskipped-jar-main">
              <strong data-field="give-amount">$0.00</strong>
              <span data-field="give-detail">Enter an amount</span>
            </div>
          </div>
        </div>
        <div class="iskipped-jar-row">
          <div>
            <div class="iskipped-jar-label iskipped-reward">Reward Jar</div>
            <div class="iskipped-jar-main">
              <strong data-field="reward-amount">$0.00</strong>
              <span data-field="reward-detail">${escapeHtml(cause?.rewardGoalLabel || "Reward Jar")}</span>
            </div>
          </div>
        </div>
      </div>
      <label class="iskipped-label" data-field="choice-wrap"${customOnly ? " hidden" : ""}>
        I&apos;m willing to skip
        <select class="iskipped-input" data-field="skip-choice" data-item-count="${cartItems.length}">
          ${choiceOptions}
        </select>
      </label>
      <button class="iskipped-custom-toggle" type="button" data-action="custom"${customOnly ? " hidden" : ""}>Custom amount</button>
      <label class="iskipped-label" data-field="amount-wrap"${customOnly ? "" : " hidden"}>
        Amount
        <input class="iskipped-input" data-field="amount" inputmode="decimal" placeholder="25.00" />
      </label>
      <label class="iskipped-label" data-field="item-wrap"${customOnly ? "" : " hidden"}>
        What you skipped
        <input class="iskipped-input" data-field="item" placeholder="What are you skipping?" />
      </label>
      <div class="iskipped-actions">
        <button class="iskipped-primary" type="button">Skip this</button>
        <button class="iskipped-secondary" type="button">Not now</button>
      </div>
      <div class="iskipped-mini-actions">
        <button class="iskipped-link" type="button" data-action="snooze">Snooze 24h</button>
        <button class="iskipped-link" type="button" data-action="mute">Don't show on ${escapeHtml(site.merchant)}</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(root);

  const amountInput = root.querySelector("[data-field='amount']");
  const itemInput = root.querySelector("[data-field='item']");
  const closeButton = root.querySelector(".iskipped-close");
  const primaryButton = root.querySelector(".iskipped-primary");
  const secondaryButton = root.querySelector(".iskipped-secondary");
  const snoozeButton = root.querySelector("[data-action='snooze']");
  const muteButton = root.querySelector("[data-action='mute']");
  const customButton = root.querySelector("[data-action='custom']");
  const choice = root.querySelector("[data-field='skip-choice']");
  if (isAmazonSite(site)) {
    storeAmazonDiagnostics({
      ...getAmazonDiagnosticsSnapshot(cartItems),
      initialDropdownOptionCount: choice.options.length,
      initialDropdownItemsShown: Math.max(0, choice.options.length - 2),
      initialDropdownLabels: [...choice.options].map((option) => option.textContent).slice(0, 8)
    });
  }

  amountInput.value = customOnly ? "" : cartDefaults.amount;
  itemInput.value = customOnly ? "" : cartDefaults.item;
  updateSplitSummary(amountInput, root, cause);

  const close = () => dismissForPage(root, site);
  closeButton.addEventListener("click", close);
  secondaryButton.addEventListener("click", close);
  primaryButton.addEventListener("click", () => sendSkip(amountInput, itemInput, site));
  snoozeButton.addEventListener("click", () => snoozeForDay(root, site));
  muteButton.addEventListener("click", () => muteSite(root, site));
  amountInput.addEventListener("input", () => updateSplitSummary(amountInput, root, cause));
  itemInput.addEventListener("input", () => updateSplitSummary(amountInput, root, cause));
  choice.addEventListener("change", () => applySkipChoice(root, cause));
  customButton.addEventListener("click", () => {
    choice.value = "custom";
    applySkipChoice(root, cause);
  });
  watchAmazonCartItems(root, site, cartDefaults);
}

function loadCauseAndMount() {
  chrome.storage.sync.get({ activeCauseSummary: null, mutedSites: [], snoozedUntil: 0 }, (settings) => {
    mountPrompt(settings.activeCauseSummary, settings);
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "ISKIPPED_REFRESH_PROMPT") return;
  const site = currentSite();
  if (message.clearPageDismissal && site) {
    sessionStorage.removeItem(pageDismissKey(site));
  }
  loadCauseAndMount();
  sendResponse({ ok: true });
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadCauseAndMount, { once: true });
} else {
  loadCauseAndMount();
}
