import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CirclePause,
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
            <span className="hero-kicker"><span /> Restock automation for preowned inventory</span>
            <h1>Keep the listing.<br />Change the <em>copy.</em></h1>
            <p className="hero-lede">
              Queue the actual photos of your next preowned game. When the current one sells, Nextinstock safely restocks the same eBay listing with the right condition shown.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#handoff">
                See the handoff <ArrowDown size={15} />
              </a>
              <Link className="text-link" href="/tool">
                Open the tool <ArrowRight size={15} />
              </Link>
            </div>
            <div className="hero-proof-line">
              <span><Check size={13} /> One listing</span>
              <span><Check size={13} /> Copy-specific photos</span>
              <span><Check size={13} /> Safe at zero</span>
            </div>
          </div>
          <div className="hero-visual-wrap">
            <div className="hero-orbit hero-orbit-one" />
            <div className="hero-orbit hero-orbit-two" />
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
              <h2>Watch the listing hand off to the next copy.</h2>
            </div>
            <p>
              The account is already connected and listings are synced. This is the complete setup and restock sequence.
            </p>
          </div>
          <ProcessLoop />
        </div>
      </section>

      <section className="compact-value-section" id="built-for">
        <div className="site-container compact-value-grid">
          <div className="compact-value-intro">
            <span className="section-kicker">Built for repeat inventory</span>
            <h2>The listing repeats.<br />The condition doesn&apos;t.</h2>
            <p>
              For resellers with enough copies of the same game to replenish one listing—without pretending every used copy looks identical.
            </p>
          </div>
          <div className="compact-benefits">
            <article>
              <span><ImageIcon size={18} /></span>
              <div><strong>Photograph ahead</strong><p>Prepare the next physical copy while today&apos;s copy is still live.</p></div>
            </article>
            <article>
              <span><PackageCheck size={18} /></span>
              <div><strong>Restock after sale</strong><p>Reuse the same item number, watchers, and listing history.</p></div>
            </article>
            <article>
              <span><CirclePause size={18} /></span>
              <div><strong>Fail safely</strong><p>If the queued copy is incomplete, quantity stays at zero.</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="compact-cta-section">
        <div className="site-container compact-cta-inner">
          <div className="compact-cta-shield"><ShieldCheck size={23} /></div>
          <div>
            <span>One queue per condition tier</span>
            <strong>Complete, disc-only, and regional variants stay separate.</strong>
          </div>
          <Link className="primary-link primary-link-light" href="/tool">
            Open Nextinstock <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container footer-inner">
          <BrandMark />
          <p>Condition-aware restocking for preowned inventory.</p>
          <span>Designed for game resellers.</span>
        </div>
      </footer>
    </main>
  );
}
