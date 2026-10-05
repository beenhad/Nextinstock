"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Clock3,
  Copy as CopyIcon,
  GripVertical,
  Layers,
  LoaderCircle,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeRule, ladderPrices } from "@/lib/price-rule";
import type { PriceRule, QueuedCopy, RestockTask } from "@/lib/types";

export type QueueAction =
  | { action: "price"; targetPrice: string }
  | { action: "move"; direction: "up" | "down" }
  | { action: "details"; internalReference?: string; conditionDescription?: string }
  | { action: "remove" };

export type TaskPatch = {
  restockDelaySeconds?: number | null;
  priceRule?: PriceRule | null;
  order?: string[];
  prices?: Array<{ copyId: string; targetPrice: string | null }>;
};

export type IdenticalCopies = { count: number; reference: string; prices: Array<number | null> };

export const DELAY_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 15, label: "Right away" },
  { value: null, label: "After 1 minute" },
  { value: 300, label: "After 5 minutes" },
  { value: 900, label: "After 15 minutes" },
  { value: 3600, label: "After 1 hour" },
  { value: 21600, label: "After 6 hours" },
  { value: 86400, label: "Next day" },
];

function money(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function statusLabel(task: RestockTask) {
  if (task.status === "dry_run_ready") return "Test run ready";
  if (task.status === "scheduled") return "Restock scheduled";
  if (task.status === "processing") return "Restocking now";
  if (task.status === "attention") return "Needs a look";
  if (task.status === "error") return "Error";
  if (task.status === "paused") return "Paused";
  return "Watching";
}

function isLocked(task: RestockTask) {
  return task.status === "scheduled" || task.status === "processing";
}

/** The live price this task restocks from (variation price for variation tasks). */
export function livePrice(task: RestockTask): number | null {
  const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
  return variation?.price ?? task.listing.price;
}

function Thumb({ src, alt, className = "" }: { src?: string | null; alt: string; className?: string }) {
  if (!src) return <span className={`rb-thumb rb-thumb-empty ${className}`} aria-hidden="true"><Camera size={18} /></span>;
  return <img className={`rb-thumb ${className}`} src={src} alt={alt} draggable={false} />;
}

export function RestockBoard({
  tasks, busyTaskId, onCheck, onQueueAction, onTaskPatch, onAddIdentical, onAddDistinct, onTrackOption,
}: {
  tasks: RestockTask[];
  busyTaskId: string | null;
  onCheck: (taskId: string) => void;
  onQueueAction: (taskId: string, copyId: string, body: QueueAction) => Promise<boolean>;
  onTaskPatch: (taskId: string, patch: TaskPatch) => Promise<boolean>;
  onAddIdentical: (taskId: string, copies: IdenticalCopies) => Promise<boolean>;
  onAddDistinct: (task: RestockTask) => void;
  onTrackOption: (task: RestockTask) => void;
}) {
  const [editing, setEditing] = useState<{ taskId: string; copyId: string } | null>(null);
  const editingTask = editing ? tasks.find((task) => task.id === editing.taskId) : null;
  const editingIndex = editingTask?.queuedCopies.findIndex((copy) => copy.id === editing?.copyId) ?? -1;
  const editingCopy = editingTask && editingIndex >= 0 ? editingTask.queuedCopies[editingIndex] : null;
  useEffect(() => { if (editing && !editingCopy) setEditing(null); }, [editing, editingCopy]);

  return <div className="rb-list">
    {tasks.map((task) => <ListingCard
      key={task.id}
      task={task}
      busy={busyTaskId === task.id}
      onCheck={() => onCheck(task.id)}
      onQueueAction={(copyId, body) => onQueueAction(task.id, copyId, body)}
      onTaskPatch={(patch) => onTaskPatch(task.id, patch)}
      onAddIdentical={(copies) => onAddIdentical(task.id, copies)}
      onAddDistinct={() => onAddDistinct(task)}
      onTrackOption={() => onTrackOption(task)}
      onEdit={(copyId) => setEditing({ taskId: task.id, copyId })}
      editingCopyId={editing?.taskId === task.id ? editing.copyId : null}
    />)}
    {editingTask && editingCopy && <CopySheet
      key={editingCopy.id}
      task={editingTask}
      copy={editingCopy}
      index={editingIndex}
      onClose={() => setEditing(null)}
      onAction={(body) => onQueueAction(editingTask.id, editingCopy.id, body)}
    />}
  </div>;
}

function ListingCard({
  task, busy, onCheck, onQueueAction, onTaskPatch, onAddIdentical, onAddDistinct, onTrackOption, onEdit, editingCopyId,
}: {
  task: RestockTask;
  busy: boolean;
  onCheck: () => void;
  onQueueAction: (copyId: string, body: QueueAction) => Promise<boolean>;
  onTaskPatch: (patch: TaskPatch) => Promise<boolean>;
  onAddIdentical: (copies: IdenticalCopies) => Promise<boolean>;
  onAddDistinct: () => void;
  onTrackOption: () => void;
  onEdit: (copyId: string) => void;
  editingCopyId: string | null;
}) {
  const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
  const currency = variation?.currency ?? task.listing.currency;
  const live = livePrice(task);
  const locked = isLocked(task) || busy;
  const count = task.queuedCopies.length;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"" | "price" | "add">("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => task.queuedCopies.map((copy) => copy.id), [task.queuedCopies]);
  const activeCopy = task.queuedCopies.find((copy) => copy.id === activeId) ?? null;
  const delay = DELAY_OPTIONS.find((option) => option.value === task.restockDelaySeconds) ?? DELAY_OPTIONS[1];

  function dragStart(event: DragStartEvent) { setActiveId(String(event.active.id)); }
  function dragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const order = [...ids];
    order.splice(to, 0, ...order.splice(from, 1));
    void onTaskPatch({ order });
  }

  return <article className={`rb-card ${locked ? "is-locked" : ""}`}>
    <header className="rb-head">
      <Thumb src={variation?.imageUrls[0] ?? task.listing.imageUrls[0]} alt="" className="rb-head-thumb" />
      <div className="rb-head-copy">
        <strong title={task.listing.title}>{task.listing.title}</strong>
        <span className="rb-head-meta">
          {variation && <em className="rb-chip">{variation.label.replace(/^[^:]+:\s*/, "")}</em>}
          <span>#{task.itemId}</span>
          <span>{money(live, currency)} live</span>
          <span>{variation?.quantityAvailable ?? task.listing.quantityAvailable} available · {variation?.quantitySold ?? task.listing.quantitySold} sold</span>
        </span>
      </div>
      <span className={`rb-status status-${task.status}`}><i aria-hidden="true" />{statusLabel(task)}</span>
      <button type="button" className="rb-icon-button" onClick={onCheck} disabled={busy} aria-label="Check eBay now" title="Check eBay now">
        <RefreshCw size={16} className={busy ? "spin" : ""} />
      </button>
    </header>

    <div className="rb-controls">
      <div className="rb-count" aria-live="polite">
        <Layers size={15} aria-hidden="true" />
        <strong>{count}</strong> queued
        <span>{count === 0 ? "Next sale leaves it sold out" : `covers the next ${count} ${count === 1 ? "sale" : "sales"}`}</span>
      </div>
      <div className="rb-control-buttons">
        <button type="button" className={`rb-pill ${panel === "price" ? "is-open" : ""}`} onClick={() => setPanel(panel === "price" ? "" : "price")} aria-expanded={panel === "price"}>
          <TrendingUp size={14} aria-hidden="true" /> {describeRule(task.priceRule)}
        </button>
        <label className="rb-pill rb-select">
          <Clock3 size={14} aria-hidden="true" />
          <span className="sr-only">Restock timing</span>
          <select value={String(delay.value)} onChange={(event) => {
            const value = event.target.value === "null" ? null : Number(event.target.value);
            void onTaskPatch({ restockDelaySeconds: value });
          }}>
            {DELAY_OPTIONS.map((option) => <option key={String(option.value)} value={String(option.value)}>Restock {option.label.toLowerCase()}</option>)}
          </select>
        </label>
      </div>
    </div>

    {panel === "price" && <PricePanel task={task} currency={currency} onClose={() => setPanel("")} onSave={async (patch) => { if (await onTaskPatch(patch)) setPanel(""); }} />}
    {locked && <p className="rb-locked"><Lock size={13} aria-hidden="true" /> A restock is running. The queue unlocks when it finishes.</p>}

    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={dragStart} onDragEnd={dragEnd} onDragCancel={() => setActiveId(null)}>
      <ol className="rb-rail" aria-label={`Queue for ${task.listing.title}`}>
        <li className="rb-live">
          <div className="rb-tile-media">
            <Thumb src={variation?.imageUrls[0] ?? task.listing.imageUrls[0]} alt="Live listing photo" />
            <span className="rb-badge rb-badge-live">On eBay now</span>
          </div>
          <div className="rb-tile-body">
            <strong>Live listing</strong>
            <span className="rb-price-static">{money(live, currency)}</span>
          </div>
        </li>
        <li className="rb-arrow" aria-hidden="true"><ArrowRight size={16} /></li>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy} disabled={locked}>
          {task.queuedCopies.map((copy, index) => <SortableTile
            key={copy.id}
            copy={copy}
            index={index}
            task={task}
            currency={currency}
            locked={locked}
            selected={editingCopyId === copy.id}
            onEdit={() => onEdit(copy.id)}
            onPrice={(price) => onQueueAction(copy.id, { action: "price", targetPrice: price })}
          />)}
        </SortableContext>
        <li className="rb-add-wrap">
          <button type="button" className={`rb-add ${panel === "add" ? "is-open" : ""}`} onClick={() => setPanel(panel === "add" ? "" : "add")} disabled={locked} aria-expanded={panel === "add"}>
            <Plus size={20} aria-hidden="true" />
            <span>Add copies</span>
          </button>
        </li>
      </ol>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
        {activeCopy ? <TileFace copy={activeCopy} index={ids.indexOf(activeCopy.id)} task={task} currency={currency} lifted /> : null}
      </DragOverlay>
    </DndContext>

    {panel === "add" && <AddPanel
      task={task}
      currency={currency}
      onClose={() => setPanel("")}
      onAddDistinct={() => { setPanel(""); onAddDistinct(); }}
      onAddIdentical={async (copies) => { if (await onAddIdentical(copies)) setPanel(""); }}
    />}

    {task.lastError && <p className="rb-error"><AlertTriangle size={14} aria-hidden="true" /> {task.lastError}</p>}
    {task.listing.variations.length > 1 && <button type="button" className="rb-text-button" onClick={onTrackOption}>
      This listing has {task.listing.variations.length} options. Track another one <ArrowRight size={13} aria-hidden="true" />
    </button>}
  </article>;
}

function TileFace({ copy, index, task, currency, lifted = false, children }: {
  copy: QueuedCopy; index: number; task: RestockTask; currency: string; lifted?: boolean; children?: ReactNode;
}) {
  const reuses = copy.photos.length === 0;
  const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
  const photo = copy.photos[0]?.url ?? variation?.imageUrls[0] ?? task.listing.imageUrls[0];
  return <div className={`rb-tile-face ${lifted ? "is-lifted" : ""}`}>
    <div className="rb-tile-media">
      <Thumb src={photo} alt={reuses ? "Uses the live listing photos" : `${copy.internalReference} photo`} className={reuses ? "is-reused" : ""} />
      <span className={`rb-badge ${index === 0 ? "rb-badge-next" : ""}`}>{index === 0 ? "Next" : `#${index + 1}`}</span>
      {reuses ? <span className="rb-media-note"><CopyIcon size={11} aria-hidden="true" /> Same photos</span>
        : copy.photos.length > 1 ? <span className="rb-media-note"><Camera size={11} aria-hidden="true" /> {copy.photos.length}</span> : null}
    </div>
    <div className="rb-tile-body">
      <strong title={copy.internalReference}>{copy.internalReference}</strong>
      {children ?? <span className="rb-price-static">{copy.targetPrice === null ? <em>Live price</em> : money(copy.targetPrice, currency)}</span>}
      <small title={copy.conditionDescription}>{copy.conditionDescription || (reuses ? "Same as listing" : "No note")}</small>
    </div>
  </div>;
}

function SortableTile({ copy, index, task, currency, locked, selected, onEdit, onPrice }: {
  copy: QueuedCopy; index: number; task: RestockTask; currency: string; locked: boolean; selected: boolean;
  onEdit: () => void; onPrice: (price: string) => Promise<boolean>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: copy.id, disabled: locked });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return <li ref={setNodeRef} style={style} className={`rb-tile ${isDragging ? "is-placeholder" : ""} ${selected ? "is-selected" : ""}`}>
    <TileFace copy={copy} index={index} task={task} currency={currency}>
      <InlinePrice value={copy.targetPrice} currency={currency} disabled={locked} onCommit={onPrice} />
    </TileFace>
    <div className="rb-tile-actions">
      <button type="button" className="rb-grip" aria-label={`Drag ${copy.internalReference} to reorder`} disabled={locked} {...attributes} {...listeners}><GripVertical size={14} /></button>
      <button type="button" className="rb-edit" onClick={onEdit} aria-label={`Edit ${copy.internalReference}`}>Edit</button>
    </div>
  </li>;
}

function InlinePrice({ value, currency, disabled, onCommit }: {
  value: number | null; currency: string; disabled: boolean; onCommit: (price: string) => Promise<boolean>;
}) {
  const saved = value === null ? "" : value.toFixed(2);
  const [draft, setDraft] = useState(saved);
  const [flash, setFlash] = useState<"" | "ok" | "bad">("");
  useEffect(() => setDraft(saved), [saved]);
  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === saved) return;
    const number = Number(trimmed);
    if (trimmed && (!Number.isFinite(number) || number <= 0)) { setDraft(saved); setFlash("bad"); return; }
    const normalized = trimmed ? number.toFixed(2) : "";
    setDraft(normalized);
    setFlash((await onCommit(normalized)) ? "ok" : "bad");
    window.setTimeout(() => setFlash(""), 1200);
  }
  return <label className={`rb-inline-price ${flash ? `is-${flash}` : ""}`} onPointerDown={(event) => event.stopPropagation()}>
    <span aria-hidden="true">{currency === "USD" ? "$" : currency}</span>
    <input
      inputMode="decimal"
      aria-label="Restock price"
      placeholder="Live"
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { setDraft(saved); event.currentTarget.blur(); }
      }}
    />
    {flash === "ok" && <Check size={12} className="rb-inline-ok" aria-label="Saved" />}
  </label>;
}

export function RuleFields({ rule, onRule, currency }: { rule: PriceRule; onRule: (rule: PriceRule) => void; currency: string }) {
  return <div className="rb-rule-fields">
    <div className="rb-segment" role="radiogroup" aria-label="Change price by">
      <button type="button" role="radio" aria-checked={rule.mode === "amount"} className={rule.mode === "amount" ? "is-on" : ""} onClick={() => onRule({ ...rule, mode: "amount" })}>{currency === "USD" ? "$" : currency} amount</button>
      <button type="button" role="radio" aria-checked={rule.mode === "percent"} className={rule.mode === "percent" ? "is-on" : ""} onClick={() => onRule({ ...rule, mode: "percent" })}>% percent</button>
    </div>
    <label className="rb-field">
      <span>Change each sale</span>
      <span className="rb-stepper">
        <button type="button" aria-label="Decrease step" onClick={() => onRule({ ...rule, step: Math.round((rule.step - (rule.mode === "amount" ? 0.5 : 1)) * 100) / 100 })}><Minus size={13} /></button>
        <input inputMode="decimal" value={String(rule.step)} onChange={(event) => { const next = Number(event.target.value); if (event.target.value === "-" || event.target.value === "") return onRule({ ...rule, step: 0 }); if (Number.isFinite(next)) onRule({ ...rule, step: next }); }} aria-label="Change per sale" />
        <button type="button" aria-label="Increase step" onClick={() => onRule({ ...rule, step: Math.round((rule.step + (rule.mode === "amount" ? 0.5 : 1)) * 100) / 100 })}><Plus size={13} /></button>
      </span>
    </label>
    <label className="rb-field">
      <span>Stop at (optional)</span>
      <span className="rb-money-input">
        <em>$</em>
        <input inputMode="decimal" placeholder="No limit" value={rule.cap === null ? "" : String(rule.cap)} onChange={(event) => { const raw = event.target.value.replace(/[^0-9.]/g, ""); onRule({ ...rule, cap: raw ? Number(raw) : null }); }} aria-label="Price limit" />
      </span>
    </label>
  </div>;
}

export function LadderPreview({ base, prices, currency }: { base: number | null; prices: number[]; currency: string }) {
  if (!prices.length) return null;
  const shown = prices.slice(0, 8);
  return <div className="rb-ladder" aria-label="Price preview">
    {base !== null && <span className="rb-ladder-step is-live"><small>Now</small>{money(base, currency)}</span>}
    {shown.map((price, index) => <span className="rb-ladder-step" key={index} style={{ animationDelay: `${index * 30}ms` }}><small>{index === 0 ? "Next" : `#${index + 1}`}</small>{money(price, currency)}</span>)}
    {prices.length > shown.length && <span className="rb-ladder-more">+{prices.length - shown.length} more</span>}
  </div>;
}

function PricePanel({ task, currency, onClose, onSave }: {
  task: RestockTask; currency: string; onClose: () => void; onSave: (patch: TaskPatch) => Promise<void>;
}) {
  const [rule, setRule] = useState<PriceRule>(task.priceRule ?? { mode: "amount", step: 0, cap: null });
  const [saving, setSaving] = useState(false);
  const base = livePrice(task);
  const prices = base === null ? [] : ladderPrices(base, rule, task.queuedCopies.length);
  async function save(reprice: boolean) {
    setSaving(true);
    const cleanRule = rule.step === 0 ? null : rule;
    await onSave({
      priceRule: cleanRule,
      ...(reprice ? { prices: task.queuedCopies.map((copy, index) => ({ copyId: copy.id, targetPrice: cleanRule ? prices[index].toFixed(2) : null })) } : {}),
    });
    setSaving(false);
  }
  return <section className="rb-panel" aria-label="Price per sale">
    <div className="rb-panel-head"><strong>Price per sale</strong><button type="button" className="rb-icon-button" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
    <p>Raise or lower the price a little with every restock. Starts from the live price of {money(base, currency)}.</p>
    <RuleFields rule={rule} onRule={setRule} currency={currency} />
    <LadderPreview base={base} prices={prices} currency={currency} />
    <div className="rb-panel-actions">
      <button type="button" className="rb-secondary" onClick={() => void save(false)} disabled={saving}>Save for new copies</button>
      <button type="button" className="rb-primary" onClick={() => void save(true)} disabled={saving || !task.queuedCopies.length || isLocked(task)}>
        {saving ? <LoaderCircle size={14} className="spin" /> : <Tag size={14} />} Reprice {task.queuedCopies.length} queued
      </button>
    </div>
  </section>;
}

function AddPanel({ task, currency, onClose, onAddDistinct, onAddIdentical }: {
  task: RestockTask; currency: string; onClose: () => void; onAddDistinct: () => void;
  onAddIdentical: (copies: IdenticalCopies) => Promise<void>;
}) {
  const [count, setCount] = useState(3);
  const [reference, setReference] = useState(() => {
    const last = task.queuedCopies.at(-1)?.internalReference ?? "";
    return last.replace(/-\d+$/, "") || "COPY";
  });
  const [usePriceRule, setUsePriceRule] = useState(Boolean(task.priceRule));
  const [saving, setSaving] = useState(false);
  const lastPrice = task.queuedCopies.at(-1)?.targetPrice ?? livePrice(task);
  const prices = usePriceRule && task.priceRule && lastPrice !== null ? ladderPrices(lastPrice, task.priceRule, count) : [];
  const isVariation = Boolean(task.variationKey);
  async function add() {
    setSaving(true);
    await onAddIdentical({ count, reference: reference.trim() || "COPY", prices: prices.length ? prices : Array.from({ length: count }, () => null) });
    setSaving(false);
  }
  return <section className="rb-panel rb-add-panel" aria-label="Add copies">
    <div className="rb-panel-head"><strong>Add copies</strong><button type="button" className="rb-icon-button" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
    <div className="rb-add-options">
      {!isVariation && <button type="button" className="rb-add-option" onClick={onAddDistinct}>
        <span className="rb-add-icon"><Camera size={18} /></span>
        <span><strong>A copy with its own photos</strong><small>Different condition, different photos. Buyers see exactly this one.</small></span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>}
      <div className="rb-add-option is-form">
        <span className="rb-add-icon"><CopyIcon size={18} /></span>
        <div className="rb-identical">
          <span><strong>Identical copies</strong><small>{isVariation ? "Each sale puts one more of this option back up." : "Keep the listing photos and note. Only the price can change."}</small></span>
          <div className="rb-identical-row">
            <label className="rb-field">
              <span>How many</span>
              <span className="rb-stepper">
                <button type="button" aria-label="Fewer" onClick={() => setCount((value) => Math.max(1, value - 1))}><Minus size={13} /></button>
                <input inputMode="numeric" value={count} onChange={(event) => setCount(Math.max(1, Math.min(50, Number(event.target.value.replace(/\D/g, "")) || 1)))} aria-label="Number of copies" />
                <button type="button" aria-label="More" onClick={() => setCount((value) => Math.min(50, value + 1))}><Plus size={13} /></button>
              </span>
            </label>
            <label className="rb-field rb-field-grow">
              <span>Label</span>
              <input className="rb-text-input" value={reference} maxLength={90} onChange={(event) => setReference(event.target.value)} />
            </label>
          </div>
          {task.priceRule && <label className="rb-check">
            <input type="checkbox" checked={usePriceRule} onChange={(event) => setUsePriceRule(event.target.checked)} />
            <span>Follow the price rule ({describeRule(task.priceRule)})</span>
          </label>}
          {prices.length > 0 ? <LadderPreview base={null} prices={prices} currency={currency} />
            : <p className="rb-hint">Each one restocks at {lastPrice === null ? "the live price" : `the live price (${money(livePrice(task), currency)} now)`}.</p>}
          <button type="button" className="rb-primary" onClick={() => void add()} disabled={saving}>
            {saving ? <LoaderCircle size={14} className="spin" /> : <Plus size={14} />} Add {count} {count === 1 ? "copy" : "copies"}
          </button>
        </div>
      </div>
    </div>
  </section>;
}

function CopySheet({ task, copy, index, onClose, onAction }: {
  task: RestockTask; copy: QueuedCopy; index: number; onClose: () => void; onAction: (body: QueueAction) => Promise<boolean>;
}) {
  const [reference, setReference] = useState(copy.internalReference);
  const [note, setNote] = useState(copy.conditionDescription);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const locked = isLocked(task) || copy.status !== "queued";
  const reuses = copy.photos.length === 0;
  const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
  const currency = variation?.currency ?? task.listing.currency;
  const count = task.queuedCopies.length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  async function save(body: QueueAction) {
    if (await onAction(body)) {
      setSaved(true);
      window.clearTimeout(savedTimer.current);
      savedTimer.current = window.setTimeout(() => setSaved(false), 1400);
    }
  }

  return <>
    <div className="rb-sheet-scrim" onClick={onClose} aria-hidden="true" />
    <aside className="rb-sheet" role="dialog" aria-modal="true" aria-label={`Edit ${copy.internalReference}`}>
      <header className="rb-sheet-head">
        <span className={`rb-badge ${index === 0 ? "rb-badge-next" : ""}`}>{index === 0 ? "Sells next" : `#${index + 1} in line`}</span>
        <span className={`rb-saved ${saved ? "is-visible" : ""}`} aria-live="polite">{saved && <><Check size={12} /> Saved</>}</span>
        <button type="button" className="rb-icon-button" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </header>
      <div className="rb-sheet-body">
        <div className="rb-sheet-photos">
          {reuses
            ? <div className="rb-sheet-reuse"><Thumb src={variation?.imageUrls[0] ?? task.listing.imageUrls[0]} alt="Live listing photo" /><span><CopyIcon size={13} aria-hidden="true" /> Uses the live listing photos</span></div>
            : copy.photos.map((photo) => <Thumb key={photo.id} src={photo.url} alt={`${copy.internalReference} photo ${photo.position + 1}`} />)}
        </div>
        <label className="rb-field">
          <span>Label</span>
          <input className="rb-text-input" value={reference} maxLength={100} disabled={locked}
            onChange={(event) => setReference(event.target.value)}
            onBlur={() => { const value = reference.trim(); if (!value) setReference(copy.internalReference); else if (value !== copy.internalReference) void save({ action: "details", internalReference: value }); }} />
        </label>
        <label className="rb-field">
          <span>{reuses ? "Condition note (leave blank to keep the listing's)" : "Condition note"}</span>
          <textarea className="rb-text-input" rows={3} value={note} maxLength={1000} disabled={locked}
            placeholder={reuses ? task.listing.conditionDescription ?? "" : "Describe this exact copy"}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => { const value = note.trim(); if (value === copy.conditionDescription) return; if (!reuses && !task.variationKey && !value) { setNote(copy.conditionDescription); return; } void save({ action: "details", conditionDescription: value }); }} />
        </label>
        <div className="rb-field">
          <span>Restock price</span>
          <InlinePrice value={copy.targetPrice} currency={currency} disabled={locked} onCommit={async (price) => { const ok = await onAction({ action: "price", targetPrice: price }); if (ok) { setSaved(true); window.setTimeout(() => setSaved(false), 1400); } return ok; }} />
          <small className="rb-hint">Leave blank to keep whatever the listing costs when it sells. Live now: {money(livePrice(task), currency)}.</small>
        </div>
        <div className="rb-field">
          <span>Position</span>
          <div className="rb-sheet-move">
            <button type="button" className="rb-secondary" disabled={locked || index === 0} onClick={() => void onAction({ action: "move", direction: "up" })}><ArrowLeft size={14} /> Earlier</button>
            <span>{index + 1} of {count}</span>
            <button type="button" className="rb-secondary" disabled={locked || index === count - 1} onClick={() => void onAction({ action: "move", direction: "down" })}>Later <ArrowRight size={14} /></button>
          </div>
        </div>
      </div>
      <footer className="rb-sheet-foot">
        {confirmRemove
          ? <><span>Remove this copy from the queue?</span><button type="button" className="rb-secondary" onClick={() => setConfirmRemove(false)}>Keep</button><button type="button" className="rb-danger" onClick={() => { void onAction({ action: "remove" }); onClose(); }}>Remove</button></>
          : <button type="button" className="rb-text-button is-danger" disabled={locked} onClick={() => setConfirmRemove(true)}><Trash2 size={14} /> Remove from queue</button>}
      </footer>
    </aside>
  </>;
}
