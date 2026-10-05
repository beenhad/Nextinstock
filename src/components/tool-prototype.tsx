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
  Layers,
  LayoutList,
  LoaderCircle,
  BookOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  PriceRule,
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
import { DELAY_OPTIONS, LadderPreview, RestockBoard, RuleFields, type IdenticalCopies, type QueueAction, type TaskPatch } from "./restock-board";
import { ladderPrices } from "@/lib/price-rule";

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
    };
  }
  const ordered = copies.map((copy, position) => ({ ...copy, queuePosition: position + 1 }));
  return { ...task, queuedCopies: ordered, queuedCopy: ordered[0] ?? null };
}

const builderSteps = ["Listing", "Copies", "Review"];

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
  const [prefillItemId, setPrefillItemId] = useState("");
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

  async function addIdentical(taskId: string, copies: IdenticalCopies): Promise<boolean> {
    setError("");
    try {
      const form = new FormData();
      form.set("internalReference", copies.reference);
      form.set("count", String(copies.count));
      form.set("prices", JSON.stringify(copies.prices.map((price) => price === null ? null : price.toFixed(2))));
      const response = await fetch(`/api/tasks/${taskId}/copies`, { method: "POST", body: form });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not add copies");
      withTransition(() => setTasks((list) => list.map((task) => task.id === taskId ? payload.task! : task)));
      showToast(`Added ${copies.count} ${copies.count === 1 ? "copy" : "copies"}`);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add copies");
      return false;
    }
  }

  function openView(nextView: ToolView) {
    withTransition(() => {
      setView(nextView);
      setBuilderStep(0);
      setBuilderTask(null);
      setError("");
    });
    if (nextView === "activity" || nextView === "tasks") void reload().catch(() => undefined);
  }

  function openBuilder(task: RestockTask | null, step: number, itemId = "") {
    withTransition(() => { setPrefillItemId(itemId); setBuilderTask(task); setBuilderStep(step); });
  }

  async function taskCreated(task: RestockTask) {
    const queuedAnotherCopy = Boolean(builderTask);
    await reload().catch(() => undefined);
    withTransition(() => {
      setBuilderStep(0);
      setBuilderTask(null);
      setView("tasks");
    });
    showToast(
      queuedAnotherCopy
        ? "Next physical copy queued"
        : task.listing.quantityAvailable === 0
        ? "Task activated · listing remains safely at zero"
        : "Restock task activated",
    );
  }

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
              step={builderStep}
              status={status}
              existingTask={builderTask}
              prefillItemId={prefillItemId}
              onStep={(nextStep) => withTransition(() => setBuilderStep(nextStep))}
              onClose={() => openBuilder(null, 0)}
              onCreated={taskCreated}
            />
          ) : view === "tasks" ? (
            <TasksView
              tasks={tasks}
              events={events}
              loading={loading}
              busyTaskId={busyTaskId}
              onNew={() => openBuilder(null, 1)}
              onQueue={(task) => openBuilder(task, 2)}
              onTrackOption={(task) => openBuilder(null, 1, task.itemId)}
              onCheck={checkTask}
              onQueueAction={updateQueue}
              onTaskPatch={patchTask}
              onAddIdentical={addIdentical}
            />
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

function TasksView({
  tasks,
  events,
  loading,
  busyTaskId,
  onNew,
  onQueue,
  onTrackOption,
  onCheck,
  onQueueAction,
  onTaskPatch,
  onAddIdentical,
}: {
  tasks: RestockTask[];
  events: ActivityEvent[];
  loading: boolean;
  busyTaskId: string | null;
  onNew: () => void;
  onQueue: (task: RestockTask) => void;
  onTrackOption: (task: RestockTask) => void;
  onCheck: (taskId: string) => void;
  onQueueAction: (taskId: string, copyId: string, body: QueueAction) => Promise<boolean>;
  onTaskPatch: (taskId: string, patch: TaskPatch) => Promise<boolean>;
  onAddIdentical: (taskId: string, copies: IdenticalCopies) => Promise<boolean>;
}) {
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [search, setSearch] = useState("");
  const queued = tasks.reduce((count, task) => count + task.queuedCopies.length, 0);
  const needsLook = (task: RestockTask) => ["attention", "error"].includes(task.status) || task.queuedCopies.length === 0;
  const attention = tasks.filter(needsLook).length;
  const visibleTasks = tasks.filter((task) => {
    if (filter === "attention" && !needsLook(task)) return false;
    const query = search.trim().toLowerCase();
    return !query || [task.itemId, task.listing.title, task.listing.variations.find((variation) => variation.key === task.variationKey)?.label, ...task.queuedCopies.map((copy) => copy.internalReference)]
      .some((value) => value?.toLowerCase().includes(query));
  });
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const restocked = events.filter(
    (event) => ["restock_completed", "variation_restock_confirmed"].includes(event.type) && new Date(event.createdAt) >= monthStart,
  ).length;

  return (
    <>
      <div className="tool-page-heading">
        <div>
          <h1>Your listings</h1>
          <p>Line up what sells next. Drag to reorder, click a price to change it.</p>
        </div>
        <button className="tool-primary-button" type="button" onClick={onNew}>
          <Plus size={16} /> Add a listing
        </button>
      </div>

      <div className="tool-stat-row">
        <article><span>Listings watched</span><strong>{tasks.length}</strong></article>
        <article><span>Copies queued</span><strong>{queued}</strong></article>
        <article><span>Restocked this month</span><strong>{restocked}</strong></article>
        <article className={attention ? "is-warning" : ""}><span>Need a look</span><strong>{attention}</strong></article>
      </div>

      <div className="tool-table-toolbar rb-toolbar">
        <div className="tool-table-tabs">
          <button className={filter === "all" ? "active" : ""} type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All <span>{tasks.length}</span></button>
          <button className={filter === "attention" ? "active" : ""} type="button" aria-pressed={filter === "attention"} onClick={() => setFilter("attention")}>Need a look <span>{attention}</span></button>
        </div>
        <label className="tool-table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings or labels" aria-label="Search listings" /></label>
      </div>

      {loading ? (
        <div className="tool-empty-state"><LoaderCircle className="spin" size={22} /> Loading</div>
      ) : tasks.length === 0 ? (
        <div className="tool-empty-state">
          <ShieldCheck size={26} />
          <strong>No listings yet</strong>
          <span>Pick a listing you sell more than one of, then line up the copies that come next.</span>
          <button className="tool-primary-button" type="button" onClick={onNew}>Add your first listing</button>
        </div>
      ) : visibleTasks.length === 0 ? (
        <div className="tool-empty-state"><Search size={24} /><strong>Nothing matches</strong><span>Try a different search or filter.</span></div>
      ) : (
        <RestockBoard
          tasks={visibleTasks}
          busyTaskId={busyTaskId}
          onCheck={onCheck}
          onQueueAction={onQueueAction}
          onTaskPatch={onTaskPatch}
          onAddIdentical={onAddIdentical}
          onAddDistinct={onQueue}
          onTrackOption={onTrackOption}
        />
      )}
    </>
  );
}

function TaskBuilder({
  step,
  status,
  existingTask,
  prefillItemId = "",
  onStep,
  onClose,
  onCreated,
}: {
  step: number;
  status: SystemStatus | null;
  existingTask: RestockTask | null;
  prefillItemId?: string;
  onStep: (step: number) => void;
  onClose: () => void;
  onCreated: (task: RestockTask) => Promise<void>;
}) {
  const [itemId, setItemId] = useState(
    existingTask?.itemId ?? (prefillItemId || status?.defaultItemId || ""),
  );
  const [listing, setListing] = useState<ListingSnapshot | null>(existingTask?.listing ?? null);
  const [variationKey, setVariationKey] = useState<string | null>(existingTask?.variationKey ?? null);
  const [internalReference, setInternalReference] = useState("");
  const [conditionDescription, setConditionDescription] = useState(
    existingTask?.listing.conditionDescription ?? "",
  );
  const [targetPrice, setTargetPrice] = useState(() => String(existingTask?.queuedCopies.at(-1)?.targetPrice ?? ""));
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"distinct" | "identical">(existingTask?.variationKey ? "identical" : "distinct");
  const [identicalCount, setIdenticalCount] = useState(3);
  const [rule, setRule] = useState<PriceRule>({ mode: "amount", step: 0, cap: null });
  const [delay, setDelay] = useState<number | null>(null);
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
      setMode(payload.listing.variations.length ? "identical" : "distinct");
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

  const isVariation = Boolean(variationKey);
  const effectiveMode = isVariation ? "identical" : mode;
  const selectedVariation = listing?.variations.find((variation) => variation.key === variationKey);
  const basePrice = selectedVariation?.price ?? listing?.price ?? null;
  const identicalPrices = effectiveMode === "identical" && rule.step !== 0 && basePrice !== null
    ? ladderPrices(basePrice, rule, identicalCount)
    : Array.from({ length: effectiveMode === "identical" ? identicalCount : 0 }, () => null as number | null);

  function next() {
    setBuilderError("");
    if (step === 1 && (!listing || !listing.supported)) {
      setBuilderError(listing?.unsupportedReasons.join(". ") || "Look up a listing first");
      return;
    }
    if (step === 1 && listing?.variations.length && !variationKey) {
      setBuilderError("Choose which option to restock");
      return;
    }
    if (step === 2) {
      if (!internalReference.trim()) return setBuilderError("Give this copy a label so you can tell copies apart");
      if (effectiveMode === "distinct") {
        if (files.length === 0) return setBuilderError("Add photos of this exact copy");
        if (!conditionDescription.trim()) return setBuilderError("Describe this copy's condition");
        if (targetPrice.trim() && (!/^\d{1,6}(?:\.\d{1,2})?$/.test(targetPrice.trim()) || Number(targetPrice) < 0.01)) {
          return setBuilderError("Enter a price like 24.99");
        }
      } else if (!listing?.imageUrls.length && !isVariation) {
        return setBuilderError("This listing has no photos to reuse. Add copies with their own photos instead.");
      }
    }
    onStep(Math.min(3, step + 1));
  }

  async function activate() {
    if (!listing) return;
    setSubmitting(true);
    setBuilderError("");
    try {
      const identical = effectiveMode === "identical";
      const label = internalReference.trim();
      const form = new FormData();
      form.set("itemId", listing.itemId);
      if (variationKey) form.set("variationKey", variationKey);
      if (identical) {
        form.set("internalReference", identicalCount > 1 ? `${label}-1` : label);
        form.set("conditionDescription", "");
        form.set("targetPrice", identicalPrices[0] === null ? "" : identicalPrices[0].toFixed(2));
        if (existingTask) { form.set("count", String(identicalCount)); form.set("prices", JSON.stringify(identicalPrices.map((price) => price === null ? null : price.toFixed(2)))); form.set("internalReference", label); }
      } else {
        form.set("internalReference", label);
        form.set("conditionDescription", conditionDescription);
        form.set("targetPrice", targetPrice.trim());
        files.forEach((file) => form.append("photos", file));
      }
      const endpoint = existingTask ? `/api/tasks/${existingTask.id}/copies` : "/api/tasks";
      const response = await fetch(endpoint, { method: "POST", body: form });
      const payload = (await response.json()) as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Could not save");
      let task = payload.task;
      if (!existingTask && identical && identicalCount > 1) {
        const rest = new FormData();
        rest.set("internalReference", label);
        rest.set("count", String(identicalCount - 1));
        rest.set("startIndex", "2");
        rest.set("prices", JSON.stringify(identicalPrices.slice(1).map((price) => price === null ? null : price.toFixed(2))));
        const more = await fetch(`/api/tasks/${task.id}/copies`, { method: "POST", body: rest });
        const morePayload = (await more.json()) as { task?: RestockTask; error?: string };
        if (!more.ok || !morePayload.task) throw new Error(morePayload.error || "Saved the first copy, but not the rest");
        task = morePayload.task;
      }
      if (!existingTask && (delay !== null || (identical && rule.step !== 0))) {
        const settings = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restockDelaySeconds: delay, ...(identical && rule.step !== 0 ? { priceRule: rule } : {}) }),
        });
        const settingsPayload = (await settings.json()) as { task?: RestockTask };
        if (settings.ok && settingsPayload.task) task = settingsPayload.task;
      }
      await onCreated(task);
    } catch (caught) {
      setBuilderError(caught instanceof Error ? caught.message : "Could not save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="builder-shell">
      <div className="builder-heading">
        <div>
          <button type="button" onClick={onClose}><ArrowLeft size={16} /> Your listings</button>
          <h1>{existingTask ? "Add a copy" : "Add a listing"}</h1>
          <p>{existingTask ? "This copy goes to the end of the line. You can drag it anywhere later." : "Pick a listing, line up what sells next, and choose how restocks happen."}</p>
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
          <div className="builder-content">
            <span className="builder-kicker">Step 2 · Copies</span>
            <h2>{existingTask ? "Add the next copy" : "What sells after this one?"}</h2>
            {!existingTask && !isVariation && <div className="builder-mode" role="radiogroup" aria-label="Kind of copies">
              <button type="button" role="radio" aria-checked={mode === "distinct"} className={mode === "distinct" ? "is-on" : ""} onClick={() => setMode("distinct")}>
                <Upload size={18} aria-hidden="true" /><span><strong>Each copy is different</strong><small>Own photos and condition note, so buyers see the exact one.</small></span>
              </button>
              <button type="button" role="radio" aria-checked={mode === "identical"} className={mode === "identical" ? "is-on" : ""} onClick={() => setMode("identical")}>
                <Layers size={18} aria-hidden="true" /><span><strong>Identical copies</strong><small>Same photos and note as the listing. Only the price can change.</small></span>
              </button>
            </div>}
            {effectiveMode === "distinct" ? (
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
            ) : (
              <div className="builder-identical">
                {isVariation && <p className="builder-note">This is one option of a multi-option listing. Each restock puts one more of {selectedVariation?.label.replace(/^[^:]+:\s*/, "") ?? "it"} back up. Its photos stay as they are on eBay.</p>}
                <div className="builder-identical-row">
                  <label className="rb-field">
                    <span>How many copies</span>
                    <span className="rb-stepper">
                      <button type="button" aria-label="Fewer" onClick={() => setIdenticalCount((value) => Math.max(1, value - 1))}>−</button>
                      <input inputMode="numeric" value={identicalCount} onChange={(event) => setIdenticalCount(Math.max(1, Math.min(50, Number(event.target.value.replace(/\D/g, "")) || 1)))} aria-label="Number of copies" />
                      <button type="button" aria-label="More" onClick={() => setIdenticalCount((value) => Math.min(50, value + 1))}>+</button>
                    </span>
                  </label>
                  <label className="rb-field rb-field-grow">
                    <span>Label</span>
                    <input className="rb-text-input" aria-label="Internal reference" placeholder="e.g. PKXD" value={internalReference} maxLength={90} onChange={(event) => setInternalReference(event.target.value)} />
                  </label>
                </div>
                <div className="builder-rule">
                  <strong>Price per sale</strong>
                  <small>Optional. Nudge the price up (or down) with every restock, starting from {money(basePrice, selectedVariation?.currency ?? listing?.currency)}.</small>
                  <RuleFields rule={rule} onRule={setRule} currency={selectedVariation?.currency ?? listing?.currency ?? "USD"} />
                  {rule.step !== 0 && <LadderPreview base={basePrice} prices={identicalPrices.filter((price): price is number => price !== null)} currency={selectedVariation?.currency ?? listing?.currency ?? "USD"} />}
                </div>
              </div>
            )}
          </div>
        )}
        {step === 3 && (
          <BuilderReview
            listing={listing}
            variationKey={variationKey}
            files={files}
            mode={effectiveMode}
            count={effectiveMode === "identical" ? identicalCount : 1}
            internalReference={internalReference}
            prices={effectiveMode === "identical" ? identicalPrices : [targetPrice.trim() ? Number(targetPrice) : null]}
            delay={delay}
            onDelay={existingTask ? null : setDelay}
            status={status}
          />
        )}
        <div className="builder-actions">
          <button className="builder-secondary" type="button" onClick={step === 1 ? onClose : () => onStep(step - 1)}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button className="tool-primary-button" type="button" onClick={next} disabled={loadingListing}>
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button className="tool-primary-button" type="button" onClick={activate} disabled={submitting}>
              {submitting ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}
              {submitting
                ? "Saving"
                : existingTask
                  ? "Add to queue"
                  : "Start watching"}
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
    <div>
      <p className="builder-note">When the current one sells, these photos, this note, and this price replace what&apos;s on the listing.</p>
      <div className="builder-copy-grid">
        <div className="builder-upload-area">
          <div className={`builder-photo-grid ${files.length ? "" : "is-empty"}`}>
            {files.length ? files.slice(0, 12).map((file) => <LocalFilePreview file={file} key={`${file.name}-${file.lastModified}`} />) : (
              <span className="builder-upload-placeholder"><Upload size={24} /> Photos of this exact copy</span>
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
          <small>{files.length ? `${files.length} ${files.length === 1 ? "photo" : "photos"} · first one becomes the main photo` : "JPEG, PNG, WebP, or HEIC · up to 24"}</small>
        </div>
        <div className="builder-fields">
          <label>
            <span>Label</span>
            <input aria-label="Internal reference" placeholder="e.g. PKXD-009" value={internalReference} onChange={(event) => onInternalReference(event.target.value)} />
          </label>
          <label>
            <span>Condition</span>
            <button type="button" className="builder-select" disabled>{listing?.conditionName ?? "Good"} <Check size={14} /></button>
          </label>
          <label>
            <span>Condition note</span>
            <textarea value={conditionDescription} onChange={(event) => onConditionDescription(event.target.value)} />
          </label>
          <label>
            <span>Price for this copy</span>
            <input type="number" inputMode="decimal" min="0.01" max="999999.99" step="0.01" placeholder={`Keep ${money(listing?.price ?? null, listing?.currency)}`} value={targetPrice} onChange={(event) => onTargetPrice(event.target.value)} />
            {targetPrice && (
              <small>eBay may reset automatic Best Offer thresholds when the price changes.</small>
            )}
          </label>
        </div>
      </div>
    </div>
  );
}

function BuilderReview({
  listing,
  variationKey,
  files,
  mode,
  count,
  internalReference,
  prices,
  delay,
  onDelay,
  status,
}: {
  listing: ListingSnapshot | null;
  variationKey: string | null;
  files: File[];
  mode: "distinct" | "identical";
  count: number;
  internalReference: string;
  prices: Array<number | null>;
  delay: number | null;
  onDelay: ((value: number | null) => void) | null;
  status: SystemStatus | null;
}) {
  const selected = listing?.variations.find((variation) => variation.key === variationKey);
  const currency = selected?.currency ?? listing?.currency;
  const live = selected?.price ?? listing?.price ?? null;
  const dryRun = !status?.liveWritesAuthorized;
  const first = prices[0] ?? null;
  const last = prices.at(-1) ?? null;
  return (
    <div className="builder-content">
      <span className="builder-kicker">Step 3 · Review</span>
      <h2>Here&apos;s what will happen</h2>
      <div className="builder-review-card">
        <div className="builder-review-listing">
          <ListingImage src={selected?.imageUrls[0] ?? listing?.imageUrls[0]} alt={listing?.title ?? "eBay listing"} />
          <span><small>On eBay now</small><strong>{listing?.title}</strong><em>{selected?.label ? `${selected.label.replace(/^[^:]+:\s*/, "")} · ` : ""}{money(live, currency)} · {selected?.quantityAvailable ?? listing?.quantityAvailable} available</em></span>
        </div>
        <div className="builder-review-arrow"><ArrowRight size={20} /></div>
        <div className="builder-review-listing">
          {mode === "distinct" && files[0] ? <LocalFilePreview file={files[0]} /> : <ListingImage src={selected?.imageUrls[0] ?? listing?.imageUrls[0]} alt="Same photos as the listing" />}
          <span><small>{count === 1 ? "Then" : `Then ${count} copies`}</small><strong>{internalReference || "Untitled"}{count > 1 ? ` 1–${count}` : ""}</strong><em>{mode === "distinct" ? `${files.length} new ${files.length === 1 ? "photo" : "photos"}` : "Same photos"} · {first === null ? "live price" : count > 1 && last !== null && last !== first ? `${money(first, currency)} → ${money(last, currency)}` : money(first, currency)}</em></span>
        </div>
      </div>
      <ol className="builder-steps-plain">
        <li>When the current one sells, the listing stays sold out for a moment.</li>
        <li>{mode === "distinct" ? "Next swaps in this copy's photos, note, and price." : selected ? "Next sets this option's price, if it changes." : "Next updates the price, if it changes. Photos stay."}</li>
        <li>Next checks eBay took the change, then puts one back up for sale.</li>
      </ol>
      {onDelay && <label className="builder-delay">
        <span><strong>When to restock</strong><small>How long to wait after a sale before the next one goes up.</small></span>
        <select value={String(delay)} onChange={(event) => onDelay(event.target.value === "null" ? null : Number(event.target.value))}>
          {DELAY_OPTIONS.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
        </select>
      </label>}
      <div className={`builder-mode-note ${dryRun ? "is-dry" : ""}`}>
        <ShieldCheck size={17} />
        <span>{dryRun
          ? <><strong>Test mode is on</strong><small>Nothing changes on eBay yet. You&apos;ll see exactly what would happen in Activity.</small></>
          : <><strong>Live</strong><small>Restocks will change this listing on eBay.</small></>}</span>
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
