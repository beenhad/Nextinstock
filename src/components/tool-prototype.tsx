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
  DiscordAlerts,
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
function withTransition(update: () => void, scope: "page" | "data" = "page") {
  const doc = typeof document === "undefined" ? null : document as Document & { startViewTransition?: (callback: () => void) => { finished: Promise<void> } };
  if (doc?.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // Data updates only slide the nodes; the page itself must not fade.
    if (scope === "data") document.documentElement.dataset.vt = "data";
    const transition = doc.startViewTransition(() => flushSync(update));
    transition.finished.finally(() => { delete document.documentElement.dataset.vt; });
  } else update();
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
  const [busyTaskIds, setBusyTaskIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");

  const tasksRef = useRef(tasks);
  const pendingOperations = useRef(new Map<string, number>());
  const operationQueues = useRef(new Map<string, Promise<unknown>>());
  const intakeRequests = useRef(new Map<string, { id: string; startIndex: number }>());
  const reloadController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const commitTasks = useCallback((update: (current: RestockTask[]) => RestockTask[]) => {
    tasksRef.current = update(tasksRef.current);
    if (mounted.current) setTasks(tasksRef.current);
  }, []);

  const reload = useCallback(async (refreshTaskId?: string) => {
    reloadController.current?.abort();
    const controller = new AbortController();
    reloadController.current = controller;
    try {
      const responses = await Promise.all([
        fetch("/api/tasks", { cache: "no-store", signal: controller.signal }),
        fetch("/api/activity", { cache: "no-store", signal: controller.signal }),
        fetch("/api/system/status", { cache: "no-store", signal: controller.signal }),
      ]);
      const [tasksPayload, eventsPayload, statusPayload] = await Promise.all(responses.map((response) => response.json())) as [
        { tasks?: RestockTask[]; error?: string }, { events?: ActivityEvent[]; error?: string }, { status?: SystemStatus; error?: string },
      ];
      for (const [index, payload] of [tasksPayload, eventsPayload, statusPayload].entries()) {
        if (!responses[index].ok) throw new Error(payload.error || "Could not refresh Nextinstock");
      }
      if (controller.signal.aborted || !mounted.current) return;
      const current = tasksRef.current;
      const protectedTask = (id: string) => id !== refreshTaskId && pendingOperations.current.has(id);
      const fresh = (tasksPayload.tasks ?? []).map((task) => protectedTask(task.id) ? current.find((entry) => entry.id === task.id) ?? task : task);
      fresh.push(...current.filter((task) => protectedTask(task.id) && !fresh.some((entry) => entry.id === task.id)));
      if (JSON.stringify(fresh) !== JSON.stringify(current)) commitTasks(() => fresh);
      setEvents(eventsPayload.events ?? []);
      setStatus(statusPayload.status ?? null);
      setRefreshError("");
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (mounted.current) setRefreshError(caught instanceof Error ? caught.message : "Could not refresh Nextinstock");
        throw caught;
      }
    }
  }, [commitTasks]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; reloadController.current?.abort(); };
  }, []);

  useEffect(() => {
    reload()
      .catch(() => undefined)
      .finally(() => setLoading(false));
    // The Discord "Approve" link opens the listing so the seller can confirm with one tap.
    const approveId = new URLSearchParams(window.location.search).get("approve");
    if (approveId) setOpenTaskId(approveId);
  }, [reload]);

  // Keep the screen current while it's open: a sale or restock shows up within a few seconds.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const focused = document.activeElement?.tagName;
      if (focused === "INPUT" || focused === "TEXTAREA") return;
      void reload().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [reload]);

  useEffect(() => {
    if (!status?.ebayConfigured) {
      setProfile(null);
      return;
    }
    setProfile(null);
    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/ebay/profile", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load eBay profile");
        return response.json() as Promise<{ profile: EbayProfile }>;
      })
      .then((payload) => { if (!cancelled) setProfile(payload.profile); })
      .catch(() => { if (!cancelled) setProfile(null); });
    return () => { cancelled = true; controller.abort(); };
  }, [status?.ebayConfigured, status?.ebayCredentialSource, status?.ebayAccountKey]);

  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function showToast(message: string) {
    if (!mounted.current) return;
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  function serializeTask<T>(taskId: string, job: () => Promise<T>): Promise<T> {
    pendingOperations.current.set(taskId, (pendingOperations.current.get(taskId) ?? 0) + 1);
    setBusyTaskIds(new Set(pendingOperations.current.keys()));
    const previous = operationQueues.current.get(taskId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(job).finally(() => {
      const left = (pendingOperations.current.get(taskId) ?? 1) - 1;
      if (left) pendingOperations.current.set(taskId, left);
      else { pendingOperations.current.delete(taskId); operationQueues.current.delete(taskId); }
      if (mounted.current) setBusyTaskIds(new Set(pendingOperations.current.keys()));
    });
    operationQueues.current.set(taskId, result.catch(() => undefined));
    return result;
  }

  function replaceTask(task: RestockTask) {
    commitTasks((list) => list.map((entry) => entry.id === task.id ? task : entry));
  }

  async function checkTask(taskId: string) {
    return serializeTask(taskId, async () => {
      setError("");
      try {
        const response = await fetch(`/api/tasks/${taskId}/check`, { method: "POST" });
        const payload = await response.json() as { result?: WorkerResult; error?: string };
        if (!response.ok || !payload.result) throw new Error(payload.error || "Task check failed");
        await reload(taskId);
        showToast(payload.result.message);
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Task check failed"); }
    });
  }

  function updateQueue(taskId: string, copyId: string, body: QueueAction): Promise<boolean> {
    return serializeTask(taskId, async () => {
      const current = tasksRef.current.find((task) => task.id === taskId);
      if (!current) return false;
      const commit = () => { if (tasksRef.current.find((task) => task.id === taskId) === current) replaceTask(applyQueueAction(current, copyId, body)); };
      if (body.action === "move" || body.action === "remove") withTransition(commit, "data"); else commit();
      setError("");
      try {
        const url = `/api/tasks/${taskId}/copies/${copyId}`;
        const response = body.action === "remove" ? await fetch(url, { method: "DELETE" })
          : await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const payload = await response.json() as { task?: RestockTask; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "Could not update the queue");
        replaceTask(payload.task);
        if (body.action === "remove") showToast("Copy removed from the queue");
        return true;
      } catch (caught) {
        replaceTask(current);
        setError(caught instanceof Error ? caught.message : "Could not update the queue");
        await reload(taskId).catch(() => undefined);
        return false;
      }
    });
  }

  function patchTask(taskId: string, patch: TaskPatch): Promise<boolean> {
    return serializeTask(taskId, async () => {
      const current = tasksRef.current.find((task) => task.id === taskId);
      if (!current) return false;
      const commit = () => { if (tasksRef.current.find((task) => task.id === taskId) === current) replaceTask(applyTaskPatch(current, patch)); };
      if (patch.order && !patch.fromDrag) withTransition(commit, "data"); else commit();
      setError("");
      try {
        const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, fromDrag: undefined }) });
        const payload = await response.json() as { task?: RestockTask; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "Could not save the change");
        replaceTask(payload.task);
        if (patch.prices) showToast(`Repriced ${patch.prices.length} queued ${patch.prices.length === 1 ? "copy" : "copies"}`);
        return true;
      } catch (caught) {
        replaceTask(current);
        setError(caught instanceof Error ? caught.message : "Could not save the change");
        await reload(taskId).catch(() => undefined);
        return false;
      }
    });
  }

  function intakeRequest(taskId: string, kind: string, details: unknown) {
    const key = JSON.stringify([taskId, kind, details]);
    let receipt = intakeRequests.current.get(key);
    if (!receipt) {
      receipt = { id: crypto.randomUUID(), startIndex: (tasksRef.current.find((task) => task.id === taskId)?.queuedCopies.filter((copy) => !copy.photos.length).length ?? 0) + 1 };
      intakeRequests.current.set(key, receipt);
    }
    return { key, ...receipt };
  }

  function addIdentical(taskId: string, copies: IdenticalCopies): Promise<RestockTask | null> {
    const receipt = intakeRequest(taskId, "identical", copies);
    return serializeTask(taskId, async () => {
      setError("");
      const current = tasksRef.current.find((task) => task.id === taskId);
      if (!current) return null;
      const placeholders: QueuedCopy[] = Array.from({ length: copies.count }, (_, index) => ({
        id: `pending-${receipt.id}-${index}`, taskId, queuePosition: 0, internalReference: `${copies.reference}…`,
        targetPrice: copies.prices[index] ?? null, conditionId: null, conditionName: null, conditionDescription: "",
        releaseDelaySeconds: copies.releaseDelaySeconds ?? null, needsApproval: Boolean(copies.needsApproval), grade: null,
        status: "queued", photos: [], createdAt: new Date().toISOString(),
      }));
      const anchorIndex = copies.afterCopyId ? current.queuedCopies.findIndex((copy) => copy.id === copies.afterCopyId) : -1;
      const at = anchorIndex >= 0 ? anchorIndex + 1 : current.queuedCopies.length;
      const optimistic = [...current.queuedCopies.slice(0, at), ...placeholders, ...current.queuedCopies.slice(at)];
      replaceTask({ ...current, queuedCopies: optimistic, queuedCopy: optimistic[0] ?? null });
      try {
        const form = new FormData();
        form.set("requestId", receipt.id);
        form.set("itemId", current.itemId);
        form.set("variationKey", current.variationKey ?? "");
        form.set("internalReference", copies.reference);
        form.set("count", String(copies.count));
        form.set("startIndex", String(receipt.startIndex));
        form.set("prices", JSON.stringify(copies.prices.map((price) => price === null ? null : price.toFixed(2))));
        if (copies.afterCopyId) form.set("afterCopyId", copies.afterCopyId);
        if (copies.releaseDelaySeconds !== undefined && copies.releaseDelaySeconds !== null) form.set("releaseDelaySeconds", String(copies.releaseDelaySeconds));
        if (copies.needsApproval) form.set("needsApproval", "true");
        const response = await fetch(`/api/tasks/${taskId}/copies`, { method: "POST", body: form });
        const payload = await response.json() as { task?: RestockTask; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "Could not add copies");
        replaceTask(payload.task);
        intakeRequests.current.delete(receipt.key);
        return payload.task;
      } catch (caught) {
        replaceTask(current);
        setError(caught instanceof Error ? caught.message : "Could not add copies");
        await reload(taskId).catch(() => undefined);
        return null;
      }
    });
  }

  function addDistinct(taskId: string, copy: DistinctCopy): Promise<RestockTask | null> {
    const receipt = intakeRequest(taskId, "distinct", { ...copy, files: copy.files.map((file) => [file.name, file.size, file.type, file.lastModified]) });
    return serializeTask(taskId, async () => {
      setError("");
      const current = tasksRef.current.find((task) => task.id === taskId);
      if (!current) return null;
      try {
        const form = new FormData();
        form.set("requestId", receipt.id);
        form.set("itemId", current.itemId);
        form.set("variationKey", current.variationKey ?? "");
        form.set("internalReference", copy.reference);
        form.set("conditionDescription", copy.note);
        form.set("targetPrice", copy.price.trim());
        if (copy.grade) form.set("grade", copy.grade);
        if (copy.releaseDelaySeconds !== undefined && copy.releaseDelaySeconds !== null) form.set("releaseDelaySeconds", String(copy.releaseDelaySeconds));
        if (copy.needsApproval) form.set("needsApproval", "true");
        copy.files.forEach((file) => form.append("photos", file));
        const response = await fetch(`/api/tasks/${taskId}/copies`, { method: "POST", body: form });
        const payload = await response.json() as { task?: RestockTask; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "Could not add the copy");
        flushSync(() => replaceTask(payload.task!));
        intakeRequests.current.delete(receipt.key);
        showToast("Added to the line");
        return payload.task;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not add the copy");
        await reload(taskId).catch(() => undefined);
        return null;
      }
    });
  }

  function approve(taskId: string): Promise<boolean> {
    return serializeTask(taskId, async () => {
      setError("");
      try {
        const response = await fetch(`/api/tasks/${taskId}/approve`, { method: "POST" });
        const payload = await response.json() as { error?: string; result?: WorkerResult; task?: RestockTask };
        if (!response.ok || payload.error) throw new Error(payload.error || "Could not approve");
        if (payload.task) replaceTask(payload.task);
        await reload(taskId);
        showToast(payload.result?.message ?? "Approved. Waiting for the next check.");
        if (window.location.search.includes("approve=")) window.history.replaceState(null, "", "/tool");
        return true;
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not approve");
        await reload(taskId).catch(() => undefined);
        return false;
      }
    });
  }

  function taskAction(taskId: string, action: "pause" | "resume" | "sold" | "retry", copyId?: string): Promise<boolean> {
    const runId = tasksRef.current.find((task) => task.id === taskId)?.pendingHandoff?.id;
    return serializeTask(taskId, async () => {
      setError("");
      try {
        const response = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, runId, copyId, reviewed: action === "sold" || action === "retry" }) });
        const payload = await response.json() as { task?: RestockTask; error?: string };
        if (!response.ok || !payload.task) throw new Error(payload.error || "Could not update the task");
        replaceTask(payload.task);
        showToast(action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Review saved");
        return true;
      } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update the task"); return false; }
    });
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
              {profile ? <><Check size={11} /> eBay connected</> : status?.ebayConfigured ? "Credentials saved" : "Connect in Settings"}
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
          {(error || refreshError) && <div className="tool-error-banner"><AlertTriangle size={17} /> {error || refreshError}</div>}
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
              busy={busyTaskIds.has(openTaskData.id)}
              actions={{
                onBack: () => openTask(null),
                onCheck: () => void checkTask(openTaskData.id),
                onApprove: () => approve(openTaskData.id),
                onTaskAction: (action, copyId) => taskAction(openTaskData.id, action, copyId),
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

  const lookupController = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const submittingRef = useRef(false);
  const submission = useRef<{ key: string; id: string } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; lookupController.current?.abort(); };
  }, []);

  const syncListing = useCallback(async () => {
    lookupController.current?.abort();
    const controller = new AbortController();
    lookupController.current = controller;
    setLoadingListing(true);
    setBuilderError("");
    try {
      const response = await fetch(`/api/ebay/listings?itemId=${encodeURIComponent(itemId)}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { listing?: ListingSnapshot; error?: string };
      if (controller.signal.aborted || !alive.current) return;
      if (!response.ok || !payload.listing || payload.listing.itemId !== itemId) throw new Error(payload.error || "Couldn't find that listing");
      setListing(payload.listing);
      setVariationKey(null);
    } catch (caught) {
      if (!controller.signal.aborted && alive.current) setBuilderError(caught instanceof Error ? caught.message : "Couldn't find that listing");
    } finally {
      if (!controller.signal.aborted && alive.current) setLoadingListing(false);
    }
  }, [itemId]);

  useEffect(() => {
    if (itemId) void syncListing();
  }, []); // Look the prefilled listing up once when this opens.

  async function start() {
    if (submittingRef.current) return;
    setBuilderError("");
    if (!listing || listing.itemId !== itemId || !listing.supported) {
      setBuilderError(listing?.unsupportedReasons.join(". ") || "Look up a listing first");
      return;
    }
    if (listing.variations.length && !variationKey) {
      setBuilderError("Choose which option this is for");
      return;
    }
    const key = JSON.stringify([listing.itemId, variationKey]);
    if (submission.current?.key !== key) submission.current = { key, id: crypto.randomUUID() };
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.set("requestId", submission.current.id);
      form.set("itemId", listing.itemId);
      form.set("startEmpty", "true");
      if (variationKey) form.set("variationKey", variationKey);
      const response = await fetch("/api/tasks", { method: "POST", body: form });
      const payload = await response.json() as { task?: RestockTask; error?: string };
      if (!response.ok || !payload.task) throw new Error(payload.error || "Couldn't add the listing");
      if (alive.current) await onCreated(payload.task);
    } catch (caught) {
      if (alive.current) setBuilderError(caught instanceof Error ? caught.message : "Couldn't add the listing");
    } finally {
      submittingRef.current = false;
      if (alive.current) setSubmitting(false);
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
          onItemId={(value) => { lookupController.current?.abort(); setLoadingListing(false); setItemId(value); setListing(null); setVariationKey(null); }}
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
      <h2>Which listing are you restocking?</h2>
      <p>Paste its eBay item number and sync. If it has variations, pick the one you&apos;re restocking.</p>
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
        setVisibleKeys(valid);
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
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the local view usable if storage is unavailable. */ }
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

const ALERT_OPTIONS: Array<{ key: keyof DiscordAlerts; label: string; detail: string }> = [
  { key: "sales", label: "Sales", detail: "Something sold and the next copy is lined up." },
  { key: "restocks", label: "Restocks", detail: "The next copy went up on eBay." },
  { key: "needsYou", label: "Needs you", detail: "Waiting for your OK, out of copies, or something failed." },
];

function SettingsView({ status, onSaved }: { status: SystemStatus | null; onSaved: () => Promise<void> }) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function saveAlerts(alerts: Partial<DiscordAlerts>) {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/discord", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "alerts", alerts }) });
      if (!response.ok) throw new Error("Could not save alert settings.");
      await onSaved();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save alert settings.");
    } finally {
      setBusy(false);
    }
  }

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
      setNotice(payload.warning ?? { connect: "Webhook and avatar saved.", disconnect: "Discord alerts disconnected.", test: "Connection test sent to Discord.", preview: "Every alert type sent as a preview, using one of your listings." }[action]);
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
            <strong>{status?.ebayConfigured ? "eBay credentials saved" : "eBay not connected"}</strong>
            <small>{status?.ebayConfigured ? (status.liveWritesAuthorized || status.writeMode === "dry-run" ? "Credentials are configured. Sync a listing to verify access." : "Credentials are configured; listing updates still need authorization.") : "Add your eBay developer keys to .env.local, then restart Next."}</small>
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
          <span className={`settings-on ${status?.worker?.state === "running" && Date.now() - new Date(status.worker.heartbeatAt).getTime() < Math.max(90, status.pollSeconds * 3) * 1000 ? "" : "is-warning"}`}>{status?.worker?.state === "running" && Date.now() - new Date(status.worker.heartbeatAt).getTime() < Math.max(90, status.pollSeconds * 3) * 1000 ? "Running" : "Not running"}</span>
        </div>
        <div>
          <HardDrive size={21} />
          <span><strong>Photos and history</strong><small className="settings-path">Saved on this computer{status?.storagePath ? ` · ${status.storagePath}` : ""}</small></span>
          <span className="settings-on">{status?.persistentStorage ? "Saved" : "Temporary"}</span>
        </div>
      </div>
      <section className="settings-discord" aria-labelledby="discord-heading">
        <header>
          <span><strong id="discord-heading">Discord</strong><small>Get a message when something sells, restocks, or needs your OK.</small></span>
          <span className={`settings-on ${status?.discordConnected ? "" : "is-off"}`}>{status?.discordConnected ? "Connected" : "Not set up"}</span>
        </header>
        {!status?.discordConnected && <ol className="settings-discord-steps">
          <li>In Discord, open Server Settings → Integrations → Webhooks and make a webhook for a channel. <a href="https://discord.new/GavFccHpQgcW" target="_blank" rel="noreferrer">Server template</a> if you want a fresh one.</li>
          <li>Copy its URL and paste it here. It stays on this computer.</li>
        </ol>}
        <div className="settings-discord-input">
          <input id="discord-webhook-url" aria-label="Discord webhook URL" type="password" autoComplete="off" spellCheck={false} value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder={status?.discordConnected ? "Connected · paste a new URL to replace it" : "https://discord.com/api/webhooks/…"} />
          <button type="button" disabled={busy || !webhookUrl.trim()} onClick={() => void discordAction("connect")}>{status?.discordConnected ? "Replace" : "Connect"}</button>
        </div>
        <fieldset className="settings-alerts" disabled={!status?.discordConnected || busy}>
          <legend>Send me</legend>
          {ALERT_OPTIONS.map((option) => (
            <label key={option.key}>
              <input type="checkbox" checked={status?.discordAlerts?.[option.key] ?? true} onChange={(event) => void saveAlerts({ [option.key]: event.target.checked })} />
              <span><strong>{option.label}</strong><small>{option.detail}</small></span>
            </label>
          ))}
        </fieldset>
        <p className="settings-discord-hint">
          Copies set to <b>When I say so</b> wait after a sale. The Discord message has a link that opens this listing so you can put the next one up. It points to <code>{status?.publicUrl ?? "http://127.0.0.1:3000"}</code>, so it only opens on this computer unless you set <code>NEXTINSTOCK_PUBLIC_URL</code>.
        </p>
        {status?.discordConnected && <div className="settings-discord-actions">
          <button type="button" disabled={busy} onClick={() => void discordAction("test")}>Send a test</button>
          <button type="button" disabled={busy} onClick={() => void discordAction("preview")}>Preview every alert</button>
          <button type="button" className="is-quiet" disabled={busy} onClick={() => void discordAction("disconnect")}>Disconnect</button>
        </div>}
        {notice && <p className="settings-discord-notice" role="status">{notice}</p>}
      </section>
    </>
  );
}
