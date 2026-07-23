"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  ImageIcon,
  PackageCheck,
  Search,
  Sparkles,
} from "lucide-react";
import { BrandMark } from "./brand-mark";
import { GamePhoto } from "./game-photo";

type StoryTab = "ebay" | "nextinstock";

type StoryStep = {
  tab: StoryTab;
  label: string;
  title: string;
  body: string;
};

const storySteps: StoryStep[] = [
  {
    tab: "ebay",
    label: "Listing live",
    title: "Copy A is for sale",
    body: "The listing keeps its sales history, watchers, price, and item specifics.",
  },
  {
    tab: "nextinstock",
    label: "Select listing",
    title: "Choose the synced listing",
    body: "The eBay account is already connected. Pick the replenishable listing once.",
  },
  {
    tab: "nextinstock",
    label: "Queue copy",
    title: "Add the next copy",
    body: "Photograph its actual condition and place it first in the restock queue.",
  },
  {
    tab: "nextinstock",
    label: "Activate",
    title: "Set the handoff rule",
    body: "After a sale reaches zero, swap the photos and restore quantity to one.",
  },
  {
    tab: "ebay",
    label: "Sale",
    title: "Copy A sells",
    body: "The listing pauses at zero while Nextinstock prepares the queued copy.",
  },
  {
    tab: "nextinstock",
    label: "Restock",
    title: "Nextinstock applies Copy B",
    body: "The queued photographs and condition note replace the sold copy.",
  },
  {
    tab: "ebay",
    label: "Live again",
    title: "The same listing returns",
    body: "Copy B is live with the correct photograph. The listing itself never starts over.",
  },
];

function EbayWordmark() {
  return (
    <span className="ebay-wordmark" aria-label="eBay">
      <span>e</span><span>b</span><span>a</span><span>y</span>
    </span>
  );
}

function EbayListing({ step }: { step: number }) {
  const sold = step === 4;
  const restocked = step === 6;

  return (
    <div className="ebay-frame">
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
          <GamePhoto copy={restocked ? "next" : "current"} className="ebay-main-photo" />
        </div>
        <div className="ebay-details">
          <h3>Pokemon XD: Gale of Darkness (Nintendo GameCube, 2005) Japanese Complete Tested</h3>
          <div className="ebay-seller">
            <span className="ebay-avatar">g</span>
            <span><strong>grailclub</strong> (2891)<br /><u>100% positive</u> · <u>Seller&apos;s other items</u></span>
          </div>
          <div className="ebay-price">US $84.99</div>
          <p className="ebay-payments">or 4 interest-free payments of $21.25 available with <strong>Klarna.</strong></p>
          <div className="ebay-condition"><span>Condition:</span><strong>Good</strong></div>
          <div className="ebay-quantity">
            <span>Quantity:</span>
            <strong>{sold ? "Out of Stock" : "1 available"}</strong>
            <small>8 sold</small>
          </div>
          <button type="button" className="ebay-watch">♡ Add to watchlist</button>
        </div>
      </div>
      {restocked && <div className="ebay-restocked-toast"><CircleCheck size={16} /> Copy B is live on the original listing</div>}
    </div>
  );
}

function ListingRow({ selected = false }: { selected?: boolean }) {
  return (
    <div className={`story-listing-row ${selected ? "is-selected" : ""}`}>
      <GamePhoto copy="current" />
      <div>
        <strong>Pokemon XD: Gale of Darkness</strong>
        <span>eBay · 266994813467 · Good</span>
      </div>
      <strong>$84.99</strong>
      <span className="story-status">{selected ? <><Check size={12} /> Selected</> : "Live"}</span>
    </div>
  );
}

function NextinstockPanel({ step }: { step: number }) {
  const selectStage = step === 1;
  const photoStage = step === 2;
  const ruleStage = step === 3;
  const applyingStage = step === 5;

  return (
    <div className="next-frame">
      <aside className="next-mini-sidebar">
        <BrandMark compact />
        <span className="next-mini-nav active">⌁</span>
        <span className="next-mini-nav">□</span>
        <span className="next-mini-nav">⚙</span>
      </aside>
      <div className="next-story-main">
        <div className="next-story-topbar">
          <div>
            <strong>{applyingStage ? "Restocking listing" : "New restock task"}</strong>
            <span>grailclub · eBay synced</span>
          </div>
          <span className="synced-pill"><Check size={12} /> Synced</span>
        </div>

        {selectStage && (
          <div className="story-stage-body">
            <div className="story-step-kicker">1 of 3 · Listing</div>
            <h3>Select a replenishable listing</h3>
            <div className="story-search"><Search size={15} /> Search 164 synced listings</div>
            <ListingRow selected />
            <div className="story-action"><button type="button">Continue <ArrowRight size={14} /></button></div>
          </div>
        )}

        {photoStage && (
          <div className="story-stage-body">
            <div className="story-step-kicker">2 of 3 · Next copy</div>
            <h3>Add the copy that sells next</h3>
            <div className="story-photo-form">
              <div className="story-current-copy">
                <span>Currently live</span>
                <GamePhoto copy="current" />
                <small>Copy A</small>
              </div>
              <ArrowRight size={18} />
              <div className="story-current-copy story-next-copy">
                <span>First in queue</span>
                <GamePhoto copy="next" />
                <small><Check size={12} /> 6 photos · Good</small>
              </div>
              <div className="story-note-field">
                <span>Condition note</span>
                <strong>Clean case, manual included. Light shelf wear shown.</strong>
              </div>
            </div>
            <div className="story-action"><button type="button">Continue <ArrowRight size={14} /></button></div>
          </div>
        )}

        {ruleStage && (
          <div className="story-stage-body">
            <div className="story-step-kicker">3 of 3 · Automation</div>
            <h3>Choose what happens after the sale</h3>
            <div className="story-rule">
              <div><span>WHEN</span><PackageCheck size={18} /><strong>Quantity reaches 0 after a sale</strong></div>
              <ArrowRight size={18} />
              <div><span>THEN</span><ImageIcon size={18} /><strong>Apply next photos and set quantity to 1</strong></div>
            </div>
            <label className="story-safety"><span><Check size={12} /></span> Keep quantity at zero if the queued copy is incomplete</label>
            <div className="story-action"><button type="button">Activate restock task <Sparkles size={14} /></button></div>
          </div>
        )}

        {applyingStage && (
          <div className="story-stage-body story-applying-body">
            <div className="apply-ring"><span /></div>
            <div>
              <div className="story-step-kicker">Sale detected · 10:42:08 AM</div>
              <h3>Applying Copy B to item 266994813467</h3>
              <div className="apply-checks">
                <span><Check size={13} /> Quantity held at zero</span>
                <span><Check size={13} /> 6 photos verified</span>
                <span className="is-working"><span /> Updating eBay listing</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function HeroScreenshot() {
  return (
    <div className="hero-shot-shell" aria-label="Nextinstock restock task overview">
      <div className="hero-shot-bar">
        <BrandMark />
        <div className="hero-shot-user">GC</div>
      </div>
      <div className="hero-shot-content">
        <div className="hero-shot-heading">
          <div><span>Restock tasks</span><strong>4 listings protected</strong></div>
          <button type="button">+ New task</button>
        </div>
        <div className="hero-shot-stats">
          <span><small>Next copies ready</small><strong>7</strong></span>
          <span><small>Restocked this month</small><strong>18</strong></span>
          <span><small>Needs attention</small><strong>1</strong></span>
        </div>
        <div className="hero-shot-task">
          <GamePhoto copy="current" />
          <div className="hero-shot-title"><strong>Pokemon XD: Gale of Darkness</strong><span>eBay · 266994813467</span></div>
          <div className="hero-shot-handoff">
            <span>Live copy</span><ArrowRight size={14} /><span>Next copy</span>
          </div>
          <GamePhoto copy="next" />
          <span className="ready-pill"><Check size={11} /> Ready</span>
        </div>
      </div>
    </div>
  );
}

export function ProcessLoop() {
  const [step, setStep] = useState(0);
  const [manualTab, setManualTab] = useState<StoryTab | null>(null);
  const current = storySteps[step];
  const visibleTab = manualTab ?? current.tab;

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || manualTab) return;
    const timer = window.setTimeout(() => setStep((value) => (value + 1) % storySteps.length), 3000);
    return () => window.clearTimeout(timer);
  }, [step, manualTab]);

  useEffect(() => {
    if (!manualTab) return;
    const timer = window.setTimeout(() => setManualTab(null), 5000);
    return () => window.clearTimeout(timer);
  }, [manualTab]);

  const stepProgress = useMemo(() => `${((step + 1) / storySteps.length) * 100}%`, [step]);

  return (
    <div className="process-loop">
      <div className="process-browser-bar">
        <div className="browser-dots"><span /><span /><span /></div>
        <div className="process-tabs" role="tablist" aria-label="Sale to restock views">
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === "ebay"}
            className={visibleTab === "ebay" ? "active" : ""}
            onClick={() => setManualTab("ebay")}
          >
            <EbayWordmark /> Listing
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === "nextinstock"}
            className={visibleTab === "nextinstock" ? "active" : ""}
            onClick={() => setManualTab("nextinstock")}
          >
            <BrandMark compact /> Nextinstock
          </button>
        </div>
        <span className="process-secure">● Connected</span>
      </div>

      <div className="process-screen">
        {visibleTab === "ebay" ? <EbayListing step={step} /> : <NextinstockPanel step={step < 1 || step > 5 ? 1 : step} />}
      </div>

      <div className="process-narration">
        <div className="process-narration-copy">
          <span>{String(step + 1).padStart(2, "0")} / {String(storySteps.length).padStart(2, "0")} · {current.label}</span>
          <strong>{current.title}</strong>
          <p>{current.body}</p>
        </div>
        <div className="process-step-buttons" aria-label="Process steps">
          {storySteps.map((item, index) => (
            <button
              type="button"
              key={`${item.label}-${index}`}
              className={index === step ? "active" : ""}
              onClick={() => { setManualTab(null); setStep(index); }}
              aria-label={`Show step ${index + 1}: ${item.label}`}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="process-progress" aria-hidden="true"><span style={{ width: stepProgress }} /></div>
      </div>
    </div>
  );
}
