import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nextinstock — Keep the listing. Change the copy.",
  description:
    "Sell replenishable preowned inventory one copy at a time, with photos and condition notes that match each copy.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
