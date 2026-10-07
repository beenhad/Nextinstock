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
  ExternalLink,
  HardDrive,
  LayoutList,
  LoaderCircle,
  BookOpen,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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
import { ListingsHome } from "./listings-home";
import { ReleaseLine } from "./release-line";
import type { DistinctCopy, IdenticalCopies, QueueAction, TaskPatch } from "./tool-actions";

type ToolView = "tasks" | "activity" | "settings" | "support";

/** Animate a state change with the View Transitions API when the browser has it. */
function withTransition(update: () => void) {
  const doc = typeof document === "undefined" ? null : document as Document & { startViewTransition?: (callback: () => void) => unknown };
  if (doc?.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    doc.startViewTransition(() => flushSync(update));
  } else {
    update();
  }
}

/** Apply task-level edits (order, prices, settings) locally before the server answers. */
function applyTaskPatch(task: RestockTask, patch: TaskPatch): RestockTask {
  let copies = task.queuedCopies;
  if (patch.order) {
    const byId = new Map(copies.map((copy) => [copy.id, copy]));
    copies = patch.order.map((id) => byId.get(id)).filter((copy): copy is QueuedCopy => Boolean(copy));
  }
  if (patch.prices) {
    const prices = new Map(patch.prices.map((entry) => [entry.copyId, entry.targetPrice === null ? null : Number(entry.targetPrice)]));
    copies = copies.map((copy) => prices.has(copy.id) ? { ...copy, targetPrice: prices.get(copy.id) ?? null } : copy);
  }
  const ordered = copies.map((copy, position) => ({ ...copy, queuePosition: position + 1 }));
  return {
    ...task,
    ...(patch.restockDelaySeconds !== undefined ? { restockDelaySeconds: patch.restockDelaySeconds } : {}),
    ...(patch.priceRule !== undefined ? { priceRule: patch.priceRule } : {}),
    queuedCopies: ordered,
    queuedCopy: ordered[0] ?? null,
  };
}

/** Apply a queue edit locally so the UI responds before the server does. */
function applyQueueAction(task: RestockTask, copyId: string, body: QueueAction): RestockTask {
  const copies = [...task.queuedCopies];
  const index = copies.findIndex((copy) => copy.id === copyId);
  if (index < 0) return task;
  if (body.action === "move") {
    const other = index + (body.direction === "up" ? -1 : 1);
    if (other < 0 || other >= copies.length) return task;
    [copies[index], copies[other]] = [copies[other], copies[index]];
  } else if (body.action === "remove") {
    copies.splice(index, 1);
  } else if (body.action === "price") {
    const value = body.targetPrice.trim() === "" ? null : Number(body.targetPrice);
    copies[index] = { ...copies[index], targetPrice: value === null || Number.isFinite(value) ? value : copies[index].targetPrice };
  } else {
    copies[index] = {
      ...copies[index],
      ...(body.internalReference !== undefined ? { internalReference: body.internalReference.trim() } : {}),
      ...(body.conditionDescription !== undefined ? { conditionDescription: body.conditionDescription.trim() } : {}),
      ...(body.releaseDelaySeconds !== undefined ? { releaseDelaySeconds: body.releaseDelaySeconds } : {}),
      ...(body.needsApproval !== undefined ? { needsApproval: body.needsApproval, ...(body.needsApproval ? {} : {}) } : {}),
      ...(body.grade !== undefined ? { grade: body.grade } : {}),
    };
  }
  const ordered = copies.map((copy, position) => ({ ...copy, queuePosition: position + 1 }));
  return { ...task, queuedCopies: ordered, queuedCopy: ordered[0] ?? null };
}


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

export function ToolPrototype() {
  const [view, setView] = useState<ToolView>("tasks");
  const [builderStep, setBuilderStep] = useState(0);
  const [prefillItemId, setPrefillItemId] = useState("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
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
    // The Discord "Approve" link opens the listing so the seller can confirm with one tap.
    const approveId = new URLSearchParams(window.location.search).get("approve");
    if (approveId) setOpenTaskId(approveId);
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

  const toastTimer = useRef<number | undefined>(undefined);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const queueSequence = useRef(new Map<string, number>());

  function showToast(message: string) {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  async function checkTask(taskId: string) {
    setBusyTaskId(taskId);
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/check`, { method: "POST" });
      const payload = (await response.json()) as { result?: WorkerResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error || "Task check failed");
      await reload();
      showToast(payload.result.message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Task check failed");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function updateQueue(taskId: string, copyId: string, body: QueueAction): Promise<boolean> {
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return false;
    const sequence = (queueSequence.current.get(taskId) ?? 0) + 1;
    queueSequence.current.set(taskId, sequence);
    const nextTask = applyQueueAction(current, copyId, body);
    const commit = () => setTasks((list) => list.map((task) => task.id === taskId ? nextTask : task));
    if (body.action === "move" || body.action === "remove") withTransition(commit);
    else commit();
    setError("");
    try {
      const url = `/api/tasks/${taskId}/copies/${copyId}`;
      const response = body.action === "remove"
        ? await fetch(url, { method: "DELETE" })
        : await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not update the queue");
      if (queueSequence.current.get(taskId) === sequence) {
        setTasks((list) => list.map((task) => task.id === taskId ? payload.task! : task));
      }
      if (body.action === "remove") showToast("Copy removed from the queue");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the queue");
      await reload().catch(() => undefined);
      return false;
    }
  }

  async function patchTask(taskId: string, patch: TaskPatch): Promise<boolean> {
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return false;
    const sequence = (queueSequence.current.get(taskId) ?? 0) + 1;
    queueSequence.current.set(taskId, sequence);
    const nextTask = applyTaskPatch(current, patch);
    const commit = () => setTasks((list) => list.map((task) => task.id === taskId ? nextTask : task));
    if (patch.order || patch.prices) withTransition(commit); else commit();
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not save the change");
      if (queueSequence.current.get(taskId) === sequence) {
        setTasks((list) => list.map((task) => task.id === taskId ? payload.task! : task));
      }
      if (patch.prices) showToast(`Repriced ${patch.prices.length} queued ${patch.prices.length === 1 ? "copy" : "copies"}`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the change");
      await reload().catch(() => undefined);
      return false;
    }
  }

  async function addIdentical(taskId: string, copies: IdenticalCopies): Promise<RestockTask | null> {
    setError("");
    const current = tasksRef.current.find((task) => task.id === taskId);
    if (!current) return null;
    // Show the new copies immediately; the server's answer replaces these placeholders.
    const stamp = Date.now();
    const placeholders: QueuedCopy[] = Array.from({ length: copies.count }, (_, index) => ({
      id: `pending-${stamp}-${index}`, taskId, queuePosition: 0, internalReference: `${copies.reference}…`,
      targetPrice: copies.prices[index] ?? null, conditionId: null, conditionName: null, conditionDescription: "",
      releaseDelaySeconds: copies.releaseDelaySeconds ?? null, needsApproval: Boolean(copies.needsApproval), grade: null,
      status: "queued", photos: [], createdAt: new Date().toISOString(),
    }));
    const anchorIndex = copies.afterCopyId ? current.queuedCopies.findIndex((copy) => copy.id === copies.afterCopyId) : -1;
    const at = anchorIndex >= 0 ? anchorIndex + 1 : current.queuedCopies.length;
    const optimistic = [...current.queuedCopies.slice(0, at), ...placeholders, ...current.queuedCopies.slice(at)];
    setTasks((list) => list.map((task) => task.id === taskId ? { ...task, queuedCopies: optimistic, queuedCopy: optimistic[0] ?? null } : task));
    const sequence = (queueSequence.current.get(taskId) ?? 0) + 1;
    queueSequence.current.set(taskId, sequence);
    try {
      const form = new FormData();
      form.set("internalReference", copies.reference);
      form.set("count", String(copies.count));
      form.set("startIndex", String(current.queuedCopies.filter((copy) => copy.photos.length === 0).length + 1));
      form.set("prices", JSON.stringify(copies.prices.map((price) => price === null ? null : price.toFixed(2))));
      if (copies.releaseDelaySeconds !== undefined && copies.releaseDelaySeconds !== null) form.set("releaseDelaySeconds", String(copies.releaseDelaySeconds));
      if (copies.needsApproval) form.set("needsApproval", "true");
      const response = await fetch(`/api/tasks/${taskId}/copies`, { method: "POST", body: form });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not add copies");
      let task = payload.task;
      if (at < current.queuedCopies.length) {
        const known = new Set(current.queuedCopies.map((copy) => copy.id));
        const added = task.queuedCopies.filter((copy) => !known.has(copy.id)).map((copy) => copy.id);
        const rest = task.queuedCopies.map((copy) => copy.id).filter((id) => !added.includes(id));
        const order = [...rest.slice(0, at), ...added, ...rest.slice(at)];
        const reordered = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order }) });
        const reorderPayload = await reordered.json() as { task?: RestockTask };
        if (reordered.ok && reorderPayload.task) task = reorderPayload.task;
      }
      if (queueSequence.current.get(taskId) === sequence) setTasks((list) => list.map((entry) => entry.id === taskId ? task : entry));
      return task;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add copies");
      await reload().catch(() => undefined);
      return null;
    }
  }

  async function addDistinct(taskId: string, copy: DistinctCopy): Promise<RestockTask | null> {
    setError("");
    try {
      const form = new FormData();
      form.set("internalReference", copy.reference);
      form.set("conditionDescription", copy.note);
      form.set("targetPrice", copy.price.trim());
      if (copy.grade) form.set("grade", copy.grade);
      copy.files.forEach((file) => form.append("photos", file));
      const response = await fetch(`/api/tasks/${taskId}/copies`, { method: "POST", body: form });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not add the copy");
      withTransition(() => setTasks((list) => list.map((task) => task.id === taskId ? payload.task! : task)));
      showToast("Added to the line");
      return payload.task;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add the copy");
      return null;
    }
  }

  async function approve(taskId: string): Promise<boolean> {
    setError("");
    try {
      const response = await fetch(`/api/tasks/${taskId}/approve`, { method: "POST" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not approve");
      await reload();
      showToast("Approved. The next one is going up.");
      if (window.location.search.includes("approve=")) window.history.replaceState(null, "", "/tool");
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not approve");
      return false;
    }
  }

  function openTask(taskId: string | null) {
    withTransition(() => { setOpenTaskId(taskId); setError(""); });
  }

  function openView(nextView: ToolView) {
    withTransition(() => {
      setView(nextView);
      setBuilderStep(0);
      
      setOpenTaskId(null);
      setError("");
    });
    if (nextView === "activity" || nextView === "tasks") void reload().catch(() => undefined);
  }

  function openBuilder(task: RestockTask | null, step: number, itemId = "") {
    withTransition(() => { setPrefillItemId(itemId); setBuilderStep(step); });
  }

  async function taskCreated(task: RestockTask) {
    await reload().catch(() => undefined);
    withTransition(() => {
      setBuilderStep(0);
      
      setView("tasks");
      setOpenTaskId(task.id);
    });
  }

  const openTaskData = openTaskId ? tasks.find((task) => task.id === openTaskId) ?? null : null;

  return (
    <div className="tool-shell">
      <aside className="tool-sidebar">
        <Link href="/" className="tool-brand-link"><BrandMark /></Link>
        <nav aria-label="Tool navigation">
          <button className={view === "tasks" ? "active" : ""} type="button" onClick={() => openView("tasks")}>
            <LayoutList size={17} /> Listings
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
              <span /> {status?.liveWritesAuthorized ? "Live" : status?.writeMode === "live" ? "Live mode not ready" : "Test mode"}
            </span>
            <button className="tool-avatar" type="button" aria-label={`Open settings${profile ? ` for ${profile.userId}` : ""}`} onClick={() => openView("settings")}><EbayAvatar profile={profile} /></button>
          </div>
        </header>

        <main className="tool-workspace">
          {error && <div className="tool-error-banner"><AlertTriangle size={17} /> {error}</div>}
          {builderStep > 0 ? (
            <TaskBuilder
              key={prefillItemId || "new"}
              status={status}
              prefillItemId={prefillItemId}
              onClose={() => openBuilder(null, 0)}
              onCreated={taskCreated}
            />
          ) : view === "tasks" && openTaskData ? (
            <ReleaseLine
              key={openTaskData.id}
              task={openTaskData}
              busy={busyTaskId === openTaskData.id}
              actions={{
                onBack: () => openTask(null),
                onCheck: () => void checkTask(openTaskData.id),
                onApprove: () => approve(openTaskData.id),
                onQueueAction: (copyId, body) => updateQueue(openTaskData.id, copyId, body),
                onPatch: (patch) => patchTask(openTaskData.id, patch),
                onAddIdentical: (copies) => addIdentical(openTaskData.id, copies),
                onAddDistinct: (copy) => addDistinct(openTaskData.id, copy),
              }}
            />
          ) : view === "tasks" ? (
            <ListingsHome tasks={tasks} events={events} loading={loading} onOpen={(task) => openTask(task.id)} onNew={() => openBuilder(null, 1)} />
          ) : view === "activity" ? (
            <ActivityView events={events} />
          ) : view === "support" ? (
            <ToolSupport status={status} onNewTask={() => openBuilder(null, 1)} onSettings={() => openView("settings")} />
          ) : (
            <SettingsView status={status} onSaved={reload} />
          )}
        </main>
      </div>

      {toast && <div className="tool-toast" role="status" key={toast}><CircleCheck size={17} /><span>{toast}</span></div>}
    </div>
  );
}

function TaskBuilder({
  status,
  prefillItemId = "",
  onClose,
  onCreated,
}: {
  status: SystemStatus | null;
  prefillItemId?: string;
  onClose: () => void;
  onCreated: (task: RestockTask) => Promise<void>;
}) {
  const [itemId, setItemId] = useState(prefillItemId || status?.defaultItemId || "");
  const [listing, setListing] = useState<ListingSnapshot | null>(null);
  const [variationKey, setVariationKey] = useState<string | null>(null);
  const [loadingListing, setLoadingListing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [builderError, setBuilderError] = useState("");

  const syncListing = useCallback(async () => {
    setLoadingListing(true);
    setBuilderError("");
    try {
      const response = await fetch(`/api/ebay/listings?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { listing?: ListingSnapshot; error?: string };
      if (!response.ok || !payload.listing) throw new Error(payload.error || "Couldn't find that listing");
      setListing(payload.listing);
      setVariationKey(null);
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Couldn't find that listing");
    } finally {
      setLoadingListing(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (itemId) void syncListing();
  }, []); // Look the prefilled listing up once when this opens.

  async function start() {
    setBuilderError("");
    if (!listing || !listing.supported) {
      setBuilderError(listing?.unsupportedReasons.join(". ") || "Look up a listing first");
      return;
    }
    if (listing.variations.length && !variationKey) {
      setBuilderError("Choose which option this is for");
      return;
    }
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("itemId", listing.itemId);
      form.set("startEmpty", "true");
      if (variationKey) form.set("variationKey", variationKey);
      const response = await fetch("/api/tasks", { method: "POST", body: form });
      const payload = (await response.json()) as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Couldn't add the listing");
      await onCreated(payload.task);
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Couldn't add the listing");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="builder-shell">
      <div className="builder-heading">
        <div>
          <button type="button" onClick={onClose}><ArrowLeft size={16} /> Listings</button>
          <h1>Add a listing</h1>
          <p>Pick the eBay listing you have more than one of. You&apos;ll line up the copies next.</p>
        </div>
        <button className="builder-close" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="builder-card">
        {builderError && <div className="builder-error"><AlertTriangle size={15} /> {builderError}</div>}
        <BuilderListing
          itemId={itemId}
          listing={listing}
          loading={loadingListing}
          onItemId={(value) => { setItemId(value); setListing(null); setVariationKey(null); }}
          onSync={syncListing}
          variationKey={variationKey}
          onVariationKey={setVariationKey}
        />
        <div className="builder-actions">
          <button className="builder-secondary" type="button" onClick={onClose}>Cancel</button>
          <button className="tool-primary-button" type="button" onClick={() => void start()} disabled={loadingListing || submitting || !listing}>
            {submitting ? <LoaderCircle className="spin" size={15} /> : null} Line up copies <ArrowRight size={15} />
          </button>
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
        <div><h1>Settings</h1><p>How Next connects to eBay and when it&apos;s allowed to make changes.</p></div>
      </div>
      <div className="settings-card">
        <div>
          <EbayBadge />
          <span>
            <strong>{status?.ebayConfigured ? "eBay connected" : "eBay not connected"}</strong>
            <small>{status?.ebayConfigured ? (status.liveWritesAuthorized || status.writeMode === "dry-run" ? "Next can read your listings." : "Next can read your listings but isn't allowed to update them yet.") : "Add your eBay developer keys to .env.local, then restart Next."}</small>
          </span>
          <a className="settings-action" href="/api/ebay/auth/start">{status?.ebayConfigured ? "Allow listing updates" : "Connect eBay"} <ExternalLink size={13} /></a>
        </div>
        <div>
          <ShieldCheck size={21} />
          <span>
            <strong>{status?.liveWritesAuthorized ? "Live mode" : "Test mode"}</strong>
            <small>{status?.liveWritesAuthorized
              ? "Restocks change your listings on eBay."
              : status?.writeMode === "live"
                ? status.liveWritesBlocker ?? "Live mode is on but not ready yet."
                : "Next shows what it would change, without touching eBay. To go live, set NEXTINSTOCK_EBAY_WRITE_MODE=live in .env.local and restart."}</small>
          </span>
          <span className={`settings-on ${status?.liveWritesAuthorized ? "" : "is-warning"}`}>{status?.liveWritesAuthorized ? "Live" : "Test"}</span>
        </div>
        <div>
          <Clock3 size={21} />
          <span><strong>Checking eBay</strong><small>Every {status?.pollSeconds ?? 30} seconds. Default wait before a restock: {Math.round((status?.restockDelaySeconds ?? 60) / 60) >= 1 ? `${Math.round((status?.restockDelaySeconds ?? 60) / 60)} min` : `${status?.restockDelaySeconds}s`}. Each listing can override it.</small></span>
          <span className="settings-on">On</span>
        </div>
        <div>
          <HardDrive size={21} />
          <span><strong>Photos and history</strong><small className="settings-path">Saved on this computer{status?.storagePath ? ` · ${status.storagePath}` : ""}</small></span>
          <span className="settings-on">{status?.persistentStorage ? "Saved" : "Temporary"}</span>
        </div>
      </div>
      <details className="settings-optional">
        <summary><span><strong>Discord alerts</strong><small>Optional · Get a message for every sale and restock</small></span><span className={`settings-on ${status?.discordConnected ? "" : "is-off"}`}>{status?.discordConnected ? "Connected" : "Off"}</span></summary>
        <div className="settings-optional-body">
          <p>Next posts to a Discord channel when something sells, when a restock goes up, and when something needs you. Each message shows the item photo and what changed. No bot or developer account needed.</p>
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
