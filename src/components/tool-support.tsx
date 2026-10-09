import {
  ArrowRight,
  Bell,
  CircleHelp,
  ExternalLink,
  ImageIcon,
  Layers3,
  ListOrdered,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { SystemStatus } from "@/lib/types";

const topics = [
  { id: "start", label: "Get started" },
  { id: "listings", label: "Eligible listings" },
  { id: "copies", label: "Copies & pricing" },
  { id: "handoff", label: "Sale to restock" },
  { id: "variations", label: "Variations" },
  { id: "alerts", label: "Alerts & activity" },
  { id: "troubleshooting", label: "Troubleshooting" },
];

export function ToolSupport({ status, onNewTask, onSettings }: {
  status: SystemStatus | null;
  onNewTask: () => void;
  onSettings: () => void;
}) {
  return (
    <div className="support-page">
      <div className="tool-page-heading">
        <div><span>Help center</span><h1>Support & docs</h1><p>Set up a queue, understand each handoff, and fix common blockers.</p></div>
      </div>

      <div className="support-layout">
        <nav className="support-index" aria-label="Documentation topics">
          <strong>ON THIS PAGE</strong>
          {topics.map((topic) => <a href={`#${topic.id}`} key={topic.id}>{topic.label}</a>)}
        </nav>

        <div className="support-content">
          <section className="support-intro" id="start">
            <span className="support-eyebrow"><Play size={15} /> START HERE</span>
            <h2>One listing. A queue of real copies. One unit live at a time.</h2>
            <p>Nextinstock watches the eBay listing or variation you choose. When a sale takes its available quantity to zero, it waits, applies the next queued copy, and returns one unit to stock when live writes are authorized.</p>
            <div className="support-actions">
              <button type="button" onClick={onNewTask}>Create a restock task <ArrowRight size={16} /></button>
              <button type="button" className="support-secondary" onClick={onSettings}>Check connection</button>
            </div>
            <ol className="support-steps">
              <li><b>1</b><span><strong>Connect eBay</strong><small>Use Settings to grant access. A read grant lets you set up and test; a Nextinstock write grant is required to publish.</small></span></li>
              <li><b>2</b><span><strong>Choose a listing</strong><small>Enter its item number, then choose a specific option if it has variations.</small></span></li>
              <li><b>3</b><span><strong>Queue the next copy</strong><small>Add a reference, photos and a condition note when required, and an optional restock price.</small></span></li>
              <li><b>4</b><span><strong>Review and activate</strong><small>Keep the app and local worker running so checks continue after setup.</small></span></li>
            </ol>
          </section>

          <section className="support-section" id="listings">
            <div className="support-section-heading"><Layers3 size={20} /><div><h2>Eligible listings</h2><p>The builder checks these rules before activation.</p></div></div>
            <div className="support-grid">
              <div className="support-fact"><strong>Listing type</strong><p>Active fixed-price, Good ’Til Cancelled, with eBay Out-of-Stock Control enabled.</p></div>
              <div className="support-fact"><strong>Single item</strong><p>At most one available copy when the task starts. Existing sold history is fine.</p></div>
              <div className="support-fact"><strong>Multi-variation</strong><p>Select the exact option to watch. Each option has its own sold count and available quantity.</p></div>
              <div className="support-fact"><strong>At zero already?</strong><p>You can activate a supported listing at zero; the worker can process its queued copy after the hold.</p></div>
            </div>
          </section>

          <section className="support-section" id="copies">
            <div className="support-section-heading"><ListOrdered size={20} /><div><h2>Copies, photos & pricing</h2><p>Prepare the sequence before the sales arrive.</p></div></div>
            <ul className="support-list">
              <li><strong>Queue order.</strong> Add up to 25 physical copies per task. Drag copies in the release line to change their order.</li>
              <li><strong>Your SKU / reference.</strong> Name each queued copy so you can match it to your shelf or inventory record. This stays in Next; it does not edit the eBay SKU or a completed order.</li>
              <li><strong>Condition note.</strong> On a single-item listing, a queued copy with its own photos applies this note at handoff. An identical copy with a blank note keeps the live note. Variation notes stay in Next because eBay shares the listing condition.</li>
              <li><strong>Single-item photos.</strong> Add 1–24 JPEG, PNG, WebP, or HEIC photos and a condition note for the next physical copy. Those photos replace the listing’s complete photo set during a live handoff.</li>
              <li><strong>Restock price.</strong> Set a price per copy, or leave it blank to keep the live eBay price. You can edit a queued price before it is applied. A price change may reset eBay’s automatic Best Offer thresholds.</li>
              <li><strong>Local storage.</strong> Queued photos and the task ledger live on this machine. Back up the data folder shown in Settings.</li>
            </ul>
          </section>

          <section className="support-section" id="handoff">
            <div className="support-section-heading"><RefreshCw size={20} /><div><h2>What happens after a sale</h2><p>A fresh eBay read confirms the trigger before any handoff.</p></div></div>
            <div className="support-flow">
              <div><span>01</span><strong>Sale reaches zero</strong><p>The selected listing or variation’s sold count rises and available quantity reaches zero.</p></div>
              <div><span>02</span><strong>Restock hold</strong><p>The worker waits at zero for {status?.restockDelaySeconds ?? 60} seconds, then checks again. Polling is set to {status?.pollSeconds ?? 30} seconds.</p></div>
              <div><span>03</span><strong>Apply and verify</strong><p>In live mode, the worker applies the next copy’s supported details, reads eBay back, then restores one available unit.</p></div>
            </div>
            <div className="support-note"><ShieldCheck size={18} /><span>Missing copy data, an unsupported listing, or a failed eBay check holds the quantity at zero. Dry-run mode records the plan but makes no eBay changes.</span></div>
            <p>If the sale already left the listing at zero, you can add the next copy and request a fresh check. Next can restock after its checks and hold when the trigger matches. Your SKU and note only affect that queued handoff; they cannot change the sale that already completed.</p>
            <p>A manual quantity change to zero without a new sale does not trigger an already armed task. Use the task’s check button to request a fresh read; it does not skip the hold or the write gate.</p>
          </section>

          <section className="support-section" id="variations">
            <div className="support-section-heading"><ImageIcon size={20} /><div><h2>Variation tasks</h2><p>Each task targets one option on the existing listing.</p></div></div>
            <p>Search all eBay options in the builder and select the exact one to monitor. The “Visible” checkboxes only shorten your setup list; they do not change eBay or hide options from search. You can create separate tasks for different options on the same item.</p>
            <p>For a variation restock, Nextinstock changes that option’s quantity and optional price. Its photos and the listing’s shared condition stay on eBay as they are. Photos and notes you add to the queued copy are internal records.</p>
          </section>

          <section className="support-section" id="alerts">
            <div className="support-section-heading"><Bell size={20} /><div><h2>Activity & optional alerts</h2><p>See what the worker saw and what it did.</p></div></div>
            <p>Activity records task setup, worker checks, restock plans, holds, failures, and completed handoffs. The task row shows whether a copy is queued, scheduled, ready in dry-run, or needs attention.</p>
            <dl className="support-status-list">
              <div><dt>Active</dt><dd>Watching for the selected target to sell through.</dd></div>
              <div><dt>Restock queued</dt><dd>A qualifying sale happened; the zero-stock hold is running.</dd></div>
              <div><dt>Restocking</dt><dd>The worker is applying and verifying the next copy.</dd></div>
              <div><dt>Dry-run ready</dt><dd>The handoff plan is ready; eBay was not changed.</dd></div>
              <div><dt>Needs attention / Error</dt><dd>Open Activity and the task’s latest result before retrying.</dd></div>
            </dl>
            <p>In Settings, you can connect a private Discord webhook for restock status. Send a test message or simulated sale preview there before relying on alerts. The preview does not edit eBay.</p>
          </section>

          <section className="support-section" id="troubleshooting">
            <div className="support-section-heading"><CircleHelp size={20} /><div><h2>Troubleshooting</h2><p>Check the blocker shown in Settings and the latest Activity entry.</p></div></div>
            <div className="support-faq">
              <details><summary>Why is a listing rejected?</summary><p>Confirm it is active, fixed-price, Good ’Til Cancelled, and uses Out-of-Stock Control. A single-item listing must have no more than one available copy. The builder displays the exact reason returned by the check.</p></details>
              <details><summary>Why didn’t a sale restock?</summary><p>Keep the local worker running, wait through the configured hold, and check Activity. Make sure the selected option reached zero and has a queued copy. In dry-run mode, eBay remains unchanged by design.</p></details>
              <details><summary>Why are live writes blocked?</summary><p>Settings shows the current gate. Live writes require persistent local storage, live mode, and a fresh eBay grant to Nextinstock with selling permission. Reconnecting alone does not switch dry-run mode to live.</p></details>
              <details><summary>Where are my photos and tasks?</summary><p>They are stored in the local data folder shown in Settings. Preserve that folder when updating or moving the app. It contains the SQLite ledger, image files, and local integration secrets.</p></details>
            </div>
            <div className="support-note"><LockKeyhole size={18} /><span>Running a hosted preview? Local tool routes are blocked there. This workflow needs the installed app and a persistent worker.</span></div>
          </section>

          <div className="support-footer"><strong>Still stuck?</strong><span>Open Settings for the exact write gate, then check Activity for the latest task result.</span><button type="button" onClick={onSettings}>Open Settings <ExternalLink size={14} /></button></div>
        </div>
      </div>
    </div>
  );
}
