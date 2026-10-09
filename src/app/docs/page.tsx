import type { Metadata } from "next";
import { ArrowRight, ExternalLink } from "lucide-react";
import { FaGithub } from "react-icons/fa";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";
import { REPO_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Setup guide · Nextinstock",
  description: "Install Next on a Mac, connect eBay, line up copies on a listing, and turn on Discord alerts.",
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "article",
    url: "/docs",
    siteName: "Nextinstock",
    title: "Set up Nextinstock on your Mac",
    description: "Install Nextinstock, connect eBay, test a restock, and turn on Discord alerts.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Set up Nextinstock on your Mac",
    description: "Install Nextinstock, connect eBay, test a restock, and turn on Discord alerts.",
  },
};

const sections = [
  { id: "install", label: "Install" },
  { id: "ebay", label: "Connect eBay" },
  { id: "listing", label: "Add a listing" },
  { id: "copies", label: "Line up copies" },
  { id: "pace", label: "Set the pace" },
  { id: "live", label: "Test, then go live" },
  { id: "discord", label: "Discord alerts" },
  { id: "updates", label: "Updating" },
];

const needs = [
  ["A Mac", "Next runs on your computer. Keep it on and awake while it watches."],
  ["Node.js 22+", "Free from nodejs.org."],
  ["An eBay seller account", "With the listings you want to keep in stock."],
  ["eBay developer keys", "Free at developer.ebay.com. Yours stay on your Mac."],
];

export default function DocsPage() {
  return <main className="docs-page">
    <SiteHeader />
    <header className="site-container docs-hero">
      <span className="docs-eyebrow">Setup guide · Mac</span>
      <h1>Set up Next</h1>
      <p>From a fresh install to your first automatic restock. Plan on about 20 minutes, most of it on the eBay developer site.</p>
      <ul className="docs-needs" aria-label="What you need">
        {needs.map(([title, detail]) => <li key={title}><strong>{title}</strong><span>{detail}</span></li>)}
      </ul>
    </header>

    <div className="site-container docs-layout">
      <nav className="docs-index" aria-label="Setup guide sections">
        {sections.map((section, index) => <a href={`#${section.id}`} key={section.id}><span>{index + 1}</span>{section.label}</a>)}
        <a className="docs-index-repo" href={REPO_URL} target="_blank" rel="noreferrer"><FaGithub size={14} aria-hidden="true" />Source on GitHub</a>
      </nav>

      <div className="docs-content">
        <section className="docs-section" id="install">
          <span className="docs-step">Step 1</span>
          <h2>Install</h2>
          <p>Open Terminal, pick a folder you&apos;ll keep, and run:</p>
          <pre><code>git clone {REPO_URL}.git{"\n"}cd Nextinstock{"\n"}npm ci{"\n"}npm run setup:local</code></pre>
          <p><code>setup:local</code> creates a private <code>.env.local</code> file for your keys. Your listings, photos and history live in <code>~/Library/Application Support/Nextinstock</code>, outside the project folder, so updates never touch them.</p>
        </section>

        <section className="docs-section" id="ebay">
          <span className="docs-step">Step 2</span>
          <h2>Connect eBay</h2>
          <p>Create an app at developer.ebay.com and copy its production keys into <code>.env.local</code>. Type them on your Mac only. Never paste them into a chat or commit them.</p>
          <div className="docs-field-list">
            <div><code>EBAY_APP_ID</code><span>Your App ID (Client ID).</span></div>
            <div><code>EBAY_CERT_ID</code><span>Your Cert ID (Client Secret).</span></div>
            <div><code>EBAY_REDIRECT_RU_NAME</code><span>The RuName eBay gives you for sign-in.</span></div>
          </div>
          <p>In the eBay developer portal, set that RuName&apos;s accepted URL to <code>https://&lt;your-host&gt;/api/ebay/auth/callback</code>. eBay needs a stable https address here, so this is the one fiddly part of setup.</p>
          <p>Start Next (step 3), open <strong>Settings</strong> and choose <strong>Connect eBay</strong>. Once Next can read your listings, the same button becomes <strong>Allow listing updates</strong>. You need that grant before Next can restock for real.</p>
        </section>

        <section className="docs-section" id="listing">
          <span className="docs-step">Step 3</span>
          <h2>Start Next and add a listing</h2>
          <p>Start the app and the worker that watches for sales:</p>
          <pre><code>npm run build{"\n"}npm run start:local</code></pre>
          <p>Leave that Terminal window open and go to <a href="http://127.0.0.1:3000/tool">127.0.0.1:3000/tool <ExternalLink size={13} aria-hidden="true" /></a>.</p>
          <ol>
            <li>Choose <strong>Add a listing</strong> and paste the eBay item number.</li>
            <li>Choose <strong>Sync eBay</strong>. If the listing has variations, pick the one you&apos;re restocking.</li>
            <li>Choose <strong>Line up copies</strong>.</li>
          </ol>
          <div className="docs-inline-note">Use an active fixed-price, Good &apos;Til Cancelled listing with Out-of-Stock Control turned on in your eBay selling preferences. That keeps the listing alive at zero, so the next copy goes up on the same item number with its sold count intact.</div>
        </section>

        <section className="docs-section" id="copies">
          <span className="docs-step">Step 4</span>
          <h2>Line up your copies</h2>
          <p>The release line shows the copy on eBay now, then everything waiting behind it. Press <strong>+</strong> at the end of the line to add more.</p>
          <div className="docs-field-list is-plain">
            <div><strong>A different copy</strong><span>Its own photos, condition, price and note. Use it when each copy is unique, like a used game with its own wear. Buyers see exactly this one.</span></div>
            <div><strong>Another of the same</strong><span>Reuses the listing&apos;s current photos. Use it for identical stock and add as many as you have in one go.</span></div>
          </div>
          <p>Drag copies to change the order. For a variation, Next restocks that option&apos;s quantity and price; its eBay photos stay as they are.</p>
        </section>

        <section className="docs-section" id="pace">
          <span className="docs-step">Step 5</span>
          <h2>Set the pace</h2>
          <p>Click any copy on the line to set its price and when it goes up.</p>
          <div className="docs-field-list is-plain">
            <div><strong>Right away</strong><span>Goes up about a minute after the previous copy sells.</span></div>
            <div><strong>After a wait</strong><span>Holds for the time you pick, from minutes to a week.</span></div>
            <div><strong>When I say so</strong><span>Waits for your OK. Approve it in Next or from the Discord alert.</span></div>
            <div><strong>Change per copy</strong><span>On a stack of the same, raises each copy&apos;s price by a set amount over the one before.</span></div>
          </div>
        </section>

        <section className="docs-section" id="live">
          <span className="docs-step">Step 6</span>
          <h2>Test, then go live</h2>
          <p>Next starts in <strong>Test mode</strong> (<code>NEXTINSTOCK_EBAY_WRITE_MODE=dry-run</code>). It watches your real listing and logs what it would do, without changing anything on eBay. Let a sale or two go through and check the history.</p>
          <p>When you&apos;re happy, set <code>NEXTINSTOCK_EBAY_WRITE_MODE=live</code> in <code>.env.local</code> and restart <code>npm run start:local</code>. If anything is blocking live restocks, Settings says exactly what.</p>
          <div className="docs-inline-note">The worker checks eBay every 30 seconds (<code>NEXTINSTOCK_POLL_SECONDS</code>). Your Mac must stay on and online for restocks to happen.</div>
        </section>

        <section className="docs-section" id="discord">
          <span className="docs-step">Optional</span>
          <h2>Discord alerts</h2>
          <p>Get a message when something sells, restocks, or needs your OK. No bot or developer account needed, just a webhook.</p>
          <ol>
            <li>In Discord, open <strong>Server Settings → Integrations → Webhooks</strong>, make a webhook for a channel, and copy its URL. No server yet? Use the <a href="https://discord.new/GavFccHpQgcW" target="_blank" rel="noreferrer">server template <ExternalLink size={13} aria-hidden="true" /></a>.</li>
            <li>In Next, open <strong>Settings → Discord</strong> and paste the URL.</li>
            <li>Pick which alerts you want: sales, restocks, and copies that need you.</li>
            <li>Choose <strong>Send a test</strong>, then <strong>Preview every alert</strong> to see each kind. Previews never touch eBay.</li>
          </ol>
          <p>Alerts for a <strong>When I say so</strong> copy include a <strong>Put it up</strong> link. It opens Next on this Mac. To use it from your phone, set <code>NEXTINSTOCK_PUBLIC_URL</code> to an address that reaches this Mac. Treat the webhook URL like a password.</p>
        </section>

        <section className="docs-section" id="updates">
          <span className="docs-step">Later</span>
          <h2>Updating</h2>
          <p>Stop Next, then from the project folder run:</p>
          <pre><code>git pull{"\n"}npm ci{"\n"}npm run build{"\n"}npm run start:local</code></pre>
          <p>Your keys in <code>.env.local</code> and your data folder are left alone. If a restock stops, check <strong>Settings</strong> for what&apos;s blocking it and the listing&apos;s history for the last result. Questions or bugs go to <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">GitHub issues <ExternalLink size={13} aria-hidden="true" /></a>.</p>
        </section>
      </div>
    </div>

    <footer className="site-footer">
      <div className="site-container docs-footer">
        <BrandMark />
        <span>Independent software for eBay sellers. Not affiliated with eBay.</span>
        <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub <ArrowRight size={15} aria-hidden="true" /></a>
      </div>
    </footer>
  </main>;
}
