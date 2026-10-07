import { ArrowRight, BookOpen, Check, Scale, Star } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { BrandMark } from "@/components/brand-mark";
import { CopyCommand } from "@/components/copy-command";
import { SiteHeader } from "@/components/site-header";
import { RepeatStockShowcase } from "@/components/repeat-stock-showcase";
import { REPO_URL } from "@/lib/site";

const sellerStories = [
  {
    quote: "Sealed boxes move a few bucks a week. I set the price on each box when I shoot it, so a restock never goes up at last month\u2019s number.",
    initials: "ST", who: "Sealed TCG seller", what: "Booster boxes and ETBs",
  },
  {
    quote: "One copy lives in the display case and three more are in the back. I shoot the backstock on a slow afternoon and that listing runs itself.",
    initials: "UG", who: "Used game shop", what: "Storefront with an eBay side",
  },
  {
    quote: "Every controller color is one variation listing. When a color sells out, the next one is already queued, so that option never sits dark.",
    initials: "CR", who: "Controller refurbisher", what: "One variation listing, many colors",
  },
  {
    quote: "Same pressing, different wear. Each copy gets its own photos and grade, and the listing keeps its sold count instead of starting over at zero.",
    initials: "VR", who: "Record seller", what: "Multiple copies of the same LP",
  },
  {
    quote: "Every console I sell is tested and a little different cosmetically. Buyers see the exact unit they get, and I never rebuild the listing.",
    initials: "RC", who: "Retro console seller", what: "Tested, refurbished systems",
  },
  {
    quote: "I list after my day job. I queue everything at night, and the Discord ping tells me a restock went through while I\u2019m at work.",
    initials: "PT", who: "Part-time reseller", what: "Evenings and weekends",
  },
];

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
            <img className="hero-shot" src="/demos/hero-release-line.webp" width={1984} height={772} alt="Next's release line: the copy on eBay now, followed by the copies lined up to sell next, each with its own price." />
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
              <span className="section-kicker">Who it&apos;s for</span>
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
        <div className="site-container"><p className="seller-stories-note">How different kinds of sellers put Next to work.</p></div>
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
            <a href="#sellers">Sellers</a>
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
