import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { REPO_URL } from "@/lib/site";
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
          <a href="/#sellers">Sellers</a>
          <a href="/#open-source">Open source</a>
          <Link href="/docs">Docs</Link>
        </nav>
        <a className="header-tool-link" href={REPO_URL} target="_blank" rel="noreferrer"><FaGithub size={16} aria-hidden="true" /> GitHub</a>
      </div>
    </header>
  );
}
