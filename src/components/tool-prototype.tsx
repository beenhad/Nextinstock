"use client";

import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  ImageIcon,
  LayoutList,
  PackageCheck,
  Play,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";
import { GamePhoto } from "./game-photo";

type ToolView = "tasks" | "activity" | "settings";
type HandoffState = "idle" | "sold" | "applying" | "live";

const builderSteps = ["Listing", "Next copy", "Automation", "Review"];

function EbayBadge() {
  return (
    <span className="tool-ebay-badge" aria-label="eBay connected account">
      <span>e</span><span>b</span><span>a</span><span>y</span>
    </span>
  );
}

export function ToolPrototype() {
  const [view, setView] = useState<ToolView>("tasks");
  const [builderStep, setBuilderStep] = useState(0);
  const [taskActive, setTaskActive] = useState(true);
  const [handoff, setHandoff] = useState<HandoffState>("idle");
  const [currentCopy, setCurrentCopy] = useState<"current" | "next">("current");
  const [toast, setToast] = useState("");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function startBuilder() {
    setView("tasks");
    setBuilderStep(1);
    setToast("");
  }

  function nextBuilderStep() {
    setBuilderStep((value) => Math.min(4, value + 1));
  }

  function previousBuilderStep() {
    setBuilderStep((value) => Math.max(1, value - 1));
  }

  function activateTask() {
    setTaskActive(true);
    setBuilderStep(0);
    setToast("Restock task activated");
    window.setTimeout(() => setToast(""), 3200);
  }

  function runHandoff() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setCurrentCopy("current");
    setHandoff("sold");
    setToast("Sale detected · quantity held at zero");
    timers.current.push(
      window.setTimeout(() => {
        setHandoff("applying");
        setToast("Applying queued photos and condition");
      }, 900),
      window.setTimeout(() => {
        setCurrentCopy("next");
        setHandoff("live");
        setToast("Copy B is live on eBay");
      }, 2200),
      window.setTimeout(() => setToast(""), 5200),
    );
  }

  return (
    <div className="tool-shell">
      <aside className="tool-sidebar">
        <Link href="/" className="tool-brand-link"><BrandMark /></Link>
        <nav aria-label="Tool navigation">
          <button className={view === "tasks" ? "active" : ""} type="button" onClick={() => { setView("tasks"); setBuilderStep(0); }}>
            <LayoutList size={17} /> Restock tasks
          </button>
          <button className={view === "activity" ? "active" : ""} type="button" onClick={() => { setView("activity"); setBuilderStep(0); }}>
            <Activity size={17} /> Activity
          </button>
          <button className={view === "settings" ? "active" : ""} type="button" onClick={() => { setView("settings"); setBuilderStep(0); }}>
            <Settings size={17} /> Settings
          </button>
        </nav>
        <div className="tool-account-card">
          <EbayBadge />
          <span><strong>nextinstock</strong><small><Check size={11} /> 164 listings synced</small></span>
        </div>
      </aside>

      <div className="tool-main">
        <header className="tool-topbar">
          <div className="tool-mobile-brand"><BrandMark /></div>
          <div className="tool-global-search"><Search size={16} /><span>Search listings or item numbers</span><kbd>⌘ K</kbd></div>
          <div className="tool-top-actions">
            <span className="tool-sync-status"><span /> Synced 2 min ago</span>
            <button className="tool-avatar" type="button">GC</button>
          </div>
        </header>

        <main className="tool-workspace">
          {builderStep > 0 ? (
            <TaskBuilder
              step={builderStep}
              onNext={nextBuilderStep}
              onBack={previousBuilderStep}
              onClose={() => setBuilderStep(0)}
              onActivate={activateTask}
            />
          ) : view === "tasks" ? (
            <TasksView
              taskActive={taskActive}
              handoff={handoff}
              currentCopy={currentCopy}
              onNew={startBuilder}
              onRun={runHandoff}
            />
          ) : view === "activity" ? (
            <ActivityView handoff={handoff} />
          ) : (
            <SettingsView />
          )}
        </main>
      </div>

      {toast && <div className="tool-toast"><CircleCheck size={17} /><span>{toast}</span></div>}
    </div>
  );
}

function TasksView({
  taskActive,
  handoff,
  currentCopy,
  onNew,
  onRun,
}: {
  taskActive: boolean;
  handoff: HandoffState;
  currentCopy: "current" | "next";
  onNew: () => void;
  onRun: () => void;
}) {
  const isRunning = handoff === "sold" || handoff === "applying";
  return (
    <>
      <div className="tool-page-heading">
        <div><span>Inventory automation</span><h1>Restock tasks</h1><p>Keep replenishable eBay listings matched to the physical copy being sold.</p></div>
        <button className="tool-primary-button" type="button" onClick={onNew}><Plus size={16} /> New restock task</button>
      </div>

      <div className="tool-stat-row">
        <article><span>Active tasks</span><strong>4</strong><small><Store size={13} /> 4 eBay listings</small></article>
        <article><span>Next copies ready</span><strong>7</strong><small><ImageIcon size={13} /> 38 photos verified</small></article>
        <article><span>Restocked this month</span><strong>18</strong><small><PackageCheck size={13} /> 100% successful</small></article>
        <article><span>Needs attention</span><strong>1</strong><small><ShieldCheck size={13} /> Held safely at zero</small></article>
      </div>

      <section className="tool-task-table-section">
        <div className="tool-table-toolbar">
          <div className="tool-table-tabs"><button className="active" type="button">All tasks <span>4</span></button><button type="button">Attention <span>1</span></button></div>
          <div className="tool-table-search"><Search size={15} /> Search</div>
        </div>
        <div className="tool-task-table">
          <div className="tool-task-head"><span>Listing</span><span>Live copy</span><span>Next copy</span><span>Status</span><span /></div>
          <div className="tool-task-row tool-task-featured">
            <div className="tool-listing-cell">
              <GamePhoto copy={currentCopy} />
              <span><strong>Pokemon XD: Gale of Darkness</strong><small>eBay · 266994813467 · $84.99</small></span>
            </div>
            <div className="tool-copy-cell"><GamePhoto copy={currentCopy} /><span><strong>{currentCopy === "current" ? "Copy A" : "Copy B"}</strong><small>Good · 6 photos</small></span></div>
            <div className="tool-copy-cell"><GamePhoto copy={currentCopy === "current" ? "next" : "current"} /><span><strong>{currentCopy === "current" ? "Copy B" : "Add next"}</strong><small>{currentCopy === "current" ? "Ready · 6 photos" : "Queue is empty"}</small></span></div>
            <span className={`tool-task-status status-${handoff}`}>
              <span />{handoff === "sold" ? "Sale detected" : handoff === "applying" ? "Restocking" : "Active"}
            </span>
            <button className="tool-test-button" type="button" onClick={onRun} disabled={isRunning || !taskActive}>
              <Play size={13} /> {isRunning ? "Running" : "Test handoff"}
            </button>
          </div>
          <div className="tool-task-row">
            <div className="tool-listing-cell muted-listing"><div className="tool-photo-placeholder">GC</div><span><strong>Mario Kart: Double Dash!!</strong><small>eBay · 266804979941 · $69.99</small></span></div>
            <div className="tool-copy-cell"><div className="tool-photo-placeholder">A</div><span><strong>Copy A</strong><small>Very good · 5 photos</small></span></div>
            <div className="tool-copy-cell"><div className="tool-photo-placeholder">B</div><span><strong>Copy B</strong><small>Ready · 6 photos</small></span></div>
            <span className="tool-task-status"><span />Active</span><button className="tool-row-menu" type="button">•••</button>
          </div>
          <div className="tool-task-row">
            <div className="tool-listing-cell muted-listing"><div className="tool-photo-placeholder purple">64</div><span><strong>Zelda: Majora&apos;s Mask</strong><small>eBay · 267552314896 · $54.00</small></span></div>
            <div className="tool-copy-cell"><div className="tool-photo-placeholder purple">A</div><span><strong>Copy A</strong><small>Good · 4 photos</small></span></div>
            <div className="tool-copy-cell"><div className="tool-photo-placeholder empty">+</div><span><strong>No copy queued</strong><small>Add photos to continue</small></span></div>
            <span className="tool-task-status warning"><span />Attention</span><button className="tool-row-menu" type="button">•••</button>
          </div>
        </div>
      </section>
    </>
  );
}

function TaskBuilder({
  step,
  onNext,
  onBack,
  onClose,
  onActivate,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="builder-shell">
      <div className="builder-heading">
        <div><button type="button" onClick={onClose}><ArrowLeft size={16} /> Restock tasks</button><h1>New restock task</h1><p>nextinstock is connected and 164 eBay listings are synced.</p></div>
        <button className="builder-close" type="button" onClick={onClose} aria-label="Close task setup"><X size={18} /></button>
      </div>
      <div className="builder-stepper" aria-label="Task setup progress">
        {builderSteps.map((label, index) => {
          const number = index + 1;
          return <div className={number === step ? "active" : number < step ? "complete" : ""} key={label}><span>{number < step ? <Check size={13} /> : number}</span><strong>{label}</strong></div>;
        })}
      </div>

      <div className="builder-card">
        {step === 1 && <BuilderListing />}
        {step === 2 && <BuilderCopy />}
        {step === 3 && <BuilderAutomation />}
        {step === 4 && <BuilderReview />}
        <div className="builder-actions">
          <button className="builder-secondary" type="button" onClick={step === 1 ? onClose : onBack}>{step === 1 ? "Cancel" : "Back"}</button>
          {step < 4 ? (
            <button className="tool-primary-button" type="button" onClick={onNext}>Continue <ArrowRight size={15} /></button>
          ) : (
            <button className="tool-primary-button" type="button" onClick={onActivate}>Activate restock task <Check size={15} /></button>
          )}
        </div>
      </div>
    </div>
  );
}

function BuilderListing() {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 1 · Listing</span>
      <h2>Select the listing to replenish</h2>
      <p>Choose one synced eBay listing. Item details and sales history stay unchanged.</p>
      <div className="builder-search"><Search size={16} /><span>Search by title, SKU, or item number</span><button type="button">All listings <ChevronDown size={13} /></button></div>
      <div className="builder-listing-selected">
        <span className="builder-radio"><span /></span>
        <GamePhoto copy="current" />
        <div><strong>Pokemon XD: Gale of Darkness (Nintendo GameCube, 2005) Japanese Complete Tested</strong><span>Item 266994813467 · Good · 8 sold</span></div>
        <strong>US $84.99</strong>
        <span className="builder-live-pill">Live</span>
      </div>
    </div>
  );
}

function BuilderCopy() {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 2 · Next copy</span>
      <h2>Add the copy that sells next</h2>
      <p>These photos and notes will replace the current copy after it sells.</p>
      <div className="builder-copy-grid">
        <div className="builder-upload-area">
          <div className="builder-photo-grid"><GamePhoto copy="next" /><GamePhoto copy="current" /><GamePhoto copy="next" /><GamePhoto copy="current" /></div>
          <button type="button"><Plus size={15} /> Add more photos</button>
          <small>6 photos ready · drag to reorder</small>
        </div>
        <div className="builder-fields">
          <label><span>Internal reference</span><input value="GC-PKXD-009" readOnly /></label>
          <label><span>Condition</span><button type="button" className="builder-select">Good <ChevronDown size={14} /></button></label>
          <label><span>Condition note</span><textarea value="Clean case, manual included. Light shelf wear shown in photos." readOnly /></label>
          <div className="builder-verified"><Check size={14} /> Required copy details are complete</div>
        </div>
      </div>
    </div>
  );
}

function BuilderAutomation() {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 3 · Automation</span>
      <h2>Set the sale-to-restock handoff</h2>
      <p>Nextinstock checks the queue before it makes the listing available again.</p>
      <div className="builder-rule-chain">
        <div><span className="builder-rule-label">WHEN</span><span className="builder-rule-icon"><PackageCheck size={20} /></span><p><strong>A sale reaches quantity zero</strong><small>Detected from eBay order activity</small></p></div>
        <ArrowRight size={18} />
        <div><span className="builder-rule-label">THEN</span><span className="builder-rule-icon"><ImageIcon size={20} /></span><p><strong>Apply the first queued copy</strong><small>Replace photos and condition note</small></p></div>
        <ArrowRight size={18} />
        <div><span className="builder-rule-label">FINALLY</span><span className="builder-rule-icon"><Store size={20} /></span><p><strong>Set quantity to one</strong><small>Only after every update succeeds</small></p></div>
      </div>
      <label className="builder-safety-option"><span className="builder-checkbox"><Check size={13} /></span><span><strong>Hold the listing at zero if the queue is incomplete</strong><small>Prevents a sale under old photos or the wrong condition.</small></span></label>
    </div>
  );
}

function BuilderReview() {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 4 · Review</span>
      <h2>Ready to protect this listing</h2>
      <p>Review the exact copy handoff before activating the task.</p>
      <div className="builder-review-card">
        <div className="builder-review-listing"><GamePhoto copy="current" /><span><small>eBay item 266994813467</small><strong>Pokemon XD: Gale of Darkness</strong><em>US $84.99 · Good</em></span></div>
        <div className="builder-review-arrow"><ArrowRight size={20} /></div>
        <div className="builder-review-listing"><GamePhoto copy="next" /><span><small>First copy in queue</small><strong>GC-PKXD-009</strong><em>6 photos · Good</em></span></div>
      </div>
      <div className="builder-review-checks">
        <span><Check size={14} /> eBay listing selected</span><span><Check size={14} /> Next copy complete</span><span><Check size={14} /> Safe-zero rule enabled</span>
      </div>
    </div>
  );
}

function ActivityView({ handoff }: { handoff: HandoffState }) {
  const rows = [
    handoff === "live" ? ["Just now", "Copy B went live", "Item 266994813467 · 6 photos verified"] : ["Today, 10:42 AM", "Copy GC-MKDD-041 went live", "Mario Kart: Double Dash!! · 6 photos verified"],
    ["Today, 10:41 AM", "Sale confirmed on eBay", "Quantity held at zero during handoff"],
    ["Yesterday, 6:42 PM", "Next copy marked ready", "Pokemon XD: Gale of Darkness · Good"],
  ];
  return (
    <>
      <div className="tool-page-heading"><div><span>Audit trail</span><h1>Activity</h1><p>Every sale, queue change, and listing handoff in one place.</p></div></div>
      <div className="activity-card">{rows.map(([time, title, detail]) => <article key={`${time}-${title}`}><span className="activity-icon"><Clock3 size={16} /></span><div><strong>{title}</strong><p>{detail}</p></div><time>{time}</time></article>)}</div>
    </>
  );
}

function SettingsView() {
  return (
    <>
      <div className="tool-page-heading"><div><span>Workspace</span><h1>Settings</h1><p>Connected marketplace and default safety behavior.</p></div></div>
      <div className="settings-card">
        <div><EbayBadge /><span><strong>nextinstock</strong><small>Connected · 164 listings synced</small></span><button type="button">Manage connection</button></div>
        <div><ShieldCheck size={21} /><span><strong>Safe-zero protection</strong><small>Keep listings unavailable until the next copy passes validation.</small></span><span className="settings-on">On</span></div>
      </div>
    </>
  );
}
