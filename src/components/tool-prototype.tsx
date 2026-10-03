"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  ArrowUp,
  Check,
  CircleCheck,
  Clock3,
  Database,
  ExternalLink,
  HardDrive,
  ImageIcon,
  LayoutList,
  LoaderCircle,
  BookOpen,
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
  EbayProfile,
  ListingSnapshot,
  QueuedCopy,
  RestockTask,
  SystemStatus,
  WorkerResult,
} from "@/lib/types";
import { BrandMark } from "./brand-mark";
import { ToolSupport } from "./tool-support";

type ToolView = "tasks" | "activity" | "settings" | "support";

const builderSteps = ["Listing", "Next copy", "Automation", "Review"];

function EbayBadge() {
  return (
    <span className="tool-ebay-badge" aria-label="eBay connected account">
      <span>e</span><span>b</span><span>a</span><span>y</span>
    </span>
  );
}

function EbayAvatar({ profile }: { profile: EbayProfile | null }) {
  const [imageUrl, setImageUrl] = useState(profile?.avatarUrl ?? null);
  useEffect(() => setImageUrl(profile?.avatarUrl ?? null), [profile?.avatarUrl]);
  return imageUrl
    ? <img className="tool-account-avatar" src={imageUrl} alt="" onError={() => setImageUrl(null)} />
    : <span className="tool-account-avatar tool-account-initials">{profile?.userId?.slice(0, 2).toUpperCase() ?? "NI"}</span>;
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
  if (task.status === "scheduled") return "Restock queued";
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
  const [profile, setProfile] = useState<EbayProfile | null>(null);
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

  useEffect(() => {
    if (!status?.ebayConfigured) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    fetch("/api/ebay/profile", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load eBay profile");
        return response.json() as Promise<{ profile: EbayProfile }>;
      })
      .then((payload) => { if (!cancelled) setProfile(payload.profile); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; };
  }, [status?.ebayConfigured, status?.ebayCredentialSource]);

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

  async function updateQueue(taskId: string, copyId: string, body: { action: "price"; targetPrice: string } | { action: "move"; direction: "up" | "down" }) {
    setBusyTaskId(taskId);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/copies/${copyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not update the queue");
      showToast(body.action === "price" ? "Restock price saved" : "Queue order updated");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the queue");
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
          <button className={view === "support" ? "active" : ""} type="button" onClick={() => openView("support")}>
            <BookOpen size={17} /> Support & docs
          </button>
        </nav>
        <div className="tool-account-card">
          <EbayAvatar profile={profile} />
          <span>
            <strong>{profile?.userId ?? (status?.ebayConfigured ? "eBay account" : "Not connected")}</strong>
            <small>
              {status?.ebayConfigured ? <><Check size={11} /> eBay connected</> : "Connect in Settings"}
            </small>
          </span>
        </div>
      </aside>

      <div className="tool-main">
        <header className="tool-topbar">
          <div className="tool-mobile-brand"><BrandMark /></div>
          <div className="tool-top-actions">
            <span className={`tool-sync-status ${!status?.liveWritesAuthorized ? "is-dry-run" : ""}`}>
              <span /> {status?.liveWritesAuthorized ? "Live writes authorized" : status?.writeMode === "live" ? "Live writes blocked" : "Dry-run mode"}
            </span>
            <button className="tool-avatar" type="button" aria-label={`Open settings${profile ? ` for ${profile.userId}` : ""}`} onClick={() => openView("settings")}><EbayAvatar profile={profile} /></button>
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
              onQueueAction={updateQueue}
            />
          ) : view === "activity" ? (
            <ActivityView events={events} />
          ) : view === "support" ? (
            <ToolSupport status={status} onNewTask={() => { setBuilderTask(null); setBuilderStep(1); }} onSettings={() => openView("settings")} />
          ) : (
            <SettingsView status={status} onSaved={reload} />
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
  onQueueAction,
}: {
  tasks: RestockTask[];
  events: ActivityEvent[];
  loading: boolean;
  busyTaskId: string | null;
  onNew: () => void;
  onQueue: (task: RestockTask) => void;
  onCheck: (taskId: string) => void;
  onQueueAction: (taskId: string, copyId: string, body: { action: "price"; targetPrice: string } | { action: "move"; direction: "up" | "down" }) => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [search, setSearch] = useState("");
  const readyCopies = tasks.reduce((count, task) => count + task.queuedCopies.length, 0);
  const attention = tasks.filter((task) => ["attention", "error", "dry_run_ready"].includes(task.status)).length;
  const visibleTasks = tasks.filter((task) => {
    if (filter === "attention" && !["attention", "error", "dry_run_ready"].includes(task.status)) return false;
    const query = search.trim().toLowerCase();
    return !query || [task.itemId, task.listing.title, task.listing.variations.find((variation) => variation.key === task.variationKey)?.label, ...task.queuedCopies.map((copy) => copy.internalReference)]
      .some((value) => value?.toLowerCase().includes(query));
  });
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
        <article><span>Tracked tasks</span><strong>{tasks.length}</strong><small><Store size={13} /> eBay targets</small></article>
        <article><span>Next copies ready</span><strong>{readyCopies}</strong><small><ImageIcon size={13} /> queued locally</small></article>
        <article><span>Restocked this month</span><strong>{restocked}</strong><small><PackageCheck size={13} /> confirmed handoffs</small></article>
        <article><span>Needs attention</span><strong>{attention}</strong><small><ShieldCheck size={13} /> safe-zero protected</small></article>
      </div>

      <section className="tool-task-table-section">
        <div className="tool-table-toolbar">
          <div className="tool-table-tabs">
            <button className={filter === "all" ? "active" : ""} type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All tasks <span>{tasks.length}</span></button>
            <button className={filter === "attention" ? "active" : ""} type="button" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Attention <span>{attention}</span></button>
          </div>
          <label className="tool-table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" aria-label="Search tasks" /></label>
        </div>
        <div className="tool-task-table">
          <div className="tool-task-head"><span>Listing</span><span>Live state</span><span>Next copy</span><span>Status</span><span /></div>
          {loading ? (
            <div className="tool-empty-state"><LoaderCircle className="spin" size={22} /> Loading local tasks</div>
          ) : tasks.length === 0 ? (
            <div className="tool-empty-state">
              <ShieldCheck size={26} />
              <strong>No restock task yet</strong>
              <span>Choose an active listing and queue photos of its next physical copy.</span>
              <button className="tool-primary-button" type="button" onClick={onNew}>Create the first task</button>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="tool-empty-state"><Search size={24} /><strong>No matching tasks</strong><span>Change the search or task filter.</span></div>
          ) : (
            visibleTasks.map((task) => {
              const queuedPhoto = task.queuedCopy?.photos[0];
              const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
              const busy = busyTaskId === task.id;
              return (
                <div className="tool-task-entry" key={task.id}>
                  <div className="tool-task-row tool-task-featured">
                    <div className="tool-listing-cell">
                      <ListingImage src={variation?.imageUrls[0] ?? task.listing.imageUrls[0]} alt={`${task.listing.title} live listing`} />
                      <span>
                        <strong>{task.listing.title}</strong>
                        <small>eBay · {task.itemId}{variation ? ` · ${variation.label}` : ""} · {money(variation?.price ?? task.listing.price, task.listing.currency)}</small>
                      </span>
                    </div>
                    <div className="tool-copy-cell">
                      <ListingImage src={variation?.imageUrls[0] ?? task.listing.imageUrls[0]} alt="Current eBay copy" />
                      <span>
                        <strong>{variation?.quantityAvailable ?? task.listing.quantityAvailable} available</strong>
                        <small>{variation?.quantitySold ?? task.listing.quantitySold} sold · {task.listing.conditionName}</small>
                      </span>
                    </div>
                    <div className="tool-copy-cell">
                      <ListingImage src={queuedPhoto?.url} alt="Queued physical copy" />
                      <span>
                        <strong>{task.queuedCopy?.internalReference ?? "Queue empty"}</strong>
                        <small>{task.queuedCopy
                          ? `${task.queuedCopies.length} queued · ${task.queuedCopy.targetPrice === null ? "keep live price" : money(task.queuedCopy.targetPrice, variation?.currency ?? task.listing.currency)}`
                          : "Add a copy"}</small>
                      </span>
                    </div>
                    <span className={`tool-task-status status-${task.status}`}>
                      <span /> {statusLabel(task)}
                    </span>
                    <div className="tool-task-actions">
                      <button className="tool-test-button" type="button" onClick={() => onQueue(task)} disabled={busy}>
                        <Plus size={13} /> Add copy
                      </button>
                      {task.queuedCopy && (
                        <button className="tool-test-button" type="button" onClick={() => onCheck(task.id)} disabled={busy}>
                          <RefreshCw className={busy ? "spin" : ""} size={13} /> Check eBay
                        </button>
                      )}
                    </div>
                  </div>
                  {task.queuedCopies.length > 0 && (
                    <details className="tool-queue-details">
                      <summary>View copy order and restock prices <span>{task.queuedCopies.length}</span></summary>
                      <ol>
                        {task.queuedCopies.map((copy, index) => (
                          <QueueCopyRow
                            key={copy.id}
                            copy={copy}
                            index={index}
                            count={task.queuedCopies.length}
                            currency={variation?.currency ?? task.listing.currency}
                            busy={busy}
                            canMove={task.status !== "scheduled" && task.status !== "processing"}
                            onAction={(body) => onQueueAction(task.id, copy.id, body)}
                          />
                        ))}
                      </ol>
                    </details>
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

function QueueCopyRow({
  copy, index, count, currency, busy, canMove, onAction,
}: {
  copy: QueuedCopy;
  index: number;
  count: number;
  currency: string;
  busy: boolean;
  canMove: boolean;
  onAction: (body: { action: "price"; targetPrice: string } | { action: "move"; direction: "up" | "down" }) => Promise<void>;
}) {
  const [price, setPrice] = useState(copy.targetPrice?.toFixed(2) ?? "");
  useEffect(() => setPrice(copy.targetPrice?.toFixed(2) ?? ""), [copy.targetPrice]);
  return (
    <li className="tool-queue-copy">
      <span className="tool-queue-number">{index + 1}</span>
      <ListingImage src={copy.photos[0]?.url} alt={`${copy.internalReference} photos`} />
      <div className="tool-queue-copy-info">
        <strong>{copy.internalReference}</strong>
        <small>{copy.photos.length} photos · {copy.conditionName ?? "Condition on listing"}</small>
      </div>
      <div className="tool-queue-price">
        <label htmlFor={`price-${copy.id}`}>Restock price · {currency}</label>
        <div>
          <input id={`price-${copy.id}`} type="number" inputMode="decimal" min="0.01" max="999999.99" step="0.01" placeholder="Keep live price" value={price} onChange={(event) => setPrice(event.target.value)} />
          <button type="button" disabled={busy || price === (copy.targetPrice?.toFixed(2) ?? "")} onClick={() => onAction({ action: "price", targetPrice: price })}>Save</button>
        </div>
      </div>
      <div className="tool-queue-move">
        <button type="button" aria-label={`Move ${copy.internalReference} earlier`} disabled={busy || !canMove || index === 0} onClick={() => onAction({ action: "move", direction: "up" })}><ArrowUp size={16} /></button>
        <button type="button" aria-label={`Move ${copy.internalReference} later`} disabled={busy || !canMove || index === count - 1} onClick={() => onAction({ action: "move", direction: "down" })}><ArrowDown size={16} /></button>
      </div>
    </li>
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
    existingTask?.itemId ?? status?.defaultItemId ?? "",
  );
  const [listing, setListing] = useState<ListingSnapshot | null>(existingTask?.listing ?? null);
  const [variationKey, setVariationKey] = useState<string | null>(existingTask?.variationKey ?? null);
  const [internalReference, setInternalReference] = useState("");
  const [conditionDescription, setConditionDescription] = useState(
    existingTask?.listing.conditionDescription ?? "",
  );
  const [targetPrice, setTargetPrice] = useState(() => String(existingTask?.queuedCopies.at(-1)?.targetPrice ?? ""));
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
      setVariationKey(null);
      setConditionDescription(
        payload.listing.conditionDescription || "",
      );
      setTargetPrice("");
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Listing sync failed");
    } finally {
      setLoadingListing(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (!existingTask && itemId) void syncListing();
  }, []); // The selected listing is intentionally synced once when setup opens.

  function next() {
    setBuilderError("");
    if (step === 1 && (!listing || !listing.supported)) {
      setBuilderError(listing?.unsupportedReasons.join(". ") || "Sync a supported listing first");
      return;
    }
    if (step === 1 && listing?.variations.length && !variationKey) {
      setBuilderError("Choose the variation this task will restock");
      return;
    }
    if (step === 2) {
      if (!internalReference.trim()) return setBuilderError("Add an internal copy reference");
      if (!variationKey && files.length === 0) return setBuilderError("Add at least one real photo of the next copy");
      if (!variationKey && !conditionDescription.trim()) return setBuilderError("Add the exact condition note");
      if (targetPrice.trim() && (!/^\d{1,6}(?:\.\d{1,2})?$/.test(targetPrice.trim()) || Number(targetPrice) < 0.01)) {
        return setBuilderError("Enter a valid restock price with at most two decimal places");
      }
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
      if (variationKey) form.set("variationKey", variationKey);
      form.set("internalReference", internalReference);
      form.set("conditionDescription", conditionDescription);
      form.set("targetPrice", targetPrice.trim());
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
          <h1>{existingTask ? "Add another copy" : "New restock task"}</h1>
          <p>{existingTask ? "Add copies in the order they should sell, with a price for each handoff." : "Start an ordered copy queue for one fixed-price listing."}</p>
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
            onItemId={(value) => { setItemId(value); setListing(null); setVariationKey(null); }}
            onSync={syncListing}
            variationKey={variationKey}
            onVariationKey={(key) => {
              setVariationKey(key);
              setTargetPrice("");
            }}
          />
        )}
        {step === 2 && (
          <BuilderCopy
            listing={listing}
            variationKey={variationKey}
            files={files}
            internalReference={internalReference}
            conditionDescription={conditionDescription}
            targetPrice={targetPrice}
            onFiles={setFiles}
            onInternalReference={setInternalReference}
            onConditionDescription={setConditionDescription}
            onTargetPrice={setTargetPrice}
          />
        )}
        {step === 3 && <BuilderAutomation listing={listing} variationKey={variationKey} targetPrice={targetPrice} status={status} />}
        {step === 4 && (
          <BuilderReview
            listing={listing}
            variationKey={variationKey}
            files={files}
            internalReference={internalReference}
            targetPrice={targetPrice}
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
  variationKey,
  onVariationKey,
}: {
  itemId: string;
  listing: ListingSnapshot | null;
  loading: boolean;
  onItemId: (value: string) => void;
  onSync: () => void;
  variationKey: string | null;
  onVariationKey: (key: string) => void;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 1 · Listing</span>
      <h2>Select the listing to replenish</h2>
      <p>Choose an active fixed-price listing, then choose the exact variation to restock.</p>
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
          <span className="builder-live-pill">{listing.listingStatus === "Active" ? listing.quantityAvailable ? "Live" : "At zero" : listing.listingStatus}</span>
        </div>
      )}
      {listing && listing.variations.length > 0 && (
        <VariationPicker listing={listing} selectedKey={variationKey} onSelect={onVariationKey} />
      )}
      {listing?.supported && listing.quantityAvailable === 0 && (
        <div className="builder-zero-note">
          <ShieldCheck size={16} />
          This active listing is at zero. In live mode, the worker schedules a short hold before restocking on a later check.
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

function VariationPicker({ listing, selectedKey, onSelect }: {
  listing: ListingSnapshot;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const storageKey = `nextinstock:visible-variations:${listing.itemId}`;
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => listing.variations.slice(0, 6).map((variation) => variation.key));
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved)) {
        const valid = saved.filter((key): key is string => typeof key === "string" && listing.variations.some((variation) => variation.key === key));
        if (valid.length) setVisibleKeys(valid);
      }
    } catch { /* Ignore invalid local display preferences. */ }
  }, [storageKey, listing.variations]);
  const matching = listing.variations.filter((variation) =>
    variation.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const rows = showAll || query.trim()
    ? matching
    : matching.filter((variation) => visibleKeys.includes(variation.key) || variation.key === selectedKey);

  function toggleVisible(key: string) {
    const next = visibleKeys.includes(key)
      ? visibleKeys.filter((current) => current !== key)
      : [...visibleKeys, key];
    setVisibleKeys(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  return (
    <section className="builder-variations" aria-label="Listing variations">
      <div className="builder-variations-heading">
        <div><strong>Variations</strong><span>{listing.variations.length} on eBay · choose one restock target</span></div>
        <button type="button" onClick={() => setShowAll((current) => !current)}>
          {showAll ? "Show visible only" : `Show all ${listing.variations.length}`}
        </button>
      </div>
      <label className="builder-variation-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a variation" aria-label="Find a variation" /></label>
      <div className="builder-variation-list">
        {rows.map((variation) => (
          <div className={`builder-variation-row ${selectedKey === variation.key ? "is-selected" : ""}`} key={variation.key}>
            <input type="radio" name="restockVariation" checked={selectedKey === variation.key} onChange={() => onSelect(variation.key)} aria-label={`Restock ${variation.label}`} />
            <ListingImage src={variation.imageUrls[0]} alt={variation.label} />
            <span><strong>{variation.label}</strong><small>{variation.quantityAvailable} available · {variation.quantitySold} sold · {money(variation.price, variation.currency)}{listing.variationPictureAxis && !variation.hasSpecificPhotos ? " · no dedicated photo" : ""}</small></span>
            <label><input type="checkbox" checked={visibleKeys.includes(variation.key)} onChange={() => toggleVisible(variation.key)} /> Visible</label>
          </div>
        ))}
        {rows.length === 0 && <p>No matching variations. Show all or change the search.</p>}
      </div>
      <small>Visible controls this list only. The radio chooses the variation this task monitors.</small>
    </section>
  );
}

function BuilderCopy({
  listing,
  variationKey,
  files,
  internalReference,
  conditionDescription,
  targetPrice,
  onFiles,
  onInternalReference,
  onConditionDescription,
  onTargetPrice,
}: {
  listing: ListingSnapshot | null;
  variationKey: string | null;
  files: File[];
  internalReference: string;
  conditionDescription: string;
  targetPrice: string;
  onFiles: (files: File[]) => void;
  onInternalReference: (value: string) => void;
  onConditionDescription: (value: string) => void;
  onTargetPrice: (value: string) => void;
}) {
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 2 · Next copy</span>
      <h2>Add the copy that sells next</h2>
      <p>{variationKey ? "Only this variation's quantity changes on eBay, plus its price if you set one. Photos and a note are optional internal records." : "These local photos become the complete eBay photo set only when the handoff runs."}</p>
      <div className="builder-copy-grid">
        <div className="builder-upload-area">
          <div className={`builder-photo-grid ${files.length ? "" : "is-empty"}`}>
            {files.length ? files.slice(0, 12).map((file) => <LocalFilePreview file={file} key={`${file.name}-${file.lastModified}`} />) : (
              <span className="builder-upload-placeholder"><Upload size={24} /> {variationKey ? "Optional internal photos" : "Select the actual next copy photos"}</span>
            )}
          </div>
          <label className="builder-file-button">
            <Plus size={15} /> {files.length ? "Replace photos" : variationKey ? "Add optional photos" : "Choose photos"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              multiple
              onChange={(event) => onFiles(Array.from(event.target.files ?? []))}
            />
          </label>
          <small>{files.length ? `${files.length} photos selected · saved to local disk on activation` : variationKey ? "Optional · JPEG, PNG, WebP, or HEIC · up to 24" : "JPEG, PNG, WebP, or HEIC · up to 24"}</small>
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
            <span>Condition note{variationKey ? " (optional, internal)" : ""}</span>
            <textarea value={conditionDescription} onChange={(event) => onConditionDescription(event.target.value)} />
          </label>
          <label>
            <span>Price when this copy restocks · {listing?.variations.find((variation) => variation.key === variationKey)?.currency ?? listing?.currency ?? "USD"}</span>
            <input type="number" inputMode="decimal" min="0.01" max="999999.99" step="0.01" placeholder="Keep the live eBay price" value={targetPrice} onChange={(event) => onTargetPrice(event.target.value)} />
            <small>Change this for each copy to step prices up. Leave blank to keep the live price.</small>
            {targetPrice && (
              <small>eBay may reset automatic Best Offer thresholds when the price changes.</small>
            )}
          </label>
          <div className={`builder-verified ${variationKey || files.length && conditionDescription.trim() ? "" : "is-pending"}`}>
            {variationKey || files.length && conditionDescription.trim() ? <Check size={14} /> : <Clock3 size={14} />}
            {variationKey ? "Internal reference is required; eBay photos stay as they are" : files.length && conditionDescription.trim() ? "Required copy details are complete" : "Photos and condition note are required"}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuilderAutomation({
  listing,
  variationKey,
  targetPrice,
  status,
}: {
  listing: ListingSnapshot | null;
  variationKey: string | null;
  targetPrice: string;
  status: SystemStatus | null;
}) {
  const selected = listing?.variations.find((variation) => variation.key === variationKey);
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 3 · Automation</span>
      <h2>Set the sale-to-restock handoff</h2>
      <p>The local worker checks the listing without making it available prematurely.</p>
      <div className="builder-rule-chain">
        <div>
          <span className="builder-rule-label">WHEN</span><span className="builder-rule-icon"><PackageCheck size={20} /></span>
          <p><strong>{(selected ?? listing)?.quantityAvailable === 0 ? "The task activates at the current zero" : "A sale reaches quantity zero"}</strong><small>Confirmed with a fresh GetItem response</small></p>
        </div>
        <ArrowRight size={18} />
        <div>
          <span className="builder-rule-label">THEN</span><span className="builder-rule-icon"><ImageIcon size={20} /></span>
          <p><strong>{selected ? "Confirm the queued variation" : "Upload and apply the queued copy"}</strong><small>{selected ? "Other variations stay unchanged" : "Replace photos, condition note, and planned price at zero"}</small></p>
        </div>
        <ArrowRight size={18} />
        <div>
          <span className="builder-rule-label">FINALLY</span><span className="builder-rule-icon"><Store size={20} /></span>
          <p><strong>Release one at {targetPrice ? money(Number(targetPrice), selected?.currency ?? listing?.currency) : "the live price"}</strong><small>{selected ? "Variation price and quantity change together, then eBay is checked" : "After price and copy checks at zero"}</small></p>
        </div>
      </div>
      <label className="builder-safety-option">
        <span className="builder-checkbox"><Check size={13} /></span>
        <span><strong>Hold the listing at zero if anything is incomplete</strong><small>{selected ? "Missing queued copy details and API failures block the quantity change." : "Missing files, invalid condition data, and API failures block the quantity change."}</small></span>
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
  variationKey,
  files,
  internalReference,
  targetPrice,
  status,
}: {
  listing: ListingSnapshot | null;
  variationKey: string | null;
  files: File[];
  internalReference: string;
  targetPrice: string;
  status: SystemStatus | null;
}) {
  const selected = listing?.variations.find((variation) => variation.key === variationKey);
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 4 · Review</span>
      <h2>Ready to protect this listing</h2>
      <p>Activation stores the task and any optional photos locally. It does not bypass the write-mode gate.</p>
      <div className="builder-review-card">
        <div className="builder-review-listing">
          <ListingImage src={selected?.imageUrls[0] ?? listing?.imageUrls[0]} alt={listing?.title ?? "eBay listing"} />
          <span><small>eBay item {listing?.itemId}</small><strong>{listing?.title}</strong><em>{selected?.label ? `${selected.label} · ` : ""}{money(selected?.price ?? listing?.price ?? null)} · {selected?.quantityAvailable ?? listing?.quantityAvailable} available</em></span>
        </div>
        <div className="builder-review-arrow"><ArrowRight size={20} /></div>
        <div className="builder-review-listing">
          {files[0] ? <LocalFilePreview file={files[0]} /> : <span className="tool-photo-placeholder">—</span>}
          <span><small>Next copy in queue</small><strong>{internalReference}</strong><em>{files.length ? `${files.length} internal photos` : "No internal photos"} · {targetPrice ? money(Number(targetPrice), selected?.currency ?? listing?.currency) : "keep live price"}</em></span>
        </div>
      </div>
      <div className="builder-review-checks">
        <span><Check size={14} /> Live listing verified</span>
        {files.length > 0 && <span><Check size={14} /> Local photos validated on save</span>}
        <span><Check size={14} /> Safe-zero rule enabled</span>
        {selected && <span><ShieldCheck size={14} /> eBay variation photos and listing condition stay as they are</span>}
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

function SettingsView({ status, onSaved }: { status: SystemStatus | null; onSaved: () => Promise<void> }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function discordAction(action: "connect" | "disconnect" | "test" | "preview") {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/integrations/discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "connect" ? { webhookUrl } : {}) }),
      });
      const payload = await response.json() as { error?: string; warning?: string };
      if (!response.ok) throw new Error(payload.error ?? "Discord setup failed.");
      if (action === "connect") setWebhookUrl("");
      setNotice(payload.warning ?? { connect: "Webhook and avatar saved.", disconnect: "Discord alerts disconnected.", test: "Connection test sent to Discord.", preview: "All nine alert previews sent with a real store listing." }[action]);
      if (action === "connect" || action === "disconnect") await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Discord setup failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="tool-page-heading">
        <div><span>Workspace</span><h1>Settings</h1><p>Credential source, storage, worker timing, and the live-write gate.</p></div>
      </div>
      <div className="settings-card">
        <div>
          <EbayBadge />
          <span>
            <strong>{status?.ebayConfigured ? "eBay API configured" : "eBay not configured"}</strong>
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
          <span><strong>Local SQLite task ledger</strong><small>Restock hold · {status?.restockDelaySeconds ?? 60}s · worker checks every {status?.pollSeconds ?? 30}s</small></span>
          <span className="settings-on">On</span>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span><strong>Safe-zero protection</strong><small>{status?.liveWritesBlocker ?? "Live write grant confirmed."}</small></span>
          <span className={`settings-on ${status?.liveWritesAuthorized ? "" : "is-warning"}`}>{status?.liveWritesAuthorized ? "Live" : "Dry-run"}</span>
        </div>
      </div>
      <details className="settings-optional">
        <summary><span><strong>Discord updates</strong><small>Optional · Recommended for live alerts</small></span><span className={`settings-on ${status?.discordConnected ? "" : "is-off"}`}>{status?.discordConnected ? "Connected" : "Off"}</span></summary>
        <div className="settings-optional-body">
          <p>Send operational alerts to a private Discord channel: new sale, awaiting restock, restocking, completion, and blocked outcomes. Each card shows the product photo, trigger, counts, action, and event time. Connect applies the blue Nextinstock n avatar; no bot or developer account is needed.</p>
          <ol>
            <li>Use an existing channel or <a href="https://discord.new/GavFccHpQgcW" target="_blank" rel="noreferrer">copy the optional server template</a>.</li>
            <li>In Discord, open Server Settings → Integrations → Webhooks and create a webhook for that channel.</li>
            <li>Paste its URL below. It stays in this Mac&apos;s local data folder.</li>
          </ol>
          <label htmlFor="discord-webhook-url">Discord webhook URL</label>
          <div className="settings-discord-input">
            <input id="discord-webhook-url" type="password" autoComplete="off" spellCheck={false} value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={status?.discordConnected ? "Connected · paste a new URL to replace" : "https://discord.com/api/webhooks/…"} />
            <button type="button" disabled={busy || !webhookUrl.trim()} onClick={() => void discordAction("connect")}>{status?.discordConnected ? "Replace" : "Connect"}</button>
          </div>
          {status?.discordConnected && <div className="settings-discord-actions">
            <button type="button" disabled={busy} onClick={() => void discordAction("test")}>Send test message</button>
            <button type="button" disabled={busy} onClick={() => void discordAction("preview")}>Preview all alerts</button>
            <button type="button" disabled={busy} onClick={() => void discordAction("disconnect")}>Disconnect</button>
          </div>}
          <small>Preview shows all nine alert states using a current title and photo from your connected eBay store. Every card is labeled simulated; eBay inventory is untouched. Real alerts come from worker checks.</small>
          {notice && <p className="settings-discord-notice" role="status">{notice}</p>}
        </div>
      </details>
    </>
  );
}
