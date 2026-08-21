import { NextRequest, NextResponse } from "next/server";

const supportedRetailers = [
  "amazon.com",
  "amazon.ca",
  "amazon.co.uk",
  "amazon.de",
  "amazon.in",
  "amazon.com.au",
  "target.com",
  "walmart.com",
  "bestbuy.com",
  "etsy.com",
  "apple.com",
];

function isSupportedRetailer(hostname: string) {
  return supportedRetailers.some((retailer) => hostname === retailer || hostname.endsWith(`.${retailer}`));
}

function getMetaContent(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) ?? null;
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanText(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = decodeHtml(value).trim();
  return cleaned.length > 0 ? cleaned : null;
}

function priceFromText(value: string | null | undefined) {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  const match = cleaned.match(/\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!match) return null;
  const amount = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function retailerName(hostname: string) {
  const normalized = hostname.replace(/^www\./, "");
  const known: Record<string, string> = {
    "amazon.com": "Amazon",
    "amazon.ca": "Amazon",
    "amazon.co.uk": "Amazon",
    "amazon.de": "Amazon",
    "amazon.in": "Amazon",
    "amazon.com.au": "Amazon",
    "target.com": "Target",
    "walmart.com": "Walmart",
    "bestbuy.com": "Best Buy",
    "etsy.com": "Etsy",
    "apple.com": "Apple",
  };
  const match = Object.entries(known).find(([domain]) => normalized === domain || normalized.endsWith(`.${domain}`));
  if (match) return match[1];
  const firstPart = normalized.split(".")[0];
  return firstPart ? firstPart.charAt(0).toUpperCase() + firstPart.slice(1) : null;
}

function getTitle(html: string) {
  return cleanText(
    getMetaContent(html, "og:title")
      ?? getMetaContent(html, "twitter:title")
      ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  );
}

function getPrice(html: string) {
  return priceFromText(getMetaContent(html, "product:price:amount"))
    ?? priceFromText(getMetaContent(html, "og:price:amount"))
    ?? priceFromText(getMetaContent(html, "twitter:data1"))
    ?? priceFromText(html.match(/itemprop=["']price["'][^>]+content=["']([^"']+)["']/i)?.[1])
    ?? priceFromText(html.match(/"price"\s*:\s*"?([0-9][0-9,.]*)"?/i)?.[1]);
}

function getMerchant(html: string, url: URL) {
  return cleanText(getMetaContent(html, "og:site_name"))
    ?? cleanText(getMetaContent(html, "application-name"))
    ?? retailerName(url.hostname);
}

function amazonImageFromUrl(url: URL) {
  if (!url.hostname.includes("amazon.")) return null;
  const asin = url.pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i)?.[1];
  if (!asin) return null;

  // Amazon frequently blocks page previews, but continues to expose this public
  // product image URL for canonical ASIN links.
  return `https://images-na.ssl-images-amazon.com/images/P/${asin.toUpperCase()}.01.LZZZZZZZ.jpg`;
}

type ProductPreview = {
  imageURL: string | null;
  title: string | null;
  price: number | null;
  merchant: string | null;
};

function emptyPreview(url?: URL): ProductPreview {
  return {
    imageURL: url ? amazonImageFromUrl(url) : null,
    title: null,
    price: null,
    merchant: url ? retailerName(url.hostname) : null,
  };
}

async function fetchPreview(url: URL, redirectsRemaining = 2): Promise<ProductPreview> {
  const response = await fetch(url, {
    redirect: "manual",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; iSkipped preview bot)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(7000),
  });

  if (response.status >= 300 && response.status < 400 && redirectsRemaining > 0) {
    const destination = response.headers.get("location");
    if (!destination) return emptyPreview(url);
    const redirectUrl = new URL(destination, url);
    return isSupportedRetailer(redirectUrl.hostname) ? fetchPreview(redirectUrl, redirectsRemaining - 1) : emptyPreview(url);
  }

  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return emptyPreview(url);
  const html = await response.text();
  const image = getMetaContent(html, "og:image") ?? getMetaContent(html, "twitter:image");
  const preview: ProductPreview = {
    imageURL: amazonImageFromUrl(url),
    title: getTitle(html),
    price: getPrice(html),
    merchant: getMerchant(html, url),
  };

  if (image) {
    try {
      preview.imageURL = new URL(image, url).toString();
    } catch {
      // Keep the fallback image when relative metadata is malformed.
    }
  }

  return preview;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return NextResponse.json(emptyPreview(), { status: 400 });

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !isSupportedRetailer(url.hostname)) {
      return NextResponse.json(emptyPreview(url), { status: 400 });
    }

    const preview = await fetchPreview(url);
    return NextResponse.json(preview);
  } catch {
    return NextResponse.json(emptyPreview());
  }
}
