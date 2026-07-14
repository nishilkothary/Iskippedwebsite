import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import { Toaster } from "sonner";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

function getMetadataBase() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    "http://localhost:3000";

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  return new URL(url);
}

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "Iskipped - Save money, change lives",
  description: "Track what you skip and donate your savings to causes you care about.",
  openGraph: {
    title: "Iskipped - Save money, change lives",
    description: "Track what you skip and donate your savings to causes you care about.",
  },
  other: {
    "apple-mobile-web-app-title": "iSkipped",
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B1A14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-WSEL7FDPLJ" strategy="afterInteractive" />
        <Script id="gtag-init" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-WSEL7FDPLJ');
        `}</Script>
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: "var(--bg-surface-1)",
              border: "1px solid var(--border-emphasis)",
              color: "var(--text-primary)",
              borderRadius: "14px",
            },
          }}
        />
      </body>
    </html>
  );
}
