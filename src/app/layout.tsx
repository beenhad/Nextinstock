import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nextinstock — Keep the listing. Change the copy.",
  description:
    "Queue copy-specific photos for replenishable preowned game listings and restock the same eBay listing safely.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
