import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "./globals.css";
import { FaviconCycle } from "@/components/favicon-cycle";
import { NoImageDrag } from "@/components/no-image-drag";

const title = "Nextinstock — eBay restocks on the same listing";
const description = "Line up your copies once. When one sells, Nextinstock puts the next one on the same eBay item number. Free, open source, and run on your Mac.";

export const metadata: Metadata = {
  metadataBase: new URL("https://nextinstock.com"),
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: { type: "website", url: "/", siteName: "Nextinstock", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><FaviconCycle /><NoImageDrag />{children}</body>
    </html>
  );
}
