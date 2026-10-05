import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-container header-main">
        <Link className="brand-link" href="/" aria-label="Next home">
          <BrandMark />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="/#how-it-works">How it works</a>
          <a href="/#seller-story">Sellers</a>
          <a href="/#pricing">Pricing</a>
          <Link href="/docs">Docs</Link>
        </nav>
        <a className="header-tool-link" href="/#pricing">Get Desktop</a>
      </div>
    </header>
  );
}
