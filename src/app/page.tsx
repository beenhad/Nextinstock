import {
  ArrowRight,
  Check,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { HeroScreenshot } from "@/components/hero-demo";
import { SiteHeader } from "@/components/site-header";
import { PurchaseButton } from "@/components/purchase-button";
import { RepeatStockShowcase } from "@/components/repeat-stock-showcase";
import { desktopOfferStatus, salesConfigured } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

const sellerStories = [
  {
    quote: "I don't want to rebuild a listing every time a game sells. If the next copy is already photographed, I want it waiting there.",
    initials: "GC",
    name: "GrailClub",
    role: "Game and collectibles store",
  },
  {
    quote: "The worst time to photograph the next card is right after somebody buys the last one.",
    initials: "TC",
    name: "Trading card seller",
    role: "Seller scenario",
  },
  {
    quote: "I've got more copies in the back, but that doesn't mean I want all of them listed at yesterday's price.",
    initials: "GS",
    name: "Game store owner",
    role: "Seller scenario",
  },
];

const faqs = [
  {
    question: "Does Nextinstock create a new eBay listing?",
    answer: "No. It works with an existing supported fixed-price listing and prepares the next copy for that same eBay item number.",
  },
  {
    question: "What happens with multi-variation listings?",
    answer: "You select the exact variation to monitor. Its quantity can be restocked after a sale; the listing's existing photos and shared condition stay as they are.",
  },
  {
    question: "What counts as an active restock target?",
    answer: "One monitored listing or one selected variation counts as one target. The planned launch limit is 10 active targets per plan.",
  },
  {
    question: "Does my Mac need to stay on?",
    answer: "For Desktop, yes. The local worker runs on your Mac. Cloud is planned to run monitoring online, even when your Mac is off.",
  },
];

export default function HomePage() {
  const hosted = Boolean(process.env.VERCEL);
  const canPurchase = hosted && salesConfigured();
  const configuredOffer = desktopOfferStatus();
  const previewOffer = !hosted && !configuredOffer ? { total: 10, remaining: 3 } : null;
  const desktopOffer = configuredOffer ?? previewOffer;
  const offerPreview = Boolean(previewOffer);
  const desktopPrice = desktopOffer && desktopOffer.remaining > 0 ? "$49" : "$99";
  const cloudPrice = "$9.99";

  return (
    <main>
      <SiteHeader hosted={hosted} />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">For eBay sellers with repeat stock</span>
            <h1>Keep the listing.<br />Change the copy.</h1>
            <p className="hero-lede">
              Prepare the next copy while the current one is live. After it sells,
              Nextinstock restocks the same eBay listing. For variations, it updates only the selected option&apos;s quantity.
            </p>
            <div className="hero-actions">
              <a className="primary-link hero-price-link" href="#pricing">
                <span>See plans</span>
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="text-link" href="#how-it-works">How it works</a>
            </div>
          </div>
          <div className="hero-visual-wrap">
            <HeroScreenshot />
          </div>
        </div>
      </section>

      <section className="compact-value-section" id="built-for">
        <div className="site-container">
          <div className="compact-value-intro">
            <span className="section-kicker">Made for repeat eBay listings</span>
            <h2>Sell repeat stock on your terms.</h2>
            <p>
              Keep the same item number while you control prep, visible supply, and which copy sells next.
            </p>
          </div>
          <RepeatStockShowcase />
        </div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="site-container">
          <div className="steps-heading">
            <span className="section-kicker">How it works</span>
            <h2>Three steps. Same eBay listing.</h2>
          </div>
          <div className="steps-grid">
            <article className="step-card">
              <span className="step-number">01</span>
              <strong>Choose the listing</strong>
              <p>Pick the live eBay listing you want to keep.</p>
            </article>
            <article className="step-card">
              <span className="step-number">02</span>
              <strong>Queue the next copies</strong>
              <p>Set their order and prices. Add photos and condition notes for single-item listings.</p>
            </article>
            <article className="step-card">
              <span className="step-number">03</span>
              <strong>Restock safely</strong>
              <p>After a sale, update that copy while stock stays at zero, then release one.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="seller-stories-section" id="seller-stories">
        <div className="site-container">
          <div className="seller-stories-heading">
            <div>
              <span className="section-kicker">Seller perspectives</span>
              <h2>From the seller&apos;s side.</h2>
            </div>
          </div>
          <div className="seller-stories-grid">
            {sellerStories.map((story) => (
              <article className="seller-story-card" key={story.name}>
                <span className="seller-story-quote-mark" aria-hidden="true">“</span>
                <blockquote>{story.quote}</blockquote>
                <div className="seller-story-person">
                  <span className="seller-story-avatar" aria-hidden="true">{story.initials}</span>
                  <div><strong>{story.name}</strong><span>{story.role}</span></div>
                </div>
              </article>
            ))}
          </div>
          <p className="seller-stories-note">Illustrative seller perspectives; customer quotes will follow.</p>
        </div>
      </section>

      <section className="purchase-section" id="pricing">
        <div className="site-container">
          <div className="purchase-heading">
            <span className="section-kicker">Pricing</span>
            <h2>One restock workflow. Two ways to run it.</h2>
            <p>Choose a local Mac download or hosted monitoring. Each plan is designed for up to 10 active listings or selected variations.</p>
          </div>
          <div className="purchase-plans">
            <article className="purchase-card">
              <div className="purchase-card-top"><span>Desktop</span><span className="purchase-plan-status">Mac download</span></div>
              <div className="purchase-price"><strong>{desktopPrice}</strong><span>once</span>{desktopPrice === "$49" && <s>$99 regular</s>}</div>
              <p className="purchase-price-note">Run Nextinstock on your Mac. Your queued photos and task history stay there.</p>
              {desktopOffer && (
                <div className="desktop-offer-meter">
                  <div className="desktop-offer-meter-heading">
                    <span>{offerPreview ? "Launch offer preview" : "Launch offer"}</span>
                    <strong>{desktopOffer.remaining} of {desktopOffer.total} spots left</strong>
                  </div>
                  <div className="desktop-offer-meter-track" role="progressbar" aria-label="Desktop launch spots claimed" aria-valuenow={desktopOffer.total - desktopOffer.remaining} aria-valuemin={0} aria-valuemax={desktopOffer.total}>
                    <span style={{ width: `${((desktopOffer.total - desktopOffer.remaining) / desktopOffer.total) * 100}%` }} />
                  </div>
                  <small>{offerPreview ? "Example count for this local preview. Set the real count before launch." : desktopOffer.remaining > 0 ? "Save $50 while launch spots remain." : "The launch price is filled. Standard price applies."}</small>
                </div>
              )}
              <div className="purchase-includes">
                <span><Check size={15} /> Up to 10 active restock targets</span>
                <span><Check size={15} /> Monitoring runs on your Mac</span>
                <span><Check size={15} /> Single-item and variation listings</span>
              </div>
              <PurchaseButton enabled={canPurchase} price={desktopPrice} />
              <small>The current setup needs your own eBay developer credentials and a Mac that stays on while monitoring.</small>
            </article>
            <article className="purchase-card">
              <div className="purchase-card-top"><span>Cloud</span><span className="purchase-plan-status">In development</span></div>
              <div className="purchase-price"><strong>{cloudPrice}</strong><span>/ month</span></div>
              <p className="purchase-price-note">Hosted monitoring continues while your Mac is off.</p>
              <div className="purchase-includes">
                <span><Check size={15} /> Up to 10 active restock targets</span>
                <span><Check size={15} /> Monitoring runs online</span>
                <span><Check size={15} /> Single-item and variation listings</span>
              </div>
              <div className="purchase-action"><button className="primary-link" type="button" disabled>Cloud coming soon</button></div>
              <small>Cloud access will open after account signup and hosted restocking are ready.</small>
            </article>
          </div>
          <p className="purchase-limit-note">One target is one listing or one selected variation. Plans are not available for purchase yet.</p>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="site-container faq-grid">
          <div className="faq-heading">
            <span className="section-kicker">Help and answers</span>
            <h2>Good questions before you restock.</h2>
            <p>The basics for sellers deciding how Nextinstock fits their store.</p>
          </div>
          <div className="faq-list">
            {faqs.map((item) => (
              <details className="faq-item" key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="closing-cta-section" aria-labelledby="closing-cta-title">
        <div className="site-container closing-cta">
          <div>
            <span className="section-kicker">Keep the listing moving</span>
            <h2 id="closing-cta-title">Get the next copy ready before the sale.</h2>
            <p>Pick the setup that fits your store. Desktop runs on your Mac; Cloud is being built for hosted monitoring.</p>
          </div>
          <a className="primary-link" href="#pricing">Compare plans <ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container footer-main">
          <div className="footer-brand">
            <BrandMark />
            <p>Prepare the next copy. Keep the same listing.</p>
          </div>
          <nav className="footer-nav" aria-label="Footer navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#seller-stories">Seller stories</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
        </div>
        <div className="site-container footer-bottom">
          <span>© {new Date().getFullYear()} Nextinstock</span>
          <span>Independent software for eBay sellers. Not affiliated with eBay.</span>
        </div>
      </footer>
    </main>
  );
}
