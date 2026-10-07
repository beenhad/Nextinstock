import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "./globals.css";
import { FaviconCycle } from "@/components/favicon-cycle";

export const metadata: Metadata = {
  title: "Next in stock: restock the same eBay listing after it sells",
  description:
    "Queue the next copy. Restock the same eBay listing after it sells.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><FaviconCycle />{children}</body>
    </html>
  );
}
