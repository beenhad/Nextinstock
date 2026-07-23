import Link from "next/link";
import { Bell, ChevronDown, Search, ShoppingCart } from "lucide-react";
import { BrandMark } from "./brand-mark";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-utility">
        <div className="site-container header-utility-inner">
          <div>
            <span>Hi <strong>nextinstock</strong>!</span>
            <a href="#handoff">How it works</a>
            <a href="#built-for">Built for resellers</a>
          </div>
          <div>
            <span className="header-sync-dot">eBay synced</span>
            <Link href="/tool">Restock tasks</Link>
            <button type="button" aria-label="Notifications"><Bell size={17} /></button>
            <button type="button" aria-label="Queue"><ShoppingCart size={18} /></button>
          </div>
        </div>
      </div>
      <div className="site-container header-main">
        <Link className="brand-link" href="/" aria-label="Nextinstock home">
          <BrandMark />
          <span className="brand-context">for eBay sellers</span>
        </Link>
        <a className="header-search" href="#handoff">
          <Search size={18} />
          <span>See how a listing restocks</span>
          <span className="header-search-filter">Preowned games <ChevronDown size={14} /></span>
        </a>
        <Link className="header-tool-link" href="/tool">Open tool</Link>
      </div>
    </header>
  );
}
