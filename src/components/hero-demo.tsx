"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  ImageIcon,
  LayoutList,
  MousePointer2,
  PackageCheck,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { GamePhoto } from "./game-photo";

type StoryTab = "ebay" | "nextinstock";

type SequenceStep = {
  label: string;
  title: string;
  body: string;
  duration: number;
};

const ebaySteps: SequenceStep[] = [
  { label: "Listing live", title: "Copy A is available", body: "The original listing is live with Copy A’s actual condition photographs.", duration: 1900 },
  { label: "Checkout", title: "A buyer completes checkout", body: "The purchase happens on the existing eBay listing.", duration: 1800 },
  { label: "Order confirmed", title: "The sale is recorded", body: "eBay confirms the order and the listing reaches quantity zero.", duration: 1500 },
  { label: "Out of stock", title: "The listing pauses safely", body: "The sold count moves to nine while the listing waits at zero.", duration: 3000 },
  { label: "Refresh", title: "The listing refreshes", body: "A normal page refresh reveals the queued copy—nothing theatrical required.", duration: 700 },
  { label: "Restocked", title: "Copy B is live on the same listing", body: "The photos change, quantity returns to one, and the sold count stays at nine.", duration: 3000 },
];

const nextinstockSteps: SequenceStep[] = [
  { label: "Tasks", title: "Start a restock task", body: "The eBay account is already connected and its listings are synced.", duration: 1700 },
  { label: "Listing", title: "Select the listing once", body: "Choose the replenishable listing that should keep its history.", duration: 1900 },
  { label: "Next copy", title: "Queue Copy B’s real condition", body: "Photos enter the queue and the copy-specific condition note is completed.", duration: 2300 },
  { label: "Automation", title: "Set the safe handoff rule", body: "After a sale reaches zero, apply the queued copy and restore quantity to one.", duration: 2200 },
  { label: "Review", title: "Activate the task", body: "The listing, next copy, and safe-zero rule are checked together.", duration: 1900 },
  { label: "Sale detected", title: "The queued copy is applied", body: "Quantity stays at zero while the photo and condition update runs.", duration: 2300 },
  { label: "Complete", title: "Copy B is ready for the next buyer", body: "The task returns to active and waits for another copy to be queued.", duration: 2800 },
];

function useLiveSequence(active: boolean, steps: SequenceStep[]) {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!active || !playing) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const timer = window.setTimeout(() => {
      setPhase((value) => (value + 1) % steps.length);
    }, steps[phase].duration);

    return () => window.clearTimeout(timer);
  }, [active, phase, playing, steps]);

  function advance() {
    setPhase((value) => (value + 1) % steps.length);
    setPlaying(true);
  }

  function restart() {
    setPhase(0);
    setPlaying(true);
  }

  return { phase, playing, setPlaying, advance, restart };
}

function EbayWordmark() {
  return (
    <span className="ebay-wordmark" aria-label="eBay">
      <span>e</span><span>b</span><span>a</span><span>y</span>
    </span>
  );
}

function LiveCursor({ className = "" }: { className?: string }) {
  return <span className={`live-cursor ${className}`} aria-hidden="true"><MousePointer2 size={18} fill="white" /></span>;
}

function EbayListing({ phase, onAdvance }: { phase: number; onAdvance: () => void }) {
  const checkout = phase === 1;
  const confirmed = phase === 2;
  const sold = phase >= 3 && phase <= 4;
  const refreshing = phase === 4;
  const restocked = phase === 5;
  const soldCount = phase >= 2 ? 9 : 8;

  return (
    <div className={`ebay-frame live-phase-${phase}`}>
      <div className="ebay-utility">
        <span>Hi! <u>Sign in</u> or <u>register</u></span>
        <span className="ebay-utility-links">Deals&nbsp;&nbsp; Help &amp; Contact&nbsp;&nbsp;&nbsp; Sell&nbsp;&nbsp; Watchlist&nbsp;&nbsp; My eBay</span>
      </div>
      <div className="ebay-searchbar">
        <EbayWordmark />
        <button type="button" className="ebay-category">Shop by category <ChevronDown size={12} /></button>
        <div className="ebay-search-input"><Search size={15} /> Search for anything <span>All Categories</span></div>
        <button type="button" className="ebay-search-button">Search</button>
      </div>

      {sold && <div className="ebay-stock-alert"><span>!</span> This item is out of stock.</div>}

      <div className="ebay-product">
        <div className="ebay-gallery">
          <div className="ebay-thumbs">
            <GamePhoto copy={restocked ? "next" : "current"} />
            <GamePhoto copy={restocked ? "current" : "next"} />
          </div>
          <div className="ebay-photo-live-wrap">
            <GamePhoto copy={restocked ? "next" : "current"} className="ebay-main-photo" />
          </div>
        </div>
        <div className="ebay-details">
          <h3>Pokemon XD: Gale of Darkness (Nintendo GameCube, 2005) Japanese Complete Tested</h3>
          <div className="ebay-seller">
            <span className="ebay-avatar" aria-label="Next" />
            <span><strong>next</strong> (2891)<br /><u>100% positive</u> · <u>Seller&apos;s other items</u></span>
          </div>
          <div className="ebay-price">US $84.99</div>
          <p className="ebay-payments">or 4 interest-free payments of $21.25 available with <strong>Klarna.</strong></p>
          <div className="ebay-condition"><span>Condition:</span><strong>Good</strong></div>
          <div className="ebay-quantity">
            <span>Quantity:</span>
            <strong className={sold ? "is-out-of-stock" : undefined}>{sold ? "Out of stock" : "1 available"}</strong>
            <small>{soldCount} sold</small>
          </div>
          {!sold && (
            <div className="ebay-buy-actions">
              <button type="button" className="ebay-buy-now" onClick={onAdvance}>Buy It Now</button>
              <button type="button" className="ebay-watch">♡ Add to watchlist</button>
              {phase === 0 && <LiveCursor className="cursor-buy" />}
            </div>
          )}
        </div>
      </div>

      {checkout && (
        <div className="ebay-checkout-scrim">
          <div className="ebay-checkout-sheet">
            <span className="checkout-kicker">Review order</span>
            <div className="checkout-item"><GamePhoto copy="current" /><span><strong>Pokemon XD: Gale of Darkness</strong><small>Good · Quantity 1</small></span><strong>$84.99</strong></div>
            <div className="checkout-total"><span>Order total</span><strong>US $84.99</strong></div>
            <button type="button" onClick={onAdvance}>Confirm and pay</button>
            <LiveCursor className="cursor-confirm" />
          </div>
        </div>
      )}

      {confirmed && (
        <div className="ebay-order-confirmed">
          <span><CircleCheck size={23} /></span>
          <strong>Your order is confirmed</strong>
          <small>Order 19-08421-55394 · Seller notified</small>
        </div>
      )}

      {phase === 3 && <div className="ebay-event-toast"><ShoppingBag size={16} /><span><strong>Sale detected</strong><small>Quantity changed from 1 to 0</small></span></div>}
      {restocked && <div className="ebay-restocked-toast"><CircleCheck size={16} /> Copy B is live on the original listing</div>}
      {refreshing && <div className="ebay-page-refresh" aria-label="Refreshing the eBay listing"><RefreshCw size={24} /></div>}
    </div>
  );
}

function ListingRow({ selected = false }: { selected?: boolean }) {
  return (
    <div className={`story-listing-row ${selected ? "is-selected" : ""}`}>
      <GamePhoto copy="current" />
      <div>
        <strong>Pokemon XD: Gale of Darkness</strong>
        <span>eBay 900000000102 · Good</span>
      </div>
      <strong>$84.99</strong>
      <span className="story-status">{selected ? <><Check size={12} /> Selected</> : "Live"}</span>
    </div>
  );
}

function NextinstockPanel({ phase, onAdvance }: { phase: number; onAdvance: () => void }) {
  return (
    <div className={`next-frame next-live-phase-${phase}`}>
      <aside className="next-mini-sidebar">
        <BrandMark compact />
        <span className="next-mini-nav active"><LayoutList size={16} /></span>
        <span className="next-mini-nav"><Activity size={16} /></span>
        <span className="next-mini-nav"><Settings size={16} /></span>
      </aside>
      <div className="next-story-main">
        <div className="next-story-topbar">
          <div>
            <strong>{phase === 0 || phase >= 5 ? "Restock tasks" : "New restock task"}</strong>
            <span>Next · eBay synced</span>
          </div>
          <span className="synced-pill"><Check size={12} /> Synced</span>
        </div>

        <div className="next-live-canvas">
          {phase === 0 && (
            <div className="next-live-dashboard">
              <div className="next-live-heading"><div><span>Inventory automation</span><h3>Restock tasks</h3></div><button type="button" onClick={onAdvance}><span>+</span> New restock task</button></div>
              <div className="next-live-stats"><span><small>Active tasks</small><strong>3</strong></span><span><small>Next copies ready</small><strong>6</strong></span><span><small>Restocked this month</small><strong>18</strong></span></div>
              <div className="next-live-table"><div className="next-live-table-head"><span>Listing</span><span>Price</span><span>Status</span></div><ListingRow /></div>
              <LiveCursor className="cursor-new-task" />
            </div>
          )}

          {phase === 1 && (
            <div className="story-stage-body live-panel-enter">
              <div className="story-step-kicker">1 of 4 · Listing</div>
              <h3>Select a replenishable listing</h3>
              <div className="story-search"><Search size={15} /> Search 164 synced listings</div>
              <ListingRow selected />
              <div className="story-action"><button type="button" onClick={onAdvance}>Continue <ArrowRight size={14} /></button></div>
              <LiveCursor className="cursor-listing-continue" />
            </div>
          )}

          {phase === 2 && (
            <div className="story-stage-body live-panel-enter">
              <div className="story-step-kicker">2 of 4 · Next copy</div>
              <h3>Add the copy that sells next</h3>
              <div className="live-copy-editor">
                <div className="live-upload-grid">
                  <GamePhoto copy="next" /><GamePhoto copy="current" /><GamePhoto copy="next" /><GamePhoto copy="current" />
                  <span className="live-upload-count"><Check size={12} /> 6 photos uploaded</span>
                </div>
                <div className="live-copy-fields">
                  <label><span>Internal reference</span><input readOnly value="GC-PKXD-009" /></label>
                  <label><span>Condition</span><button type="button">Good <ChevronDown size={13} /></button></label>
                  <label><span>Condition note</span><textarea readOnly value="Clean case, manual included. Light shelf wear shown." /></label>
                </div>
              </div>
              <div className="story-action"><button type="button" onClick={onAdvance}>Continue <ArrowRight size={14} /></button></div>
              <LiveCursor className="cursor-copy-continue" />
            </div>
          )}

          {phase === 3 && (
            <div className="story-stage-body live-panel-enter">
              <div className="story-step-kicker">3 of 4 · Automation</div>
              <h3>Set the sale-to-restock handoff</h3>
              <div className="story-rule">
                <div><span>WHEN</span><PackageCheck size={18} /><strong>Quantity reaches 0 after a sale</strong></div>
                <ArrowRight size={18} />
                <div><span>THEN</span><ImageIcon size={18} /><strong>Apply next photos and set quantity to 1</strong></div>
              </div>
              <label className="story-safety"><span><Check size={12} /></span> Keep quantity at zero if the queued copy is incomplete</label>
              <div className="story-action"><button type="button" onClick={onAdvance}>Review task <ArrowRight size={14} /></button></div>
              <LiveCursor className="cursor-rule-continue" />
            </div>
          )}

          {phase === 4 && (
            <div className="story-stage-body live-panel-enter">
              <div className="story-step-kicker">4 of 4 · Review</div>
              <h3>Activate the restock task</h3>
              <div className="live-review-handoff">
                <div><span>eBay listing</span><GamePhoto copy="current" /><strong>900000000102</strong></div>
                <ArrowRight size={19} />
                <div><span>First in queue</span><GamePhoto copy="next" /><strong>GC-PKXD-009</strong></div>
              </div>
              <div className="live-review-checks"><span><Check size={12} /> Listing selected</span><span><Check size={12} /> Copy complete</span><span><Check size={12} /> Safe-zero enabled</span></div>
              <div className="story-action"><button type="button" onClick={onAdvance}>Activate restock task <Sparkles size={14} /></button></div>
              <LiveCursor className="cursor-activate" />
            </div>
          )}

          {phase === 5 && (
            <div className="story-stage-body story-applying-body live-panel-enter">
              <div className="apply-ring" />
              <div>
                <div className="story-step-kicker">Sale detected · 10:42:08 AM</div>
                <h3>Applying Copy B to the same listing</h3>
                <div className="apply-checks">
                  <span><Check size={13} /> Quantity held at zero</span>
                  <span><Check size={13} /> 6 photos verified</span>
                  <span className="is-working"><span /> Updating eBay listing</span>
                </div>
              </div>
            </div>
          )}

          {phase === 6 && (
            <div className="next-success-state live-panel-enter">
              <span className="next-success-icon"><CircleCheck size={25} /></span>
              <div><span>Restock complete · 10:42:11 AM</span><h3>Copy B is live on eBay</h3><p>Photos and condition updated. Quantity restored to one.</p></div>
              <div className="next-success-task"><GamePhoto copy="next" /><span><strong>Pokemon XD: Gale of Darkness</strong><small>eBay 900000000102 · Copy B</small></span><span className="ready-pill"><Check size={11} /> Active</span></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HeroScreenshot() {
  const listings = [
    {
      id: "final-fantasy",
      title: "Final Fantasy Collector Booster Box",
      detail: "Magic: The Gathering · 900000000101",
      image: "https://i.ebayimg.com/00/s/MTYwMFgxNjAw/z/Il0AAeSwhddoq6Q7/$_57.PNG?set_id=880000500F",
      status: "Ready to set up",
      statusClass: "is-eligible",
    },
    {
      id: "pokemon-xd",
      title: "Pokémon XD: Gale of Darkness",
      detail: "Nintendo GameCube · 900000000102",
      image: "https://i.ebayimg.com/images/g/Xx8AAeSwHNVpYYFS/s-l1600.webp",
      status: "Ready to set up",
      statusClass: "is-eligible",
    },
    {
      id: "xbox-controller",
      title: "Xbox X25 Anniversary Controller",
      detail: "Controller · 900000000103",
      image: "https://i.ebayimg.com/00/s/OTAwWDkwMA==/z/R1AAAeSwBBdqtXRQ/$_57.JPG?set_id=880000500F",
      status: "Review stock",
      statusClass: "is-review",
    },
  ];

  return (
    <div className="hero-shot-shell" aria-label="Nextinstock restock task overview">
      <div className="hero-shot-bar">
        <BrandMark tag={false} />
        <div className="hero-shot-user">NI</div>
      </div>
      <div className="hero-shot-content">
        <div className="hero-shot-heading">
          <div><span>Product preview</span><strong>Restock tasks</strong></div>
        </div>
        <div className="hero-shot-stats">
          <span><small>Listings shown</small><strong>3</strong></span>
          <span><small>Ready to set up</small><strong>2</strong></span>
          <span><small>Stock review</small><strong>1</strong></span>
        </div>
        <div className="hero-shot-list" aria-label="Example eBay listings">
          {listings.map((listing) => (
            <div
              className="hero-shot-task"
              key={listing.id}
            >
              <img src={listing.image} alt="" referrerPolicy="no-referrer" />
              <span className="hero-shot-title">
                <strong>{listing.title}</strong>
                <small>{listing.detail}</small>
              </span>
              <span className={`hero-shot-status ${listing.statusClass}`}>{listing.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProcessStatus({
  steps,
  phase,
  playing,
  onToggle,
  onRestart,
}: {
  steps: SequenceStep[];
  phase: number;
  playing: boolean;
  onToggle: () => void;
  onRestart: () => void;
}) {
  const current = steps[phase];
  return (
    <div className="process-status">
      <span className="process-status-count">{String(phase + 1).padStart(2, "0")}<small>/{String(steps.length).padStart(2, "0")}</small></span>
      <div className="process-status-copy">
        <strong>{current.title}</strong>
        <p>{current.body}</p>
      </div>
      <div className="process-status-actions">
        <button type="button" onClick={onToggle} aria-label={playing ? "Pause process" : "Resume process"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
        <button type="button" onClick={onRestart} aria-label="Restart process"><RotateCcw size={17} /></button>
      </div>
      <div className="process-status-progress" aria-hidden="true"><span style={{ width: `${((phase + 1) / steps.length) * 100}%` }} /></div>
    </div>
  );
}

export function ProcessLoop() {
  const [activeTab, setActiveTab] = useState<StoryTab>("nextinstock");
  const ebay = useLiveSequence(activeTab === "ebay", ebaySteps);
  const nextinstock = useLiveSequence(activeTab === "nextinstock", nextinstockSteps);
  const activeSequence = activeTab === "ebay" ? ebay : nextinstock;
  const activeSteps = activeTab === "ebay" ? ebaySteps : nextinstockSteps;

  return (
    <div className="process-loop">
      <div className="process-browser-bar">
        <div className="browser-dots"><span /><span /><span /></div>
        <div className="process-tabs" role="tablist" aria-label="Sale and restock walkthrough">
          <button type="button" role="tab" aria-selected={activeTab === "nextinstock"} className={activeTab === "nextinstock" ? "active" : ""} onClick={() => setActiveTab("nextinstock")}>
            <BrandMark compact /> Next
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "ebay"} className={activeTab === "ebay" ? "active" : ""} onClick={() => setActiveTab("ebay")}>
            <EbayWordmark /> Listing
          </button>
        </div>
        <span className="process-secure">● Interactive example</span>
      </div>

      <ProcessStatus
        steps={activeSteps}
        phase={activeSequence.phase}
        playing={activeSequence.playing}
        onToggle={() => activeSequence.setPlaying(!activeSequence.playing)}
        onRestart={activeSequence.restart}
      />

      <div className="process-screen" role="tabpanel">
        {activeTab === "ebay" ? <EbayListing phase={ebay.phase} onAdvance={ebay.advance} /> : <NextinstockPanel phase={nextinstock.phase} onAdvance={nextinstock.advance} />}
      </div>
    </div>
  );
}
