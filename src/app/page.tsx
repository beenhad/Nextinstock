import {
  ArrowRight,
  Check,
  Mail,
} from "lucide-react";
import { FaApple } from "react-icons/fa";
import { BrandMark } from "@/components/brand-mark";
import { HeroScreenshot } from "@/components/hero-demo";
import { SiteHeader } from "@/components/site-header";
import { PurchaseButton } from "@/components/purchase-button";
import { OfferMeter } from "@/components/offer-meter";
import { RepeatStockShowcase } from "@/components/repeat-stock-showcase";
import { checkoutMode, desktopOfferStatus } from "@/lib/server/stripe";

export const dynamic = "force-dynamic";

const useCases = [
  {
    category: "PREOWNED GAMES",
    title: "Every copy gets its own photos.",
    detail: "Scratched disc, missing manual, price sticker on the case. Buyers see the copy they will actually get, and the listing keeps its sold count.",
  },
  {
    category: "CARDS & SEALED",
    title: "Price the next one before it sells.",
    detail: "Market moved since you listed? Set each queued copy\u2019s price when you shoot it, so the restock goes up at today\u2019s number.",
  },
  {
    category: "VARIATION LISTINGS",
    title: "Restock one color. Leave the rest alone.",
    detail: "Pick the option that sold out. Next updates that option\u2019s quantity and price, and your shared photos stay exactly as they are.",
  },
];

const sellerStories = [
  {
    quote: "I refurb GameCube controllers and sell every color off one variation listing. When a color sells out, the next one is already queued, so that option never sits dark.",
    initials: "GC",
    name: "Derek, GrailClub",
    role: "Top Rated eBay store \u00b7 built Next for it",
    tag: "Our store",
  },
  {
    quote: "Booster boxes move a few dollars a week. I set the price on each box in the queue when I photograph it, so a restock never goes up at last month\u2019s number.",
    initials: "TC",
    name: "Sealed card seller",
    role: "Sells booster boxes and ETBs",
    tag: "Example",
  },
  {
    quote: "One copy sits in the case at the shop and three more are in the back. I shoot all three on a slow Tuesday, queue them, and stop thinking about that listing.",
    initials: "GS",
    name: "Used game shop",
    role: "Storefront with an eBay side",
    tag: "Example",
  },
];

const faqs = [
  {
    question: "Does Next make a new listing when something sells?",
    answer: "No. It restocks the listing you already have, so the item number and sold count stay put. It works with fixed-price, Good \u2019Til Cancelled listings that have Out-of-Stock Control turned on.",
  },
  {
    question: "What happens on a variation listing?",
    answer: "You pick the exact option to watch. When it sells out, Next updates that option\u2019s quantity and price. Your listing photos and shared details are not touched.",
  },
  {
    question: "Can I test it before it touches a real listing?",
    answer: "Yes. Dry-run mode shows you exactly what Next would change on eBay without changing anything. Switch to live when you are happy with the plan.",
  },
  {
    question: "Does my Mac need to stay on?",
    answer: "For Desktop, yes. It watches your listings from your Mac. Cloud is planned for sellers who want it running while the Mac is off.",
  },
  {
    question: "What do I need to set it up?",
    answer: "A Mac and your own eBay developer keys for now. The setup guide walks you through getting them and connecting your store.",
  },
];

export default function HomePage() {
  const hosted = Boolean(process.env.VERCEL);
  const mode = checkoutMode();
  const configuredOffer = desktopOfferStatus();
  const previewOffer = !hosted && !configuredOffer && !mode ? { total: 10, remaining: 3 } : null;
  const desktopOffer = configuredOffer ?? previewOffer;
  const onSale = Boolean(desktopOffer && desktopOffer.remaining > 0);
  const desktopPrice = onSale ? "$49" : "$99";
  const cloudPrice = "$9.99";

  return (
    <main>
      <SiteHeader />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">For eBay sellers with more than one of something</span>
            <h1>One sold.<br />The next one&apos;s up.</h1>
            <p className="hero-lede">
              Photograph your next copies ahead of time. When the current one sells, Next swaps in the next copy&apos;s photos, condition, and price on the same listing. Same item number, same sold count.
            </p>
            <div className="hero-actions">
              <a className="primary-link hero-price-link" href="#pricing">
                <span>{onSale ? "Get Desktop for $49" : "Get Desktop"}</span>
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <a className="text-link" href="#how-it-works">See how it works</a>
            </div>
          </div>
          <div className="hero-visual-wrap">
            <HeroScreenshot />
          </div>
        </div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="site-container">
          <div className="section-intro">
            <span className="section-kicker">How it works</span>
            <h2>Sold to live again, on the same item number.</h2>
            <p>Set it up once per listing. After that, a sale is the only thing that has to happen.</p>
          </div>
          <RepeatStockShowcase />
        </div>
      </section>

      <section className="use-cases-section" id="use-cases">
        <div className="site-container">
          <div className="use-cases-heading">
            <span className="section-kicker">Built for repeat stock</span>
            <h2>More than one of it.<br />No two exactly alike.</h2>
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
              <span className="section-kicker">How sellers run it</span>
              <h2>Same tool. Three kinds of shelf.</h2>
            </div>
          </div>
          <div className="seller-stories-grid">
            {sellerStories.map((story) => <article className="seller-story-card" key={story.name}>
              <div className="seller-story-top">
                <span className="seller-story-quote-mark" aria-hidden="true">&ldquo;</span>
                <span className="seller-story-tag">{story.tag}</span>
              </div>
              <blockquote>{story.quote}</blockquote>
              <div className="seller-story-person">
                <span className="seller-story-avatar" aria-hidden="true">{story.initials}</span>
                <div><strong>{story.name}</strong><span>{story.role}</span></div>
              </div>
            </article>)}
          </div>
          <p className="seller-stories-note">Examples show common ways sellers use Next. Customer reviews will go here as they come in.</p>
        </div>
      </section>

      <section className="purchase-section" id="pricing">
        <div className="site-container">
          <div className="purchase-heading">
            <span className="section-kicker">Pricing</span>
            <h2>Pay once. Run it on your Mac.</h2>
            <p>Desktop is a one-time purchase. Cloud is coming for sellers who want it running with the Mac off.</p>
          </div>
          <div className="purchase-plans">
            <article className={`purchase-card purchase-card-desktop${onSale ? " is-on-sale" : ""}`}>
              <div className="purchase-card-top"><span>Desktop</span><span className="purchase-plan-status"><FaApple aria-hidden="true" /> Mac download</span></div>
              <div className="purchase-card-intro">
                {onSale && <div className="purchase-sale-line"><s>$99</s><strong>Save $50</strong></div>}
                <div className="purchase-price"><strong>{desktopPrice}</strong><span>one time, yours to keep</span></div>
                <p className="purchase-price-note">Runs on your Mac. Your queue and photos never leave it.</p>
              </div>
              <div className="purchase-card-info">
                {desktopOffer && <OfferMeter total={desktopOffer.total} remaining={desktopOffer.remaining} preview={Boolean(previewOffer)} />}
              </div>
              <div className="purchase-card-benefits">
                <span className="purchase-benefits-label">WHAT YOU GET</span>
                <div className="purchase-includes">
                  <span><Check size={15} /> Unlimited restock tasks</span>
                  <span><Check size={15} /> Single listings and variations</span>
                  <span><Check size={15} /> Discord alerts for sales and restocks</span>
                  <span><Check size={15} /> Dry-run mode before anything goes live</span>
                </div>
              </div>
              <PurchaseButton mode={mode} price={desktopPrice} />
            </article>
            <article className="purchase-card purchase-card-cloud">
              <div className="purchase-card-top"><span>Cloud</span><span className="purchase-plan-status">Waitlist open</span></div>
              <div className="purchase-card-intro">
                <div className="purchase-price"><strong>{cloudPrice}</strong><span>/ month, planned</span></div>
                <p className="purchase-price-note">The same restocks, running on our servers while your Mac is off.</p>
              </div>
              <div className="purchase-card-info purchase-cloud-note">Join the list and we will email you once when Cloud opens. No spam, no commitment.</div>
              <div className="purchase-card-benefits">
                <span className="purchase-benefits-label">PLANNED FOR CLOUD</span>
                <div className="purchase-includes">
                  <span><Check size={15} /> Runs with your Mac off</span>
                  <span><Check size={15} /> Single listings and variations</span>
                  <span><Check size={15} /> Discord alerts for sales and restocks</span>
                </div>
              </div>
              <div className="purchase-action"><a className="primary-link primary-link-quiet" aria-label="Join the Cloud waitlist by email" href="mailto:nextinstock@grayshapes.com?subject=Nextinstock%20Cloud%20waitlist&amp;body=Please%20add%20me%20to%20the%20Nextinstock%20Cloud%20waitlist.">Join the waitlist <Mail size={16} aria-hidden="true" /></a></div>
            </article>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="site-container faq-grid">
          <div className="faq-heading">
            <span className="section-kicker">FAQ</span>
            <h2>Before you queue anything.</h2>
            <p>The short answers. The setup docs have the long ones.</p>
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
            <span className="section-kicker">Next sale, next copy</span>
            <h2 id="closing-cta-title">Stop rebuilding listings that already sell.</h2>
            <p>Queue the next copy tonight. Let it go live while you pack the last one.</p>
          </div>
          <a className="primary-link" href="#pricing">{onSale ? "Get Desktop for $49" : "Get Desktop"} <ArrowRight size={17} aria-hidden="true" /></a>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-container footer-main">
          <div className="footer-brand">
            <BrandMark />
            <p>Queue the next copy. Keep the same listing.</p>
          </div>
          <nav className="footer-nav" aria-label="Footer navigation">
            <a href="#how-it-works">How it works</a>
            <a href="#seller-story">Sellers</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/docs">Setup docs</a>
          </nav>
        </div>
        <div className="site-container footer-bottom">
          <span>&copy; {new Date().getFullYear()} Next in stock</span>
          <span>Independent software for eBay sellers. Not affiliated with eBay.</span>
        </div>
      </footer>
    </main>
  );
}
