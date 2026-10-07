import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "./globals.css";
import { FaviconCycle } from "@/components/favicon-cycle";
import { NoImageDrag } from "@/components/no-image-drag";

const title = "Next: restocks that never stop";
const description = "Line up every copy you have for an eBay listing. Each time one sells, Next puts the next one up on the same item number. Free and open source.";

export const metadata: Metadata = {
  metadataBase: new URL("https://nextinstock.com"),
  title,
  description,
  openGraph: { type: "website", url: "/", siteName: "Next", title, description },
  twitter: { card: "summary_large_image", title, description },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><FaviconCycle /><NoImageDrag />{children}</body>
    </html>
  );
}
