"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  Database,
  ExternalLink,
  HardDrive,
  ImageIcon,
  LayoutList,
  LoaderCircle,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ActivityEvent,
  ListingSnapshot,
  RestockTask,
  SystemStatus,
  WorkerResult,
} from "@/lib/types";
import { BrandMark } from "./brand-mark";

type ToolView = "tasks" | "activity" | "settings";

const builderSteps = ["Listing", "Next copy", "Automation", "Review"];

function EbayBadge() {
  return (
    <span className="tool-ebay-badge" aria-label="eBay connected account">
      <span>e</span><span>b</span><span>a</span><span>y</span>
    </span>
  );
}

function money(value: number | null, currency = "USD") {
  if (value === null) return "Price unavailable";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function timeLabel(value: string) {
  const timestamp = new Date(value).getTime();
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(value).toLocaleDateString();
}

function statusLabel(task: RestockTask) {
  if (task.status === "dry_run_ready") return "Dry-run ready";
  if (task.status === "processing") return "Restocking";
  if (task.status === "attention") return "Needs attention";
  if (task.status === "error") return "Error";
  if (task.status === "paused") return "Paused";
  return "Active";
}

function ListingImage({
  src,
  alt,
  className = "",
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (!src) return <span className={`tool-photo-placeholder ${className}`}>?</span>;
  return <img className={`tool-real-photo ${className}`} src={src} alt={alt} />;
}

function LocalFilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);
  return url ? <img src={url} alt={file.name} /> : <span />;
}

export function ToolPrototype() {
  const [view, setView] = useState<ToolView>("tasks");
  const [builderStep, setBuilderStep] = useState(0);
  const [builderTask, setBuilderTask] = useState<RestockTask | null>(null);
  const [tasks, setTasks] = useState<RestockTask[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [tasksResponse, eventsResponse, statusResponse] = await Promise.all([
      fetch("/api/tasks", { cache: "no-store" }),
      fetch("/api/activity", { cache: "no-store" }),
      fetch("/api/system/status", { cache: "no-store" }),
    ]);
    const [tasksPayload, eventsPayload, statusPayload] = await Promise.all([
      tasksResponse.json() as Promise<{ tasks?: RestockTask[]; error?: string }>,
      eventsResponse.json() as Promise<{ events?: ActivityEvent[]; error?: string }>,
      statusResponse.json() as Promise<{ status?: SystemStatus; error?: string }>,
    ]);
    if (!tasksResponse.ok) throw new Error(tasksPayload.error || "Could not load tasks");
    setTasks(tasksPayload.tasks ?? []);
    setEvents(eventsPayload.events ?? []);
    setStatus(statusPayload.status ?? null);
  }, []);

  useEffect(() => {
    reload()
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Nextinstock"))
      .finally(() => setLoading(false));
  }, [reload]);

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }

  async function checkTask(taskId: string) {
    setBusyTaskId(taskId);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/check`, { method: "POST" });
      const payload = (await response.json()) as { result?: WorkerResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Task check failed");
      showToast(payload.result.message);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task check failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  function openView(nextView: ToolView) {
    setView(nextView);
    setBuilderStep(0);
    setBuilderTask(null);
    setError("");
  }

  async function taskCreated(task: RestockTask) {
    const queuedAnotherCopy = Boolean(builderTask);
    setBuilderStep(0);
    setBuilderTask(null);
    setView("tasks");
    showToast(
      queuedAnotherCopy
        ? "Next physical copy queued"
        : task.listing.quantityAvailable === 0
        ? "Task activated · listing remains safely at zero"
        : "Restock task activated",
    );
    await reload();
  }

  return (
    <div className="tool-shell">
      <aside className="tool-sidebar">
        <Link href="/" className="tool-brand-link"><BrandMark /></Link>
        <nav aria-label="Tool navigation">
          <button className={view === "tasks" ? "active" : ""} type="button" onClick={() => openView("tasks")}>
            <LayoutList size={17} /> Restock tasks
          </button>
          <button className={view === "activity" ? "active" : ""} type="button" onClick={() => openView("activity")}>
            <Activity size={17} /> Activity
          </button>
          <button className={view === "settings" ? "active" : ""} type="button" onClick={() => openView("settings")}>
            <Settings size={17} /> Settings
          </button>
        </nav>
        <div className="tool-account-card">
          <EbayBadge />
          <span>
            <strong>nextinstock</strong>
            <small>
              {status?.ebayConfigured ? <><Check size={11} /> SellerMaid API ready</> : "Not configured"}
            </small>
          </span>
        </div>
      </aside>

      <div className="tool-main">
        <header className="tool-topbar">
          <div className="tool-mobile-brand"><BrandMark /></div>
          <div className="tool-global-search"><Search size={16} /><span>Search listings or item numbers</span><kbd>⌘ K</kbd></div>
          <div className="tool-top-actions">
            <span className={`tool-sync-status ${status?.writeMode === "dry-run" ? "is-dry-run" : ""}`}>
              <span /> {status?.writeMode === "live" ? "Live writes enabled" : "Dry-run mode"}
            </span>
            <button className="tool-avatar" type="button">NI</button>
          </div>
        </header>

        <main className="tool-workspace">
          {error && <div className="tool-error-banner"><AlertTriangle size={17} /> {error}</div>}
          {builderStep > 0 ? (
            <TaskBuilder
              step={builderStep}
              status={status}
              existingTask={builderTask}
              onStep={setBuilderStep}
              onClose={() => { setBuilderStep(0); setBuilderTask(null); }}
              onCreated={taskCreated}
            />
          ) : view === "tasks" ? (
            <TasksView
              tasks={tasks}
              events={events}
              loading={loading}
              busyTaskId={busyTaskId}
              onNew={() => { setBuilderTask(null); setBuilderStep(1); }}
              onQueue={(task) => { setBuilderTask(task); setBuilderStep(2); }}
              onCheck={checkTask}
            />
          ) : view === "activity" ? (
            <ActivityView events={events} />
          ) : (
            <SettingsView status={status} />
          )}
        </main>
      </div>

      {toast && <div className="tool-toast"><CircleCheck size={17} /><span>{toast}</span></div>}
    </div>
  );
}

function TasksView({
  tasks,
  events,
  loading,
  busyTaskId,
  onNew,
  onQueue,
  onCheck,
}: {
  tasks: RestockTask[];
  events: ActivityEvent[];
  loading: boolean;
  busyTaskId: string | null;
  onNew: () => void;
  onQueue: (task: RestockTask) => void;
  onCheck: (taskId: string) => void;
}) {
  const readyCopies = tasks.filter((task) => task.queuedCopy?.photos.length).length;
  const attention = tasks.filter((task) => ["attention", "error", "dry_run_ready"].includes(task.status)).length;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const restocked = events.filter(
    (event) => event.type === "restock_completed" && new Date(event.createdAt) >= monthStart,
  ).length;

  return (
    <>
      <div className="tool-page-heading">
        <div>
          <span>Inventory automation</span>
          <h1>Restock tasks</h1>
          <p>Keep replenishable eBay listings matched to the physical copy being sold.</p>
        </div>
        <button className="tool-primary-button" type="button" onClick={onNew}>
          <Plus size={16} /> New restock task
        </button>
      </div>

      <div className="tool-stat-row">
        <article><span>Active tasks</span><strong>{tasks.length}</strong><small><Store size={13} /> real eBay listings</small></article>
        <article><span>Next copies ready</span><strong>{readyCopies}</strong><small><ImageIcon size={13} /> stored locally</small></article>
        <article><span>Restocked this month</span><strong>{restocked}</strong><small><PackageCheck size={13} /> confirmed handoffs</small></article>
        <article><span>Needs attention</span><strong>{attention}</strong><small><ShieldCheck size={13} /> safe-zero protected</small></article>
      </div>

      <section className="tool-task-table-section">
        <div className="tool-table-toolbar">
          <div className="tool-table-tabs">
            <button className="active" type="button">All tasks <span>{tasks.length}</span></button>
            <button type="button">Attention <span>{attention}</span></button>
          </div>
          <div className="tool-table-search"><Search size={15} /> Search</div>
        </div>
        <div className="tool-task-table">
          <div className="tool-task-head"><span>Listing</span><span>Live state</span><span>Next copy</span><span>Status</span><span /></div>
          {loading ? (
            <div className="tool-empty-state"><LoaderCircle className="spin" size={22} /> Loading local tasks</div>
          ) : tasks.length === 0 ? (
            <div className="tool-empty-state">
              <ShieldCheck size={26} />
              <strong>No restock task yet</strong>
              <span>Start with the Pokémon XD listing and queue its next physical copy.</span>
              <button className="tool-primary-button" type="button" onClick={onNew}>Create the first task</button>
            </div>
          ) : (
            tasks.map((task) => {
              const queuedPhoto = task.queuedCopy?.photos[0];
              const busy = busyTaskId === task.id;
              return (
                <div className="tool-task-row tool-task-featured" key={task.id}>
                  <div className="tool-listing-cell">
                    <ListingImage src={task.listing.imageUrls[0]} alt={`${task.listing.title} live listing`} />
                    <span>
                      <strong>{task.listing.title}</strong>
                      <small>eBay · {task.itemId} · {money(task.listing.price, task.listing.currency)}</small>
                    </span>
                  </div>
                  <div className="tool-copy-cell">
                    <ListingImage src={task.listing.imageUrls[0]} alt="Current eBay copy" />
                    <span>
                      <strong>{task.listing.quantityAvailable} available</strong>
                      <small>{task.listing.quantitySold} sold · {task.listing.conditionName}</small>
                    </span>
                  </div>
                  <div className="tool-copy-cell">
                    <ListingImage src={queuedPhoto?.url} alt="Queued physical copy" />
                    <span>
                      <strong>{task.queuedCopy?.internalReference ?? "Queue empty"}</strong>
                      <small>
                        {task.queuedCopy
                          ? `${task.queuedCopy.photos.length} photos · ${task.queuedCopy.conditionName}`
                          : "Add another copy"}
                      </small>
                    </span>
                  </div>
                  <span className={`tool-task-status status-${task.status}`}>
                    <span /> {statusLabel(task)}
                  </span>
                  {task.queuedCopy ? (
                    <button className="tool-test-button" type="button" onClick={() => onCheck(task.id)} disabled={busy}>
                      <RefreshCw className={busy ? "spin" : ""} size={13} />
                      {busy ? "Checking" : "Check eBay"}
                    </button>
                  ) : (
                    <button className="tool-test-button" type="button" onClick={() => onQueue(task)}>
                      <Plus size={13} /> Queue next copy
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </>
  );
}

function TaskBuilder({
  step,
  status,
  existingTask,
  onStep,
  onClose,
  onCreated,
}: {
  step: number;
  status: SystemStatus | null;
  existingTask: RestockTask | null;
  onStep: (step: number) => void;
  onClose: () => void;
  onCreated: (task: RestockTask) => Promise<void>;
}) {
  const [itemId, setItemId] = useState(
    existingTask?.itemId ?? status?.defaultItemId ?? "266994813467",
  );
  const [listing, setListing] = useState<ListingSnapshot | null>(existingTask?.listing ?? null);
  const [internalReference, setInternalReference] = useState("");
  const [conditionDescription, setConditionDescription] = useState(
    existingTask?.listing.conditionDescription ?? "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const [loadingListing, setLoadingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [builderError, setBuilderError] = useState("");

  const syncListing = useCallback(async () => {
    setLoadingListing(true);
    setBuilderError("");
    try {
      const response = await fetch(`/api/ebay/listings?itemId=${encodeURIComponent(itemId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as { listing?: ListingSnapshot; error?: string };
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Listing sync failed");
      setListing(payload.listing);
      setConditionDescription(
        payload.listing.conditionDescription ||
          "Clean case and disc. Exact cosmetic wear and included inserts are shown in the photos.",
      );
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Listing sync failed");
    } finally {
      setLoadingListing(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (!existingTask) void syncListing();
  }, []); // The selected listing is intentionally synced once when setup opens.

  function next() {
    setBuilderError("");
    if (step === 1 && (!listing || !listing.supported)) {
      setBuilderError(listing?.unsupportedReasons.join(". ") || "Sync a supported listing first");
      return;
    }
    if (step === 2) {
      if (files.length === 0) return setBuilderError("Add at least one real photo of the next copy");
      if (!internalReference.trim()) return setBuilderError("Add an internal copy reference");
      if (!conditionDescription.trim()) return setBuilderError("Add the exact condition note");
    }
    onStep(Math.min(4, step + 1));
  }

  async function activate() {
    if (!listing) return;
    setSubmitting(true);
    setBuilderError("");
    try {
      const form = new FormData();
      form.set("itemId", listing.itemId);
      form.set("internalReference", internalReference);
      form.set("conditionDescription", conditionDescription);
      files.forEach((file) => form.append("photos", file));
      const endpoint = existingTask ? `/api/tasks/${existingTask.id}/copies` : "/api/tasks";
      const response = await fetch(endpoint, { method: "POST", body: form });
      const payload = (await response.json()) as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Task activation failed");
      await onCreated(payload.task);
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Task activation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="builder-shell">
      <div className="builder-heading">
        <div>
          <button type="button" onClick={onClose}><ArrowLeft size={16} /> Restock tasks</button>
          <h1>{existingTask ? "Queue next copy" : "New restock task"}</h1>
          <p>{existingTask ? "Prepare the next physical copy before another sale." : "One real fixed-price listing, one real next copy, one safe handoff."}</p>
        </div>
        <button className="builder-close" type="button" onClick={onClose} aria-label="Close task setup"><X size={18} /></button>
      </div>
      <div className="builder-stepper" aria-label="Task setup progress">
        {builderSteps.map((label, index) => {
          const number = index + 1;
          return (
            <div className={number === step ? "active" : number < step ? "complete" : ""} key={label}>
              <span>{number < step ? <Check size={13} /> : number}</span><strong>{label}</strong>
            </div>
          );
        })}
      </div>

      <div className="builder-card">
        {builderError && <div className="builder-error"><AlertTriangle size={15} /> {builderError}</div>}
        {step === 1 && (
          <BuilderListing
            itemId={itemId}
            listing={listing}
            loading={loadingListing}
            onItemId={setItemId}
            onSync={syncListing}
          />
        )}
        {step === 2 && (
          <BuilderCopy
            listing={listing}
            files={files}
            internalReference={internalReference}
            conditionDescription={conditionDescription}
            onFiles={setFiles}
            onInternalReference={setInternalReference}
            onConditionDescription={setConditionDescription}
          />
        )}
        {step === 3 && <BuilderAutomation listing={listing} status={status} />}
        {step === 4 && (
          <BuilderReview
            listing={listing}
            files={files}
            internalReference={internalReference}
            status={status}
          />
        )}
        <div className="builder-actions">
          <button className="builder-secondary" type="button" onClick={step === 1 ? onClose : () => onStep(step - 1)}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 4 ? (
            <button className="tool-primary-button" type="button" onClick={next} disabled={loadingListing}>
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button className="tool-primary-button" type="button" onClick={activate} disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
              {submitting
                ? "Saving photos"
                : existingTask
                  ? "Queue next copy"
                  : "Activate restock task"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BuilderListing({
  itemId,
  listing,
  loading,
  onItemId,
  onSync,
}: {
  itemId: string;
  listing: ListingSnapshot | null;
  loading: boolean;
  onItemId: (value: string) => void;
  onSync: () => void;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 1 · Listing</span>
      <h2>Select the listing to replenish</h2>
      <p>The MVP supports a single-variation, fixed-price, Good &apos;Til Cancelled listing.</p>
      <div className="builder-search builder-live-search">
        <Search size={16} />
        <input value={itemId} onChange={(event) => onItemId(event.target.value.replace(/\D/g, ""))} aria-label="eBay item number" />
        <button type="button" onClick={onSync} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />} Sync eBay
        </button>
      </div>
      {listing && (
        <div className={`builder-listing-selected ${listing.supported ? "" : "is-unsupported"}`}>
          <span className="builder-radio"><span /></span>
          <ListingImage src={listing.imageUrls[0]} alt={listing.title} />
          <div>
            <strong>{listing.title}</strong>
            <span>
              Item {listing.itemId} · {listing.conditionName} · {listing.quantityAvailable} available · {listing.quantitySold} sold
            </span>
          </div>
          <strong>{money(listing.price, listing.currency)}</strong>
          <span className="builder-live-pill">{listing.quantityAvailable ? "Live" : "At zero"}</span>
        </div>
      )}
      {listing?.quantityAvailable === 0 && (
        <div className="builder-zero-note">
          <ShieldCheck size={16} />
          This listing is already at zero. The queued copy will be eligible immediately, but dry-run mode still prevents a live revision.
        </div>
      )}
      {listing && !listing.supported && (
        <div className="builder-support-list">
          {listing.unsupportedReasons.map((reason) => <span key={reason}><X size={13} /> {reason}</span>)}
        </div>
      )}
    </div>
  );
}

function BuilderCopy({
  listing,
  files,
  internalReference,
  conditionDescription,
  onFiles,
  onInternalReference,
  onConditionDescription,
}: {
  listing: ListingSnapshot | null;
  files: File[];
  internalReference: string;
  conditionDescription: string;
  onFiles: (files: File[]) => void;
  onInternalReference: (value: string) => void;
  onConditionDescription: (value: string) => void;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 2 · Next copy</span>
      <h2>Add the copy that sells next</h2>
      <p>These local photos become the complete eBay photo set only when the handoff runs.</p>
      <div className="builder-copy-grid">
        <div className="builder-upload-area">
          <div className={`builder-photo-grid ${files.length ? "" : "is-empty"}`}>
            {files.length ? files.slice(0, 12).map((file) => <LocalFilePreview file={file} key={`${file.name}-${file.lastModified}`} />) : (
              <span className="builder-upload-placeholder"><Upload size={24} /> Select the actual next copy photos</span>
            )}
          </div>
          <label className="builder-file-button">
            <Plus size={15} /> {files.length ? "Replace photos" : "Choose photos"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <small>{files.length ? `${files.length} photos selected · saved to local disk on activation` : "JPEG, PNG, WebP, or HEIC · up to 24"}</small>
        </div>
        <div className="builder-fields">
          <label>
            <span>Internal reference</span>
            <input value={internalReference} onChange={(event) => onInternalReference(event.target.value)} />
          </label>
          <label>
            <span>Condition</span>
            <button type="button" className="builder-select" disabled>{listing?.conditionName ?? "Good"} <Check size={14} /></button>
          </label>
          <label>
            <span>Condition note</span>
            <textarea value={conditionDescription} onChange={(event) => onConditionDescription(event.target.value)} />
          </label>
          <div className={`builder-verified ${files.length && conditionDescription.trim() ? "" : "is-pending"}`}>
            {files.length && conditionDescription.trim() ? <Check size={14} /> : <Clock3 size={14} />}
            {files.length && conditionDescription.trim() ? "Required copy details are complete" : "Photos and condition note are required"}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuilderAutomation({
  listing,
  status,
}: {
  listing: ListingSnapshot | null;
  status: SystemStatus | null;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 3 · Automation</span>
      <h2>Set the sale-to-restock handoff</h2>
      <p>The local worker checks the listing without making it available prematurely.</p>
      <div className="builder-rule-chain">
        <div>
          <span className="builder-rule-label">WHEN</span><span className="builder-rule-icon"><PackageCheck size={20} /></span>
          <p><strong>{listing?.quantityAvailable === 0 ? "The task activates at the current zero" : "A sale reaches quantity zero"}</strong><small>Confirmed with a fresh GetItem response</small></p>
        </div>
        <ArrowRight size={18} />
        <div>
          <span className="builder-rule-label">THEN</span><span className="builder-rule-icon"><ImageIcon size={20} /></span>
          <p><strong>Upload and apply the queued copy</strong><small>Replace the complete photo set and condition note</small></p>
        </div>
        <ArrowRight size={18} />
        <div>
          <span className="builder-rule-label">FINALLY</span><span className="builder-rule-icon"><Store size={20} /></span>
          <p><strong>Set available quantity to one</strong><small>In the same reviewed eBay revision</small></p>
        </div>
      </div>
      <label className="builder-safety-option">
        <span className="builder-checkbox"><Check size={13} /></span>
        <span><strong>Hold the listing at zero if anything is incomplete</strong><small>Missing files, invalid condition data, and API failures block the quantity change.</small></span>
      </label>
      <div className="builder-mode-note">
        <ShieldCheck size={17} />
        <span><strong>{status?.writeMode === "live" ? "Live write mode" : "Dry-run mode"}</strong><small>{status?.liveWritesBlocker ?? "The eBay write grant is confirmed."}</small></span>
      </div>
    </div>
  );
}

function BuilderReview({
  listing,
  files,
  internalReference,
  status,
}: {
  listing: ListingSnapshot | null;
  files: File[];
  internalReference: string;
  status: SystemStatus | null;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 4 · Review</span>
      <h2>Ready to protect this listing</h2>
      <p>Activation stores the task and photos locally. It does not bypass the write-mode gate.</p>
      <div className="builder-review-card">
        <div className="builder-review-listing">
          <ListingImage src={listing?.imageUrls[0]} alt={listing?.title ?? "eBay listing"} />
          <span><small>eBay item {listing?.itemId}</small><strong>{listing?.title}</strong><em>{money(listing?.price ?? null)} · {listing?.quantityAvailable} available</em></span>
        </div>
        <div className="builder-review-arrow"><ArrowRight size={20} /></div>
        <div className="builder-review-listing">
          {files[0] ? <LocalFilePreview file={files[0]} /> : <span className="tool-photo-placeholder">?</span>}
          <span><small>Next copy in queue</small><strong>{internalReference}</strong><em>{files.length} photos · {listing?.conditionName}</em></span>
        </div>
      </div>
      <div className="builder-review-checks">
        <span><Check size={14} /> Live listing verified</span>
        <span><Check size={14} /> Local photos validated on save</span>
        <span><Check size={14} /> Safe-zero rule enabled</span>
        <span>{status?.liveWritesAuthorized ? <Check size={14} /> : <ShieldCheck size={14} />} {status?.liveWritesAuthorized ? "Live eBay writes authorized" : "Live eBay writes blocked"}</span>
      </div>
    </div>
  );
}

function ActivityView({ events }: { events: ActivityEvent[] }) {
  return (
    <>
      <div className="tool-page-heading">
        <div><span>Audit trail</span><h1>Activity</h1><p>Real task changes, worker checks, and eBay handoffs.</p></div>
      </div>
      <div className="activity-card">
        {events.length === 0 ? (
          <div className="tool-empty-state"><Clock3 size={24} /><strong>No activity yet</strong><span>The first task activation will appear here.</span></div>
        ) : events.map((event) => (
          <article key={event.id}>
            <span className={`activity-icon level-${event.level}`}>{event.level === "error" ? <AlertTriangle size={16} /> : <Clock3 size={16} />}</span>
            <div><strong>{event.message}</strong><p>{event.type.replaceAll("_", " ")}</p></div>
            <time>{timeLabel(event.createdAt)}</time>
          </article>
        ))}
      </div>
    </>
  );
}

function SettingsView({ status }: { status: SystemStatus | null }) {
  return (
    <>
      <div className="tool-page-heading">
        <div><span>Workspace</span><h1>Settings</h1><p>Credential source, storage, worker timing, and the live-write gate.</p></div>
      </div>
      <div className="settings-card">
        <div>
          <EbayBadge />
          <span>
            <strong>{status?.ebayConfigured ? "SellerMaid eBay API" : "eBay not configured"}</strong>
            <small>Credential source · {status?.ebayCredentialSource ?? "loading"}</small>
          </span>
          <a className="settings-action" href="/api/ebay/auth/start">Reconnect for writes <ExternalLink size={13} /></a>
        </div>
        <div>
          <HardDrive size={21} />
          <span><strong>Local image storage</strong><small className="settings-path">{status?.storagePath ?? "Loading storage path"}</small></span>
          <span className="settings-on">{status?.persistentStorage ? "Persistent" : "Ephemeral"}</span>
        </div>
        <div>
          <Database size={21} />
          <span><strong>Local SQLite task ledger</strong><small>Worker poll interval · every {status?.pollSeconds ?? 30} seconds</small></span>
          <span className="settings-on">On</span>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span><strong>Safe-zero protection</strong><small>{status?.liveWritesBlocker ?? "Live write grant confirmed."}</small></span>
          <span className={`settings-on ${status?.liveWritesAuthorized ? "" : "is-warning"}`}>{status?.liveWritesAuthorized ? "Live" : "Dry-run"}</span>
        </div>
      </div>
    </>
  );
}
