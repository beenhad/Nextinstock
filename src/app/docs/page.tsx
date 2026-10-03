import type { Metadata } from "next";
import { ArrowRight, ExternalLink, LaptopMinimal } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Desktop setup docs — Nextinstock",
  description: "Install Nextinstock on a Mac, connect eBay, prepare a restock task, and set up optional Discord alerts.",
};

const sections = [
  { id: "install", label: "Install on Mac" },
  { id: "ebay", label: "Connect eBay" },
  { id: "first-task", label: "First restock task" },
  { id: "live", label: "Dry-run to live" },
  { id: "discord", label: "Discord alerts" },
  { id: "updates", label: "Updates & help" },
];

export default function DocsPage() {
  return <main className="docs-page">
    <SiteHeader />
    <div className="site-container docs-hero">
      <span className="docs-eyebrow"><LaptopMinimal size={16} aria-hidden="true" /> DESKTOP GUIDE · MAC</span>
      <h1>Get the next copy ready.</h1>
      <p>Install Nextinstock, connect your eBay account, and prepare your first restock. Discord alerts are optional.</p>
      <div className="docs-hero-actions">
        <a href="#install" className="primary-link">Start setup <ArrowRight size={16} aria-hidden="true" /></a>
        <a href="/#pricing" className="docs-text-link">See Desktop pricing</a>
      </div>
    </div>

    <div className="site-container docs-layout">
      <nav className="docs-index" aria-label="Setup guide sections">
        <strong>ON THIS PAGE</strong>
        {sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.label}</a>)}
      </nav>

      <div className="docs-content">
        <div className="docs-callout"><strong>Before you start</strong><p>Desktop runs locally on macOS. You need a Mac, Node.js 22 or newer, an eBay seller account, and your own eBay developer credentials. Keep the Mac awake and connected while monitoring.</p></div>

        <section className="docs-section" id="install">
          <span className="docs-step">01 / INSTALL</span>
          <h2>Install on your Mac</h2>
          <p>Extract the Desktop ZIP to a folder you can keep. Open Terminal in that folder and run:</p>
          <pre><code>npm ci{"\n"}npm run setup:local</code></pre>
          <p><code>setup:local</code> creates a private <code>.env.local</code> file and stores the task ledger, photos, and secrets in <code>~/Library/Application Support/Nextinstock</code>. Keep that data folder when you update the software.</p>
        </section>

        <section className="docs-section" id="ebay">
          <span className="docs-step">02 / EBAY</span>
          <h2>Connect your eBay account</h2>
          <p>Add your own developer values to <code>.env.local</code>. Enter them on your Mac, never in a chat or public repository.</p>
          <div className="docs-field-list">
            <div><code>EBAY_APP_ID</code><span>Your eBay developer App ID.</span></div>
            <div><code>EBAY_CERT_ID</code><span>Your Cert ID.</span></div>
            <div><code>EBAY_REDIRECT_RU_NAME</code><span>The RuName for your OAuth consent flow.</span></div>
          </div>
          <p>For OAuth, set the RuName&apos;s accepted URL in the eBay developer portal to <code>https://&lt;your-stable-host&gt;/api/ebay/auth/callback</code>. This callback setup still requires a stable host; it is not a one-click buyer setup yet. In the local tool&apos;s Settings, choose <strong>Reconnect for writes</strong> to store a Nextinstock grant with <code>sell.inventory</code> permission. If you already have a seller refresh token, <code>EBAY_REFRESH_TOKEN</code> can support read-only setup, but it does not authorize live writes by itself.</p>
        </section>

        <section className="docs-section" id="first-task">
          <span className="docs-step">03 / FIRST TASK</span>
          <h2>Prepare a listing</h2>
          <p>Check the install, build, and start the app and worker together:</p>
          <pre><code>npm run check{"\n"}npm test{"\n"}npm run build{"\n"}npm run start:local</code></pre>
          <p>Open <a href="http://127.0.0.1:3000/tool">Nextinstock on this Mac <ExternalLink size={13} aria-hidden="true" /></a>. Keep that Terminal window open. Choose <strong>New restock task</strong>, enter the eBay item number, and select the exact variation if the listing has options.</p>
          <ul>
            <li>Use an active fixed-price, Good &apos;Til Cancelled listing with Out-of-Stock Control enabled.</li>
            <li>For a single-item listing, queue the next copy with its photos, condition note, internal reference, and optional price.</li>
            <li>For a variation, queue the exact option. Nextinstock changes its quantity and optional price; its eBay photos stay in place.</li>
            <li>You can queue up to 100 copies per task and reorder them in the tool.</li>
          </ul>
        </section>

        <section className="docs-section" id="live">
          <span className="docs-step">04 / SAFETY CHECK</span>
          <h2>Review a dry-run first</h2>
          <p>Leave <code>NEXTINSTOCK_EBAY_WRITE_MODE=dry-run</code> while you sync a real listing, activate a task, and review its worker check and Activity history. Dry-run shows the restock plan without changing eBay.</p>
          <p>Live restocking requires a local Nextinstock OAuth grant with <code>sell.inventory</code> permission and <code>NEXTINSTOCK_EBAY_WRITE_MODE=live</code> in <code>.env.local</code>. Restart the app and worker after changing that setting. Settings shows the exact blocker if live writes are unavailable.</p>
          <div className="docs-inline-note">The worker checks every 30 seconds by default. After a qualifying sale leaves the chosen item or variation at zero, it holds the restock for at least 60 seconds, then acts on a later check. Your Mac must remain on.</div>
        </section>

        <section className="docs-section" id="discord">
          <span className="docs-step">05 / OPTIONAL</span>
          <h2>Get Discord updates</h2>
          <p>Use an existing private Discord server, or <a href="https://discord.new/GavFccHpQgcW" target="_blank" rel="noreferrer">copy the optional server template <ExternalLink size={13} aria-hidden="true" /></a>. No Discord bot or developer account is needed.</p>
          <ol>
            <li>Create a text channel such as <code>#restock-updates</code>.</li>
            <li>In Discord, open <strong>Server Settings → Integrations → Webhooks</strong>. Create a webhook for that channel and copy its URL.</li>
            <li>In Nextinstock, open <strong>Settings → Discord updates</strong>, paste the URL, and choose <strong>Connect</strong>.</li>
            <li>Choose <strong>Send test message</strong>. Then use <strong>Preview all alerts</strong> to see nine simulated statuses. The preview does not edit eBay.</li>
          </ol>
          <p>Real alerts come from worker checks. To change channels, make a new webhook and choose <strong>Replace</strong>; to stop alerts, choose <strong>Disconnect</strong>. Treat the webhook URL like a password.</p>
        </section>

        <section className="docs-section" id="updates">
          <span className="docs-step">06 / KEEP IT RUNNING</span>
          <h2>Updates and help</h2>
          <p>Before installing a newer release, stop Nextinstock and back up <code>.env.local</code> plus the data folder shown in Settings. Extract the new ZIP into a new folder, carry over only <code>.env.local</code>, then run <code>npm ci</code> and <code>npm run build</code> before restarting. The separate data folder keeps your tasks and photos.</p>
          <p>If a listing is rejected or a restock stops, check <strong>Settings</strong> for the write gate and <strong>Activity</strong> for the latest result. The local tool also has <strong>Support &amp; docs</strong> with listing rules and status explanations.</p>
        </section>
      </div>
    </div>

    <footer className="site-footer">
      <div className="site-container docs-footer">
        <BrandMark />
        <span>Independent software for eBay sellers. Not affiliated with eBay.</span>
        <a href="/#pricing">See Desktop <ArrowRight size={15} aria-hidden="true" /></a>
      </div>
    </footer>
  </main>;
}
