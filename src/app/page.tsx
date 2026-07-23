import Link from "next/link";
import {
  ArrowRight,
  Check,
  Clock3,
  ImageIcon,
  PackageCheck,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { HeroScreenshot, ProcessLoop } from "@/components/hero-demo";
import { SiteHeader } from "@/components/site-header";

export default function HomePage() {
  return (
    <main>
      <SiteHeader />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">Built for repeat preowned inventory</span>
            <h1>Keep the listing.<br />Change the copy.</h1>
            <p className="hero-lede">
              Queue the actual photos of the next game. When today&apos;s copy sells,
              Nextinstock updates the same eBay listing with the correct condition
              before quantity returns to one.
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href="/tool">Open the tool</Link>
              <a className="text-link" href="#handoff">See the handoff <ArrowRight size={16} /></a>
            </div>
            <div className="hero-proof-line">
              <span><Check size={14} /> One item number</span>
              <span><Check size={14} /> Copy-specific photos</span>
              <span><Check size={14} /> Safe at zero</span>
            </div>
          </div>
          <div className="hero-visual-wrap">
            <HeroScreenshot />
            <div className="hero-float-note">
              <span className="hero-float-icon"><Check size={13} /></span>
              <span><strong>Next copy ready</strong><small>6 photos verified</small></span>
            </div>
          </div>
        </div>
      </section>

      <section className="handoff-section" id="handoff">
        <div className="site-container">
          <div className="compact-section-heading">
            <div>
              <span className="section-kicker">From sold to live again</span>
              <h2>The complete handoff, in the interfaces that do it.</h2>
            </div>
            <p>
              Switch between the Nextinstock task and the eBay listing. Both are live,
              clickable sequences—not a prerecorded video.
            </p>
          </div>
          <ProcessLoop />
        </div>
      </section>

      <section className="compact-value-section" id="built-for">
        <div className="site-container compact-value-grid">
          <div className="compact-value-intro">
            <span className="section-kicker">Why resellers use it</span>
            <h2>The listing repeats.<br />The condition never does.</h2>
            <p>
              Keep the history attached to a replenishable listing without showing
              buyers photos from a different physical copy.
            </p>
          </div>
          <div className="compact-benefits">
            <article>
              <span><ImageIcon size={18} /></span>
              <div><strong>Photograph ahead</strong><p>Prepare the next physical copy while the current one is still live.</p></div>
            </article>
            <article>
              <span><PackageCheck size={18} /></span>
              <div><strong>Keep the listing</strong><p>Reuse the same item number, watchers, and sales history.</p></div>
            </article>
            <article>
              <span><Clock3 size={18} /></span>
              <div><strong>Skip the stop-start</strong><p>Queue condition work in batches instead of returning after every sale.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="compact-cta-section">
        <div className="site-container compact-cta-inner">
          <div className="compact-cta-shield"><ShieldCheck size={23} /></div>
          <div>
            <span>Safe-zero protection</span>
            <strong>If the next copy is incomplete, the listing stays unavailable.</strong>
          </div>
          <Link className="primary-link primary-link-light" href="/tool">Open Nextinstock</Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container footer-inner">
          <BrandMark />
          <p>Condition-aware restocking for preowned inventory.</p>
          <span>Independent software for eBay game sellers.</span>
        </div>
      </footer>
    </main>
  );
}
