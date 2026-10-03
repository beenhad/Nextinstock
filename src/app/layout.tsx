import type { Metadata } from "next";
import "@ebay/skin/index.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Next — Restock less. Keep selling.",
  description:
    "Queue the next copy. Restock the same eBay listing after it sells.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
