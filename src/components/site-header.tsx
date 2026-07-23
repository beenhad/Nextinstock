import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMark } from "./brand-mark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-container header-inner">
        <Link className="brand-link" href="/" aria-label="Nextinstock home">
          <BrandMark />
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#handoff">How it works</a>
          <a href="#built-for">Who it&apos;s for</a>
        </nav>
        <Link className="header-tool-link" href="/tool">
          Open tool <ArrowUpRight size={15} />
        </Link>
      </div>
    </header>
  );
}
