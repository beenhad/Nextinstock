import {
  ArrowRight,
  Check,
  Mail,
} from "lucide-react";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa";
import { BrandMark } from "@/components/brand-mark";
import { HeroScreenshot } from "@/components/hero-demo";
import { SiteHeader } from "@/components/site-header";
import { PurchaseButton } from "@/components/purchase-button";
import { OfferMeter } from "@/components/offer-meter";
import { checkoutMode, desktopOfferStatus } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

const useCases = [
  { category: "PREOWNED GAMES", title: "Keep the item number.", detail: "Prepare each copy with its own photos, condition note, and price before the current one sells." },
  { category: "CARDS & COLLECTIBLES", title: "Queue limited stock.", detail: "Line up the next physical copy while the listing is still active." },
  { category: "VARIATION LISTINGS", title: "Restock one option.", detail: "Target its quantity and optional price while the listing's shared photos stay in place." },
];

const howItWorks = [
  { title: "Choose a listing", detail: "Pick the eBay listing you want to keep." },
  { title: "Prepare the next copy", detail: "Add its photos, condition, and price ahead of time." },
  { title: "Restock after a sale", detail: "Next updates the same listing when the current copy sells." },
];

const sellerStories = [
  { quote: "I don't want to rebuild a listing every time a game sells. If the next copy is already photographed, I want it waiting there.", initials: "GC", name: "GrailClub", role: "Game and collectibles store" },
  { quote: "The worst time to photograph the next card is right after somebody buys the last one.", initials: "TC", name: "Trading card seller", role: "Seller scenario" },
  { quote: "I've got more copies in the back, but that doesn't mean I want all of them listed at yesterday's price.", initials: "GS", name: "Game store owner", role: "Seller scenario" },
];

const faqs = [
  {
    question: "Does Nextinstock create a new eBay listing?",
    answer: "No. It prepares the next copy for an existing supported fixed-price listing, keeping the same item number.",
  },
  {
    question: "What happens with multi-variation listings?",
    answer: "Choose the variation to watch. After a sale, Nextinstock can update its quantity. Photos and shared listing details stay as they are.",
  },
  {
    question: "Can I run more than one restock task?",
    answer: "Yes. Queue as many active restock tasks as you need. One task watches one listing or selected variation.",
  },
  {
    question: "Does my Mac need to stay on?",
    answer: "Yes. Desktop monitors from your Mac, so it must be on and connected.",
  },
];

export default function HomePage() {
  const hosted = Boolean(process.env.VERCEL);
  const mode = checkoutMode();
  const configuredOffer = desktopOfferStatus();
  const previewOffer = !hosted && !configuredOffer && !mode ? { total: 10, remaining: 3 } : null;
  const desktopOffer = configuredOffer ?? previewOffer;
  const desktopPrice = desktopOffer && desktopOffer.remaining > 0 ? "$49" : "$99";
  const cloudPrice = "$9.99";

  return (
    <main>
      <SiteHeader />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">Automated restocks for eBay sellers</span>
            <h1>Restock less.<br />Keep selling.</h1>
            <p className="hero-lede">
              Queue the next copy once. When this one sells, Next updates the same eBay listing automatically.
            </p>
            <div className="hero-actions">
              <a className="primary-link hero-price-link" href="#pricing">
                <span>See Desktop</span>
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

      <section className="compact-value-section" id="how-it-works">
        <div className="site-container">
          <div className="compact-value-intro">
            <span className="section-kicker">How it works</span>
            <h2>Three steps. Same listing.</h2>
          </div>
          <ol className="how-steps">
            {howItWorks.map((step, index) => <li key={step.title}>
              <span className="how-step-number">0{index + 1}</span>
              <div><h3>{step.title}</h3><p>{step.detail}</p></div>
            </li>)}
          </ol>
        </div>
      </section>

      <section className="use-cases-section" id="use-cases">
        <div className="site-container">
          <div className="use-cases-heading">
            <span className="section-kicker">Built for repeat stock</span>
            <h2>One less listing to rebuild.</h2>
          </div>
          <div className="use-cases-grid">
            {useCases.map((item, index) => <article className="use-case" key={item.category}>
              <span className="use-case-index">0{index + 1} / {item.category}</span>
              <h3>{item.title}</h3>
              <p>{item.detail}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section className="seller-stories-section" id="seller-story">
        <div className="site-container">
          <div className="seller-stories-heading">
            <div>
              <span className="section-kicker">Seller perspectives</span>
              <h2>From the seller&apos;s side.</h2>
            </div>
          </div>
          <div className="seller-stories-grid">
            {sellerStories.map((story) => <article className="seller-story-card" key={story.name}>
              <span className="seller-story-quote-mark" aria-hidden="true">“</span>
              <blockquote>{story.quote}</blockquote>
              <div className="seller-story-person">
                <span className="seller-story-avatar" aria-hidden="true">{story.initials}</span>
                <div><strong>{story.name}</strong><span>{story.role}</span></div>
              </div>
            </article>)}
          </div>
          <p className="seller-stories-note">Illustrative seller perspectives; customer quotes will follow.</p>
        </div>
      </section>

      <section className="purchase-section" id="pricing">
        <div className="site-container">
          <div className="purchase-heading">
            <span className="section-kicker">Pricing</span>
            <h2>Keep stock moving.</h2>
            <p>Run restocks on your Mac, or join the Cloud waitlist.</p>
          </div>
          <div className="purchase-plans">
            <article className="purchase-card purchase-card-desktop">
              <div className="purchase-card-top"><span>Desktop</span><span className="purchase-plan-status"><FaApple aria-hidden="true" /> Mac download</span></div>
              <div className="purchase-card-intro">
                {desktopPrice === "$49" && <div className="purchase-sale-line"><span>Early bird special</span><s>Planned regular $99</s><strong>Save $50</strong></div>}
                <div className="purchase-price"><strong>{desktopPrice}</strong><span>one-time payment</span></div>
                <p className="purchase-price-note">Your queue, photos, and monitoring stay on your Mac.</p>
                <div className="purchase-platforms" aria-label="Desktop platform availability">
                  <span className="is-available"><FaApple aria-hidden="true" /> macOS <b>Available</b></span>
                  <span><FaWindows aria-hidden="true" /> Windows <small>Not yet</small></span>
                  <span><FaLinux aria-hidden="true" /> Linux <small>Not yet</small></span>
                </div>
              </div>
              <div className="purchase-card-info">
                {desktopOffer && <OfferMeter total={desktopOffer.total} remaining={desktopOffer.remaining} />}
              </div>
              <div className="purchase-card-benefits">
                <span className="purchase-benefits-label">WHAT YOU GET</span>
                <div className="purchase-includes">
                  <span><Check size={15} /> Unlimited active restock tasks</span>
                  <span><Check size={15} /> Monitoring runs on your Mac</span>
                  <span><Check size={15} /> Single-item and variation listings</span>
                </div>
              </div>
              <PurchaseButton mode={mode} price={desktopPrice} />
            </article>
            <article className="purchase-card purchase-card-cloud">
              <div className="purchase-card-top"><span>Cloud</span><span className="purchase-plan-status">Waitlist open</span></div>
              <div className="purchase-card-intro">
                <div className="purchase-price"><strong>{cloudPrice}</strong><span>/ month planned</span></div>
                <p className="purchase-price-note">Restocks keep running while your Mac is off.</p>
              </div>
              <div className="purchase-card-info purchase-cloud-note">Join the list for the launch announcement. Decide when Cloud is ready.</div>
              <div className="purchase-card-benefits">
                <span className="purchase-benefits-label">PLANNED FOR CLOUD</span>
                <div className="purchase-includes">
                  <span><Check size={15} /> Hosted monitoring</span>
                  <span><Check size={15} /> Your Mac can stay off</span>
                  <span><Check size={15} /> Single-item and variation listings</span>
                </div>
              </div>
              <div className="purchase-action"><a className="primary-link" aria-label="Join Cloud waitlist by email" href="mailto:nextinstock@grayshapes.com?subject=Nextinstock%20Cloud%20waitlist&amp;body=Please%20add%20me%20to%20the%20Nextinstock%20Cloud%20waitlist.">Join waitlist <Mail size={16} aria-hidden="true" /></a></div>
            </article>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="site-container faq-grid">
          <div className="faq-heading">
            <span className="section-kicker">FAQ</span>
            <h2>A few things to know.</h2>
            <p>Clear answers before you start.</p>
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
            <span className="section-kicker">Ready for the next copy?</span>
            <h2 id="closing-cta-title">Sell it. Restock it. Keep your listing.</h2>
            <p>Get the next one ready while this one is still selling.</p>
          </div>
          <a className="primary-link" href="#pricing">See Desktop <ArrowRight size={17} aria-hidden="true" /></a>
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
            <a href="#seller-story">Seller story</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/docs">Setup docs</a>
          </nav>
        </div>
        <div className="site-container footer-bottom">
          <span>© {new Date().getFullYear()} Next</span>
          <span>Independent software for eBay sellers. Not affiliated with eBay.</span>
        </div>
      </footer>
    </main>
  );
}
