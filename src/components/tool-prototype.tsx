"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePause,
  Clock3,
  GripVertical,
  ImagePlus,
  Layers3,
  ListOrdered,
  MoreHorizontal,
  PackageCheck,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrandMark } from "./brand-mark";
import { GamePhoto } from "./game-photo";

type CopyTone = "a" | "b" | "c";
type QueueStatus = "ready" | "needs_photos" | "review";
type AppView = "queue" | "activity" | "settings";
type RestockStage = "idle" | "sold" | "applying" | "live";

type QueuedCopy = {
  id: string;
  reference: string;
  tone: CopyTone;
  photoCount: number;
  note: string;
  status: QueueStatus;
};

type Listing = {
  id: string;
  title: string;
  edition: string;
  price: string;
  currentTone: CopyTone;
  currentNote: string;
  queue: QueuedCopy[];
  views: number;
};

const initialListings: Listing[] = [
  {
    id: "266804979941",
    title: "Mario Kart: Double Dash!!",
    edition: "Nintendo GameCube · Complete",
    price: "$69.99",
    currentTone: "a",
    currentNote: "Very good · Light corner wear",
    views: 38,
    queue: [
      { id: "mk-b", reference: "GC-MKDD-042", tone: "b", photoCount: 6, note: "Clean case and manual", status: "ready" },
      { id: "mk-c", reference: "GC-MKDD-043", tone: "c", photoCount: 5, note: "Minor case wear", status: "ready" },
    ],
  },
  {
    id: "566887421133",
    title: "Super Smash Bros. Melee",
    edition: "Nintendo GameCube · Disc only",
    price: "$48.00",
    currentTone: "c",
    currentNote: "Good · Tested, light surface marks",
    views: 21,
    queue: [
      { id: "ssbm-a", reference: "GC-SSBM-018", tone: "a", photoCount: 4, note: "Tested · Fine marks", status: "ready" },
    ],
  },
  {
    id: "566887421129",
    title: "Super Mario Sunshine",
    edition: "Nintendo GameCube · Disc only",
    price: "$39.99",
    currentTone: "b",
    currentNote: "Very good · Tested and clean",
    views: 14,
    queue: [],
  },
  {
    id: "267552314896",
    title: "The Legend of Zelda: Majora’s Mask",
    edition: "Nintendo 64 · Japanese",
    price: "$54.00",
    currentTone: "a",
    currentNote: "Good · Label wear shown",
    views: 17,
    queue: [
      { id: "zelda-review", reference: "N64-MM-006", tone: "c", photoCount: 3, note: "Condition note needed", status: "review" },
    ],
  },
];

const activityRows = [
  { time: "Today, 2:14 PM", title: "Copy GC-MKDD-041 went live", detail: "Mario Kart: Double Dash!! · 6 photos verified", kind: "live" },
  { time: "Today, 2:13 PM", title: "Sale confirmed on eBay", detail: "Order 19-•••••-55394 · Listing paused at zero", kind: "sale" },
  { time: "Yesterday, 6:42 PM", title: "Copy GC-SSBM-018 marked ready", detail: "Super Smash Bros. Melee · Disc only", kind: "ready" },
  { time: "Jul 18, 11:06 AM", title: "Queue needs attention", detail: "Super Mario Sunshine has no next copy", kind: "warning" },
];

function queueStatusLabel(status: QueueStatus) {
  if (status === "ready") return "Ready";
  if (status === "review") return "Needs review";
  return "Needs photos";
}

export function ToolPrototype() {
  const [view, setView] = useState<AppView>("queue");
  const [listings, setListings] = useState(initialListings);
  const [selectedId, setSelectedId] = useState(initialListings[0].id);
  const [filter, setFilter] = useState<"all" | "low" | "attention">("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [useDemoPhotos, setUseDemoPhotos] = useState(false);
  const [draftReference, setDraftReference] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [formError, setFormError] = useState("");
  const [restockStage, setRestockStage] = useState<RestockStage>("idle");
  const [toast, setToast] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const objectUrls = useRef<string[]>([]);

  const selected = listings.find((listing) => listing.id === selectedId) ?? listings[0];

  useEffect(() => {
    return () => {
      timers.current.forEach(window.clearTimeout);
      objectUrls.current.forEach(URL.revokeObjectURL);
    };
  }, []);

  const filteredListings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return listings.filter((listing) => {
      const matchesSearch = !query || listing.title.toLowerCase().includes(query) || listing.id.includes(query);
      const matchesFilter =
        filter === "all" ||
        (filter === "low" && listing.queue.filter((copy) => copy.status === "ready").length <= 1) ||
        (filter === "attention" && (listing.queue.length === 0 || listing.queue.some((copy) => copy.status !== "ready")));
      return matchesSearch && matchesFilter;
    });
  }, [filter, listings, search]);

  const stats = useMemo(() => {
    const ready = listings.reduce((total, listing) => total + listing.queue.filter((copy) => copy.status === "ready").length, 0);
    const attention = listings.filter((listing) => listing.queue.length === 0 || listing.queue.some((copy) => copy.status !== "ready")).length;
    return { managed: listings.length, ready, attention };
  }, [listings]);

  function selectListing(id: string) {
    setSelectedId(id);
    setRestockStage("idle");
    setMobileNavOpen(false);
  }

  function resetDraft() {
    objectUrls.current.forEach(URL.revokeObjectURL);
    objectUrls.current = [];
    setPhotoUrls([]);
    setUseDemoPhotos(false);
    setDraftReference("");
    setDraftNote("");
    setFormError("");
  }

  function closeAdd() {
    setAddOpen(false);
    resetDraft();
  }

  function openAdd() {
    resetDraft();
    setDraftReference(`QUEUE-${String(selected.queue.length + 1).padStart(3, "0")}`);
    setAddOpen(true);
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).slice(0, 8);
    objectUrls.current.forEach(URL.revokeObjectURL);
    const urls = files.map((file) => URL.createObjectURL(file));
    objectUrls.current = urls;
    setPhotoUrls(urls);
    setUseDemoPhotos(false);
    setFormError("");
  }

  function queueDraft() {
    const photoCount = useDemoPhotos ? 6 : photoUrls.length;
    if (photoCount === 0) {
      setFormError("Add photos before this copy can enter the queue.");
      return;
    }
    if (!draftNote.trim()) {
      setFormError("Add a condition note that identifies this copy.");
      return;
    }
    const tone: CopyTone = selected.queue.length % 2 === 0 ? "b" : "c";
    const newCopy: QueuedCopy = {
      id: `queued-${Date.now()}`,
      reference: draftReference.trim() || `COPY-${Date.now().toString().slice(-4)}`,
      tone,
      photoCount,
      note: draftNote.trim(),
      status: "ready",
    };
    setListings((current) =>
      current.map((listing) =>
        listing.id === selected.id ? { ...listing, queue: [...listing.queue, newCopy] } : listing,
      ),
    );
    setToast(`${newCopy.reference} added to ${selected.title}`);
    setAddOpen(false);
    resetDraft();
    timers.current.push(window.setTimeout(() => setToast(""), 3200));
  }

  function moveQueueItem(index: number, direction: -1 | 1) {
    setListings((current) =>
      current.map((listing) => {
        if (listing.id !== selected.id) return listing;
        const nextQueue = [...listing.queue];
        const target = index + direction;
        if (target < 0 || target >= nextQueue.length) return listing;
        [nextQueue[index], nextQueue[target]] = [nextQueue[target], nextQueue[index]];
        return { ...listing, queue: nextQueue };
      }),
    );
  }

  function clearRestockTimers() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }

  function simulateRestock() {
    const nextReady = selected.queue.find((copy) => copy.status === "ready");
    if (!nextReady) {
      setToast("No ready copy. The listing would stay safely out of stock.");
      timers.current.push(window.setTimeout(() => setToast(""), 3600));
      return;
    }
    clearRestockTimers();
    setRestockStage("sold");
    timers.current.push(
      window.setTimeout(() => setRestockStage("applying"), 850),
      window.setTimeout(() => {
        setListings((current) =>
          current.map((listing) => {
            if (listing.id !== selected.id) return listing;
            const promoted = listing.queue.find((copy) => copy.status === "ready");
            if (!promoted) return listing;
            return {
              ...listing,
              currentTone: promoted.tone,
              currentNote: `Very good · ${promoted.note}`,
              queue: listing.queue.filter((copy) => copy.id !== promoted.id),
            };
          }),
        );
        setRestockStage("live");
        setToast(`${nextReady.reference} is now live on the same listing`);
      }, 1950),
      window.setTimeout(() => setToast(""), 5200),
    );
  }

  function resetDemoData() {
    clearRestockTimers();
    setListings(initialListings);
    setSelectedId(initialListings[0].id);
    setRestockStage("idle");
    setToast("Demo data reset");
    timers.current.push(window.setTimeout(() => setToast(""), 2600));
  }

  return (
    <main className="tool-app">
      <aside id="tool-navigation" className={`tool-sidebar ${mobileNavOpen ? "tool-sidebar-open" : ""}`}>
        <div className="tool-sidebar-top">
          <Link className="tool-brand-link" href="/">
            <BrandMark />
          </Link>
          <button className="mobile-close" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={19} /></button>
        </div>
        <nav className="tool-nav" aria-label="Tool navigation">
          <button className={view === "queue" ? "active" : ""} onClick={() => { setView("queue"); setMobileNavOpen(false); }} type="button">
            <ListOrdered size={18} /> Queue <span>{stats.managed}</span>
          </button>
          <button className={view === "activity" ? "active" : ""} onClick={() => { setView("activity"); setMobileNavOpen(false); }} type="button">
            <Activity size={18} /> Activity
          </button>
          <button className={view === "settings" ? "active" : ""} onClick={() => { setView("settings"); setMobileNavOpen(false); }} type="button">
            <Settings size={18} /> Settings
          </button>
        </nav>
        <div className="sidebar-grow" />
        <div className="demo-mode-card">
          <span className="demo-mode-dot" />
          <div><strong>Demo workspace</strong><span>Changes stay in this tab</span></div>
        </div>
        <div className="tool-account">
          <span className="account-avatar">GC</span>
          <div><strong>Grail Club</strong><span>eBay US</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      {mobileNavOpen && <button className="sidebar-scrim" type="button" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}

      <section className="tool-main">
        <header className="tool-topbar">
          <button className="mobile-menu" type="button" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" aria-controls="tool-navigation" aria-expanded={mobileNavOpen}><Layers3 size={19} /></button>
          <div className="tool-breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{view === "queue" ? "Restock queue" : view === "activity" ? "Activity" : "Settings"}</strong></div>
          <div className="tool-topbar-actions">
            <Link href="/" className="tool-quiet-button"><ArrowLeft size={15} /> Website</Link>
            {view === "queue" && <button className="tool-primary-button" type="button" onClick={openAdd}><Plus size={16} /> Add next copy</button>}
          </div>
        </header>

        {view === "queue" && (
          <div className="tool-page tool-queue-page">
            <div className="tool-page-heading">
              <div>
                <span className="tool-eyebrow">Inventory continuity</span>
                <h1>Restock queue</h1>
                <p>Keep the next photographed copy ready before the live one sells.</p>
              </div>
              <div className="queue-summary" aria-label="Queue summary">
                <span><strong>{stats.managed}</strong> Managed</span>
                <span><strong>{stats.ready}</strong> Ready</span>
                <span className={stats.attention ? "summary-attention" : ""}><strong>{stats.attention}</strong> Need attention</span>
              </div>
            </div>

            <div className="tool-workspace-grid">
              <section className="listing-browser">
                <div className="browser-tools">
                  <label className="tool-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings" /></label>
                  <div className="filter-tabs">
                    <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">All</button>
                    <button className={filter === "low" ? "active" : ""} onClick={() => setFilter("low")} type="button">Low queue</button>
                    <button className={filter === "attention" ? "active" : ""} onClick={() => setFilter("attention")} type="button">Attention</button>
                  </div>
                </div>
                <div className="listing-list">
                  {filteredListings.map((listing) => {
                    const readyCount = listing.queue.filter((copy) => copy.status === "ready").length;
                    const needsAttention = listing.queue.length === 0 || listing.queue.some((copy) => copy.status !== "ready");
                    return (
                      <button className={`listing-row ${selected.id === listing.id ? "selected" : ""}`} key={listing.id} onClick={() => selectListing(listing.id)} type="button">
                        <GamePhoto copy={listing.currentTone} angle="front" />
                        <span className="listing-row-copy">
                          <strong>{listing.title}</strong>
                          <small>{listing.edition}</small>
                          <span className="listing-row-meta">{listing.price} <i /> #{listing.id.slice(-6)}</span>
                        </span>
                        <span className={`listing-queue-health ${needsAttention ? "health-attention" : ""}`}>
                          {needsAttention && readyCount === 0 ? <AlertTriangle size={14} /> : <Layers3 size={14} />}
                          {readyCount} ready
                        </span>
                      </button>
                    );
                  })}
                  {filteredListings.length === 0 && <div className="browser-empty"><Search size={20} /><strong>No matching listings</strong><span>Try a different title or filter.</span></div>}
                </div>
              </section>

              <section className="listing-detail">
                <div className="detail-header">
                  <div>
                    <span className="tool-eyebrow">eBay listing · #{selected.id}</span>
                    <h2>{selected.title}</h2>
                    <p>{selected.edition}</p>
                  </div>
                  <button className="icon-button" type="button" aria-label="Listing actions"><MoreHorizontal size={20} /></button>
                </div>

                <div className="live-copy-card">
                  <div className={`live-copy-photo restock-${restockStage}`}>
                    <GamePhoto copy={selected.currentTone} angle="front" />
                    {restockStage === "applying" && <span className="tool-photo-overlay"><span className="apply-spinner" /> Applying next copy</span>}
                    {restockStage === "sold" && <span className="tool-photo-overlay tool-photo-paused"><CirclePause size={18} /> Listing paused at zero</span>}
                  </div>
                  <div className="live-copy-info">
                    <div className="live-copy-status"><span className={`live-status-dot ${restockStage === "sold" || restockStage === "applying" ? "paused" : ""}`} />{restockStage === "sold" ? "Sold · out of stock" : restockStage === "applying" ? "Restocking" : "Live on eBay"}</div>
                    <span className="live-copy-label">Current copy</span>
                    <h3>{selected.currentNote}</h3>
                    <div className="live-copy-meta"><span>{selected.price}</span><span>{selected.views} views</span><span>Qty 1</span></div>
                    <button className="simulate-button" type="button" onClick={simulateRestock} disabled={restockStage === "sold" || restockStage === "applying"}>
                      {restockStage === "sold" || restockStage === "applying" ? <><span className="apply-spinner" /> Restocking…</> : restockStage === "live" ? <><Play size={15} fill="currentColor" /> Simulate next sale</> : <><Play size={15} fill="currentColor" /> Simulate sale</>}
                    </button>
                  </div>
                </div>

                <div className="queue-section-header">
                  <div><span className="tool-eyebrow">Upcoming copies</span><h3>{selected.queue.length ? `${selected.queue.length} in line` : "Queue is empty"}</h3></div>
                  <button className="tool-secondary-button" type="button" onClick={openAdd}><Plus size={15} /> Add copy</button>
                </div>

                {selected.queue.length ? (
                  <div className="copy-queue-list">
                    {selected.queue.map((copy, index) => (
                      <div className={`copy-queue-row status-${copy.status}`} key={copy.id}>
                        <span className="queue-grip"><GripVertical size={17} /></span>
                        <span className="queue-order">{index + 1}</span>
                        <GamePhoto copy={copy.tone} angle={index % 2 === 0 ? "front" : "disc"} />
                        <div className="copy-queue-info">
                          <strong>{copy.reference}</strong>
                          <span>{copy.note}</span>
                          <small>{copy.photoCount} photos</small>
                        </div>
                        <span className={`copy-state state-${copy.status}`}>
                          {copy.status === "ready" ? <Check size={13} /> : <AlertTriangle size={13} />}
                          {queueStatusLabel(copy.status)}
                        </span>
                        <div className="queue-order-actions">
                          <button type="button" onClick={() => moveQueueItem(index, -1)} disabled={index === 0} aria-label={`Move ${copy.reference} earlier`}><ArrowUp size={14} /></button>
                          <button type="button" onClick={() => moveQueueItem(index, 1)} disabled={index === selected.queue.length - 1} aria-label={`Move ${copy.reference} later`}><ArrowDown size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="queue-empty-state">
                    <span className="empty-state-icon"><ImagePlus size={22} /></span>
                    <div><strong>Add the next copy before this one sells.</strong><span>If the live copy sells now, the listing will pause safely at zero.</span></div>
                    <button className="tool-primary-button" type="button" onClick={openAdd}><Camera size={15} /> Add photos</button>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {view === "activity" && (
          <div className="tool-page narrow-tool-page">
            <div className="tool-page-heading">
              <div><span className="tool-eyebrow">Audit trail</span><h1>Activity</h1><p>Every sale, pause, and photo handoff in one place.</p></div>
              <button className="tool-secondary-button" type="button"><ChevronDown size={15} /> All activity</button>
            </div>
            <div className="activity-panel">
              {activityRows.map((row) => (
                <div className="activity-row" key={`${row.time}-${row.title}`}>
                  <span className={`activity-icon activity-${row.kind}`}>
                    {row.kind === "live" && <Check size={16} />}
                    {row.kind === "sale" && <PackageCheck size={16} />}
                    {row.kind === "ready" && <Camera size={16} />}
                    {row.kind === "warning" && <AlertTriangle size={16} />}
                  </span>
                  <div><strong>{row.title}</strong><span>{row.detail}</span></div>
                  <time>{row.time}</time>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="tool-page narrow-tool-page">
            <div className="tool-page-heading">
              <div><span className="tool-eyebrow">Workspace rules</span><h1>Settings</h1><p>Control when a queued copy is allowed to go live.</p></div>
            </div>
            <div className="settings-stack">
              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon"><Store size={19} /></span><div><h2>eBay account</h2><p>The store whose listings appear in this workspace.</p></div></div>
                <div className="settings-account-row"><span className="account-avatar">GC</span><div><strong>Grail Club</strong><span>Demo connection · eBay US</span></div><button className="tool-secondary-button" type="button">Manage</button></div>
              </section>
              <section className="settings-card">
                <div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={19} /></span><div><h2>Restock safeguards</h2><p>A copy must pass these checks before quantity returns to one.</p></div></div>
                <label className="setting-toggle-row"><span><strong>Require a condition note</strong><small>Stops photo-only copies with no wear description.</small></span><input type="checkbox" defaultChecked /><i /></label>
                <label className="setting-toggle-row"><span><strong>Require at least four photos</strong><small>Cover, back, media, and condition detail.</small></span><input type="checkbox" defaultChecked /><i /></label>
                <label className="setting-toggle-row"><span><strong>Verify listing after handoff</strong><small>Keeps quantity at zero until eBay returns the new photo set.</small></span><input type="checkbox" defaultChecked /><i /></label>
              </section>
              <section className="settings-card danger-lite-card">
                <div className="settings-card-heading"><span className="settings-icon"><RotateCcw size={19} /></span><div><h2>Reset prototype</h2><p>Restore the original demo listings and queues.</p></div></div>
                <button className="tool-secondary-button" type="button" onClick={resetDemoData}>Reset demo data</button>
              </section>
            </div>
          </div>
        )}
      </section>

      {addOpen && (
        <div className="add-copy-layer" role="dialog" aria-modal="true" aria-labelledby="add-copy-title">
          <button className="add-copy-scrim" type="button" onClick={closeAdd} aria-label="Close add copy panel" />
          <section className="add-copy-panel">
            <header className="add-copy-header">
              <div><span className="tool-eyebrow">{selected.title}</span><h2 id="add-copy-title">Add the next copy</h2><p>These photos become the listing after the current copy sells.</p></div>
              <button className="icon-button" type="button" onClick={closeAdd} aria-label="Close"><X size={20} /></button>
            </header>

            <div className="add-copy-body">
              <div className="form-section-heading"><span>1</span><div><strong>Add condition photos</strong><small>Use the order buyers should see on eBay.</small></div></div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFiles} hidden />
              {photoUrls.length || useDemoPhotos ? (
                <div className="draft-photo-grid">
                  {photoUrls.length
                    ? photoUrls.map((url, index) => <div className="uploaded-photo" key={url}><img src={url} alt={`Selected item photo ${index + 1}`} /><span>{index === 0 ? "Cover" : index + 1}</span></div>)
                    : ["front", "back", "disc", "detail"].map((angle, index) => <div className="uploaded-photo" key={angle}><GamePhoto copy="b" angle={angle as "front" | "back" | "disc" | "detail"} /><span>{index === 0 ? "Cover" : index + 1}</span></div>)}
                  <button className="add-more-photos" type="button" onClick={() => fileInputRef.current?.click()}><Plus size={18} /><span>Add more</span></button>
                </div>
              ) : (
                <div className="photo-dropzone">
                  <span className="dropzone-icon"><Upload size={22} /></span>
                  <strong>Drop photos here or choose from your device</strong>
                  <span>JPG, PNG, or HEIC · up to 8 photos</span>
                  <div><button className="tool-primary-button" type="button" onClick={() => fileInputRef.current?.click()}>Choose photos</button><button className="tool-quiet-button" type="button" onClick={() => { setUseDemoPhotos(true); setFormError(""); }}>Use demo photos</button></div>
                </div>
              )}

              <div className="form-section-heading"><span>2</span><div><strong>Identify this copy</strong><small>Keep internal reference and buyer-facing condition separate.</small></div></div>
              <label className="tool-field"><span>Internal reference</span><input value={draftReference} onChange={(event) => setDraftReference(event.target.value)} placeholder="Example: GC-MKDD-044" /><small>Only visible to your team.</small></label>
              <label className="tool-field"><span>Condition note</span><textarea value={draftNote} onChange={(event) => { setDraftNote(event.target.value); setFormError(""); }} placeholder="Example: Clean case and manual. Disc has a few fine marks; tested and working." rows={4} /><small>This copy-specific note will appear with its photos.</small></label>
              <div className="unchanged-fields"><ShieldCheck size={17} /><div><strong>The reusable listing stays unchanged</strong><span>Title, price, category, shipping, and condition tier remain the same.</span></div><CircleHelp size={17} /></div>
              {formError && <div className="form-error"><AlertTriangle size={16} />{formError}</div>}
            </div>

            <footer className="add-copy-footer">
              <button className="tool-quiet-button" type="button" onClick={closeAdd}>Cancel</button>
              <button className="tool-primary-button" type="button" onClick={queueDraft}>Add to queue <ArrowRight size={16} /></button>
            </footer>
          </section>
        </div>
      )}

      {toast && <div className="tool-toast" role="status"><Check size={17} />{toast}</div>}
    </main>
  );
}
