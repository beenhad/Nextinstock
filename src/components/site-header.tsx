import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteHeader({ hosted = false }: { hosted?: boolean }) {
  return (
    <header className="site-header">
      <div className="site-container header-main">
        <Link className="brand-link" href="/" aria-label="Nextinstock home">
          <BrandMark />
        </Link>
        <nav className="site-nav" aria-label="Main navigation">
          <a href="#built-for">Use cases</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          {!hosted && <Link href="/tool">Open tool</Link>}
        </nav>
        <a className="header-tool-link" href="#pricing">Get access</a>
      </div>
    </header>
  );
}
