import { ArrowRight, BookOpen, Check, Scale, Star } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { BrandMark } from "@/components/brand-mark";
import { CopyCommand } from "@/components/copy-command";
import { SiteHeader } from "@/components/site-header";
import { RepeatStockShowcase } from "@/components/repeat-stock-showcase";
import { HeroReleaseLine } from "@/components/hero-release-line";
import { REPO_URL } from "@/lib/site";

const sellerStories = [
  { quote: "Had six sealed ETBs and was relisting one by hand every time it sold. Now I line them all up, bump each one a dollar, and go to bed. Woke up to two sales and the listing never went dark.", initials: "HH", who: "Holo Hollow", what: "Pokémon" },
  { quote: "Every raw copy of the same rookie is a little different. I shoot each one, give it its own price, and the buyer gets the exact card in the photos. One listing, sold count keeps climbing.", initials: "TT", who: "Toploader Tuesday", what: "Sports cards" },
  { quote: "One copy in the display case, four in the back. I used to forget to relist the second one sold. Now the next one is up before I'm done packing the first.", initials: "BR", who: "Back Room Bargains", what: "Video games" },
  { quote: "Anything over a couple hundred I set to When I say so. Discord pings me, I give it a once-over, hit Put it up. Everything cheaper just runs on its own.", initials: "AG", who: "Attic Grails", what: "Collectibles" },
  { quote: "I test every console myself and no two look the same. Each one gets its own photos and grade, and I haven't rebuilt a listing from scratch since.", initials: "CC", who: "Cartridge Cove", what: "Retro consoles" },
  { quote: "Same pressing, different wear. I grade them, sort worst to best, and the cheap copies go first while the clean ones wait. Honestly kind of fun to watch.", initials: "GP", who: "Groove Pantry", what: "Vinyl records" },
];

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Nextinstock",
  url: "https://nextinstock.com/",
  description: "Free, open-source software that restocks the same eBay listing after each sale.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "macOS",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const faqs = [
  {
    question: "Is it really free?",
    answer: "Yes. Next is open source under the MIT license. Clone it, run it, change it. There is no account, subscription, or paid tier.",
  },
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
    answer: "Yes. It starts in dry-run mode, which shows exactly what Next would change on eBay without changing anything. Switch to live when you are happy with the plan.",
  },
  {
    question: "Where does it run, and what do I need?",
    answer: "On your own computer, so it needs to stay on while it watches your listings. You need Node.js 22 or newer and your own eBay developer keys. The setup guide walks through both.",
  },
  {
    question: "Can I contribute?",
    answer: "Please do. Open an issue for bugs or ideas, or send a pull request. The README covers how the code is laid out.",
  },
];

const installCommand = `git clone ${REPO_URL}.git
cd Nextinstock
npm ci && npm run setup:local
npm run build && npm run start:local`;

export default function HomePage() {
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <SiteHeader />

      <section className="hero-section">
        <div className="site-container hero-grid">
          <div className="hero-copy">
            <span className="hero-kicker">Free and open source for eBay sellers</span>
            <h1>Restocks that never stop.</h1>
            <p className="hero-lede">
              Line up every copy you have for a listing, once. Each time one sells, Next puts the next one up on the same eBay item number. No relisting, no babysitting.
            </p>
            <div className="hero-actions">
              <a className="primary-link hero-price-link" href={REPO_URL} target="_blank" rel="noreferrer">
                <FaGithub size={17} aria-hidden="true" />
                <span>Get it on GitHub</span>
              </a>
              <a className="text-link" href="#how-it-works">See how it works</a>
            </div>
          </div>
          <div className="hero-visual-wrap">
            <HeroReleaseLine />
          </div>
        </div>
      </section>

      <section className="steps-section" id="how-it-works">
        <div className="site-container">
          <div className="section-intro">
            <span className="section-kicker">How it works</span>
            <h2>Set it up once. Every sale restocks itself.</h2>
            <p>Set up each listing once. After that, Next does the restocking.</p>
          </div>
          <RepeatStockShowcase />
        </div>
      </section>

      <section className="seller-stories-section" id="sellers">
        <div className="site-container">
          <div className="seller-stories-heading">
            <div>
              <span className="section-kicker">Seller stories</span>
              <h2>Anyone selling more than one of something.</h2>
            </div>
          </div>
        </div>
        <div className="seller-scroller" tabIndex={0} aria-label="How different sellers use Next">
          {sellerStories.map((story) => <article className="seller-story-card" key={story.who}>
            <span className="seller-story-quote-mark" aria-hidden="true">&ldquo;</span>
            <blockquote>{story.quote}</blockquote>
            <div className="seller-story-person">
              <span className="seller-story-avatar" aria-hidden="true">{story.initials}</span>
              <div><strong>{story.who}</strong><span>{story.what}</span></div>
            </div>
          </article>)}
        </div>
        <div className="site-container"><p className="seller-stories-note">Example stories showing how different sellers use Next. Store names are made up.</p></div>
      </section>

      <section className="oss-section" id="open-source">
        <div className="site-container oss-grid">
          <div className="oss-copy">
            <span className="section-kicker">Open source</span>
            <h2>Free. On your machine.<br />Yours to change.</h2>
            <p>Next runs on your own computer with your own eBay keys. No account, no subscription, no one between you and your listings. Read every line, fork it, or send a fix back.</p>
            <ul className="oss-points">
              <li><Check size={16} aria-hidden="true" /> Single listings and variations</li>
              <li><Check size={16} aria-hidden="true" /> Unlimited restock tasks</li>
              <li><Check size={16} aria-hidden="true" /> Discord alerts for sales and restocks</li>
              <li><Check size={16} aria-hidden="true" /> Dry-run mode before anything goes live</li>
            </ul>
          </div>
          <div className="oss-card">
            <a className="oss-repo" href={REPO_URL} target="_blank" rel="noreferrer">
              <FaGithub size={30} aria-hidden="true" />
              <span><small>github.com</small><strong>beenhad/Nextinstock</strong></span>
              <ArrowRight size={18} aria-hidden="true" />
            </a>
            <div className="oss-meta">
              <span><Scale size={14} aria-hidden="true" /> MIT license</span>
              <span><span className="oss-dot" aria-hidden="true" /> TypeScript · Next.js</span>
              <span>Runs on macOS</span>
            </div>
            <CopyCommand command={installCommand} />
            <div className="oss-actions">
              <a className="primary-link" href={REPO_URL} target="_blank" rel="noreferrer"><Star size={16} aria-hidden="true" /> Star on GitHub</a>
              <a className="oss-secondary" href="/docs"><BookOpen size={16} aria-hidden="true" /> Setup guide</a>
            </div>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq">
        <div className="site-container faq-grid">
          <div className="faq-heading">
            <span className="section-kicker">FAQ</span>
            <h2>Before you queue anything.</h2>
            <p>The short answers. The setup guide has the long ones.</p>
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
            <p>Clone it tonight. Queue the next copy. Let it go live while you pack the last one.</p>
          </div>
          <a className="primary-link" href={REPO_URL} target="_blank" rel="noreferrer"><FaGithub size={17} aria-hidden="true" /> View on GitHub</a>
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
            <a href="#sellers">Feedback</a>
            <a href="#open-source">Open source</a>
            <a href="#faq">FAQ</a>
            <a href="/docs">Setup guide</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
        <div className="site-container footer-bottom">
          <span>MIT licensed. Independent software for eBay sellers.</span>
          <span>Not affiliated with eBay.</span>
        </div>
      </footer>
    </main>
  );
}
