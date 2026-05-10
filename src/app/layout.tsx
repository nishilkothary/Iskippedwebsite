import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "I Skip — Save money, change lives",
  description: "Track what you skip and donate your savings to causes you care about.",
  other: {
    "apple-mobile-web-app-title": "iSkipped",
    "apple-mobile-web-app-capable": "yes",
  },
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
      </body>
    </html>
  );
}
