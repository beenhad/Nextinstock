import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronRight,
  CirclePause,
  GalleryHorizontalEnd,
  History,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { HeroDemo } from "@/components/hero-demo";
import { SiteHeader } from "@/components/site-header";

const steps = [
  {
    number: "01",
    icon: Camera,
    title: "Photograph the next copy",
    body: "Add the actual condition photos while the current copy is still live.",
  },
  {
    number: "02",
    icon: GalleryHorizontalEnd,
    title: "Put it in line",
    body: "Order the photos, note the wear, and mark the copy ready to sell.",
  },
  {
    number: "03",
    icon: History,
    title: "Keep the listing moving",
    body: "When the live copy sells, the next ready copy takes its place.",
  },
];

export default function HomePage() {
  return (
    <main>
      <SiteHeader />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker"><ScanLine size={16} /> Built for preowned game sellers</span>
            <h1>Queue the copy that sells <em>next.</em></h1>
            <p className="hero-lede">
              Keep one replenishable listing moving without showing the wrong item. Photograph the next copy now; Nextinstock handles the handoff after a sale.
            </p>
            <div className="hero-actions">
              <Link className="primary-link" href="/tool">
                Try the tool <ArrowRight size={16} />
              </Link>
              <a className="text-link" href="#how-it-works">
                See how it works <ChevronRight size={15} />
              </a>
            </div>
            <div className="hero-proof-line">
              <span><Check size={14} /> Same listing history</span>
              <span><Check size={14} /> Copy-specific photos</span>
              <span><Check size={14} /> Safe at zero stock</span>
            </div>
          </div>
          <div className="hero-demo-wrap">
            <HeroDemo />
            <span className="hero-demo-caption">Interactive preview — go ahead, sell it.</span>
          </div>
        </div>
      </section>

      <section className="continuity-strip" aria-label="The Nextinstock handoff">
        <div className="site-container continuity-inner">
          <span>Copy A sells</span>
          <ArrowRight size={16} />
          <span>Listing pauses at zero</span>
          <ArrowRight size={16} />
          <span>Copy B photos go live</span>
          <ArrowRight size={16} />
          <strong>Same listing continues</strong>
        </div>
      </section>

      <section className="problem-section">
        <div className="site-container problem-grid">
          <div>
            <span className="section-kicker">Why this exists</span>
            <h2>Your listing repeats.<br />The item&apos;s condition doesn&apos;t.</h2>
          </div>
          <div className="problem-copy">
            <p>
              Replenishable listings work beautifully for games you stock again and again—until every used copy has different scratches, stickers, inserts, or case wear.
            </p>
            <p>
              Nextinstock separates the reusable listing from the physical copy. The title and sales history stay put. The photos and condition move forward with inventory.
            </p>
          </div>
        </div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="site-container">
          <div className="section-heading-row">
            <div>
              <span className="section-kicker">The workflow</span>
              <h2>Photograph once. Keep selling.</h2>
            </div>
            <Link className="text-link text-link-dark" href="/tool">
              Open the prototype <ArrowRight size={15} />
            </Link>
          </div>
          <div className="steps-grid">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <article className="step-card" key={step.number}>
                  <div className="step-card-top">
                    <span className="step-number">{step.number}</span>
                    <span className="step-icon"><Icon size={20} /></span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="safety-section">
        <div className="site-container safety-grid">
          <div className="safety-visual">
            <div className="safety-listing-card">
              <span className="safety-label">Listing state</span>
              <strong>Out of stock</strong>
              <span>Hidden from buyers while the next copy is prepared.</span>
              <div className="safety-progress"><span /></div>
            </div>
            <div className="safety-badge"><ShieldCheck size={20} /> Safe handoff</div>
          </div>
          <div className="safety-copy">
            <span className="section-kicker">A deliberate pause</span>
            <h2>The listing only returns when the next copy is ready.</h2>
            <p>
              If photos are missing or an update fails, quantity stays at zero. The listing pauses instead of selling a copy under stale condition photos.
            </p>
            <ul>
              <li><CirclePause size={17} /> Empty queues stop safely</li>
              <li><ShieldCheck size={17} /> Every handoff is checked</li>
              <li><History size={17} /> Changes stay visible in activity</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="fit-section" id="built-for">
        <div className="site-container fit-grid">
          <div className="fit-copy">
            <span className="section-kicker">Built for the repeat shelf</span>
            <h2>Enough copies to need a queue. Too much variation for stock photos.</h2>
            <p>
              Ideal for established resellers with repeat inventory in loose cartridges, disc-only games, complete copies, and other clearly separated condition tiers.
            </p>
            <Link className="primary-link" href="/tool">
              Explore the tool <ArrowRight size={16} />
            </Link>
          </div>
          <div className="fit-matrix">
            <div className="fit-row fit-row-head">
              <span>Good fit</span><span>Separate queue</span>
            </div>
            <div className="fit-row"><span>Same title and edition</span><Check size={16} /></div>
            <div className="fit-row"><span>Same completeness tier</span><Check size={16} /></div>
            <div className="fit-row"><span>Different region or variant</span><ArrowRight size={16} /></div>
            <div className="fit-row"><span>Disc-only vs. complete</span><ArrowRight size={16} /></div>
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="site-container final-cta-inner">
          <div>
            <span className="section-kicker">Your next copy is waiting</span>
            <h2>See the whole handoff in the tool.</h2>
          </div>
          <Link className="primary-link primary-link-light" href="/tool">
            Open Nextinstock <ArrowRight size={16} />
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
