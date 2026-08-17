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

function amazonImageFromUrl(url: URL) {
  if (!url.hostname.includes("amazon.")) return null;
  const asin = url.pathname.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i)?.[1];
  if (!asin) return null;

  // Amazon frequently blocks page previews, but continues to expose this public
  // product image URL for canonical ASIN links.
  return `https://images-na.ssl-images-amazon.com/images/P/${asin.toUpperCase()}.01.LZZZZZZZ.jpg`;
}

async function fetchPreview(url: URL, redirectsRemaining = 2): Promise<string | null> {
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
    if (!destination) return null;
    const redirectUrl = new URL(destination, url);
    return isSupportedRetailer(redirectUrl.hostname) ? fetchPreview(redirectUrl, redirectsRemaining - 1) : null;
  }

  if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) return null;
  const html = await response.text();
  const image = getMetaContent(html, "og:image") ?? getMetaContent(html, "twitter:image");
  if (!image) return null;

  try {
    return new URL(image, url).toString();
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ imageURL: null }, { status: 400 });

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || !isSupportedRetailer(url.hostname)) {
      return NextResponse.json({ imageURL: null }, { status: 400 });
    }

    const imageURL = amazonImageFromUrl(url) ?? await fetchPreview(url);
    return NextResponse.json({ imageURL });
  } catch {
    return NextResponse.json({ imageURL: null });
  }
}
