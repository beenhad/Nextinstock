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
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, Camera, Check, ImagePlus, LoaderCircle, Minus, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type DragEvent as ReactDragEvent, type ReactNode,
} from "react";
import type { CopyGrade, QueuedCopy, RestockTask } from "@/lib/types";
import {
  GRADES, WAIT_OPTIONS, waitLabel,
  type DistinctCopy, type IdenticalCopies, type QueueAction, type TaskPatch,
} from "./tool-actions";

const MAX_COPIES = 25;

type Unit =
  | { kind: "copy"; id: string; copy: QueuedCopy; start: number }
  | { kind: "run"; id: string; copies: QueuedCopy[]; start: number };

type Selection =
  | { type: "unit"; id: string }
  | { type: "link"; copyId: string }
  | { type: "add" }
  | { type: "new" }
  | null;

export type ReleaseLineActions = {
  onBack: () => void;
  onCheck: () => void;
  onApprove: () => Promise<boolean>;
  onQueueAction: (copyId: string, body: QueueAction) => Promise<boolean>;
  onPatch: (patch: TaskPatch) => Promise<boolean>;
  onAddIdentical: (copies: IdenticalCopies) => Promise<RestockTask | null>;
  onAddDistinct: (copy: DistinctCopy) => Promise<RestockTask | null>;
};

function money(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: value % 1 === 0 && value >= 1000 ? 0 : 2 }).format(value);
}

function gradeMeta(grade: CopyGrade | null) {
  return GRADES.find((entry) => entry.value === grade) ?? null;
}

/** Copies with no photos of their own read as one stack, even a stack of one, so they can grow with +. */
function toUnits(copies: QueuedCopy[]): Unit[] {
  const units: Unit[] = [];
  copies.forEach((copy, index) => {
    const last = units.at(-1);
    if (copy.photos.length === 0) {
      if (last?.kind === "run") last.copies.push(copy);
      else units.push({ kind: "run", id: `run-${copy.id}`, copies: [copy], start: index });
      return;
    }
    units.push({ kind: "copy", id: copy.id, copy, start: index });
  });
  return units;
}

function unitCopies(unit: Unit): QueuedCopy[] {
  return unit.kind === "run" ? unit.copies : [unit.copy];
}

type Density = "lg" | "md" | "sm" | "xs";
const SIZES: Array<{ name: Density; tile: number; gap: number }> = [
  { name: "lg", tile: 112, gap: 64 },
  { name: "md", tile: 92, gap: 54 },
  { name: "sm", tile: 72, gap: 38 },
  { name: "xs", tile: 56, gap: 22 },
];

/** Biggest tiles that keep the whole line on one row; the smallest size wraps when even that won't fit. */
function densityFor(units: number, width: number): Density {
  if (!width) return units <= 4 ? "lg" : units <= 8 ? "md" : "sm";
  const items = units + 2;
  for (const size of SIZES) {
    const perItem = size.tile + 16 + size.gap;
    const perRow = Math.max(1, Math.floor((width - 16 + size.gap) / perItem));
    const rows = Math.ceil(items / perRow);
    // Big tiles only while everything fits on one row; small tiles may take two rows.
    if (rows <= (size.name === "sm" ? 2 : 1)) return size.name;
  }
  return "xs";
}

function timingOf(copy: QueuedCopy): { kind: "now" | "wait" | "ask"; label: string; short: string } {
  if (copy.needsApproval) return { kind: "ask", label: "ask me", short: "ask" };
  if (copy.releaseDelaySeconds !== null) return { kind: "wait", label: `wait ${waitLabel(copy.releaseDelaySeconds)}`, short: waitLabel(copy.releaseDelaySeconds) };
  return { kind: "now", label: "right away", short: "" };
}

function priceSpan(copies: QueuedCopy[], live: number | null, currency: string) {
  const prices = copies.map((copy) => copy.targetPrice ?? live).filter((price): price is number => price !== null);
  if (!prices.length) return "";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return low === high ? money(low, currency) : `${money(low, currency)}–${money(high, currency).replace(/^\$/, "")}`;
}

export function ReleaseLine({ task, busy, actions }: { task: RestockTask; busy: boolean; actions: ReleaseLineActions }) {
  const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
  const currency = variation?.currency ?? task.listing.currency;
  const live = variation?.price ?? task.listing.price;
  const livePhoto = variation?.imageUrls[0] ?? task.listing.imageUrls[0] ?? null;
  const copies = task.queuedCopies;
  const units = useMemo(() => toUnits(copies), [copies]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [lineWidth, setLineWidth] = useState(0);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const measure = () => {
      const styles = getComputedStyle(canvas);
      setLineWidth(canvas.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  const size = densityFor(units.length, lineWidth);
  const locked = task.status === "scheduled" || task.status === "processing";
  const full = copies.length >= MAX_COPIES;
  const isVariation = Boolean(task.variationKey);

  const [selection, setSelection] = useState<Selection>(() => (copies.length ? null : { type: "add" }));
  const lastUnit = useRef<Unit | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [caret, setCaret] = useState<number | null>(null);

  // Keep the selection valid as copies come and go (runs re-key when they grow from one copy).
  useEffect(() => {
    if (selection?.type === "unit" && !units.some((unit) => unit.id === selection.id)) {
      // A copy that joined (or left) a stack changes the stack's key; follow it.
      const bare = selection.id.replace(/^run-/, "");
      const home = units.find((unit) => unitCopies(unit).some((copy) => copy.id === bare))
        ?? units.find((unit) => lastUnit.current && unitCopies(lastUnit.current).some((gone) => unitCopies(unit).some((copy) => copy.id === gone.id)));
      if (home) setSelection({ type: "unit", id: home.id });
      else if (!lastUnit.current || !unitCopies(lastUnit.current).some((gone) => copies.some((copy) => copy.id === gone.id) || gone.id.startsWith("pending-"))) {
        // Everything it pointed at is gone (e.g. the last copy was removed).
        if (!copies.some((copy) => copy.id === bare || copy.id.startsWith("pending-"))) setSelection(copies.length ? null : { type: "add" });
      }
    }
    if (selection?.type === "link" && !copies.some((copy) => copy.id === selection.copyId)) setSelection(null);
  }, [units, copies, selection]);

  const selectedKey = selection?.type === "unit" ? `node-${selection.id}`
    : selection?.type === "link" ? `link-${selection.copyId}`
      : selection?.type === "add" || selection?.type === "new" ? "node-add" : null;

  const measureCaret = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedKey) { setCaret(null); return; }
    const target = canvas.querySelector<HTMLElement>(`[data-key="${selectedKey}"]`);
    if (!target) { setCaret(null); return; }
    const box = target.getBoundingClientRect();
    const frame = canvas.getBoundingClientRect();
    setCaret(Math.max(28, Math.min(frame.width - 28, box.left - frame.left + box.width / 2)));
  }, [selectedKey]);
  useLayoutEffect(() => { measureCaret(); }, [measureCaret, units, size]);
  useEffect(() => {
    window.addEventListener("resize", measureCaret);
    return () => window.removeEventListener("resize", measureCaret);
  }, [measureCaret]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function dragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = units.map((unit) => unit.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const moved = [...units];
    moved.splice(to, 0, ...moved.splice(from, 1));
    void actions.onPatch({ order: moved.flatMap((unit) => unitCopies(unit).map((copy) => copy.id)) });
  }

  const graded = copies.filter((copy) => copy.grade).length;
  function sortWorstToBest() {
    const rank = (copy: QueuedCopy) => (copy.grade ? GRADES.findIndex((entry) => entry.value === copy.grade) : 99);
    const order = [...copies].map((copy, index) => ({ copy, index }))
      .sort((a, b) => rank(a.copy) - rank(b.copy) || a.index - b.index)
      .map((entry) => entry.copy.id);
    if (order.join() !== copies.map((copy) => copy.id).join()) void actions.onPatch({ order });
  }

  const foundUnit = selection?.type === "unit" ? units.find((unit) => unit.id === selection.id) ?? null : null;
  if (foundUnit) lastUnit.current = foundUnit;
  const selectedUnit = selection?.type === "unit" ? foundUnit ?? lastUnit.current : null;
  const linkCopy = selection?.type === "link" ? copies.find((copy) => copy.id === selection.copyId) ?? null : null;
  const linkIndex = linkCopy ? copies.indexOf(linkCopy) : -1;
  const awaiting = task.status === "awaiting_approval";

  async function addSame(count: number, after?: QueuedCopy) {
    const base = after ?? copies.at(-1);
    const sameBase = base && base.photos.length === 0 ? base : null;
    const known = new Set(copies.map((copy) => copy.id));
    const created = await actions.onAddIdentical({
      count,
      reference: (sameBase?.internalReference.replace(/-\d+$/, "").replace(/…$/, "") || "SAME").slice(0, 80),
      prices: Array.from({ length: count }, () => sameBase?.targetPrice ?? null),
      releaseDelaySeconds: sameBase ? sameBase.releaseDelaySeconds : null,
      needsApproval: sameBase ? sameBase.needsApproval : false,
      afterCopyId: after?.id,
    });
    const focus = created?.queuedCopies.filter((copy) => !known.has(copy.id)).at(-1);
    if (focus) setSelection({ type: "unit", id: focus.id });
  }

  const summary = copies.length === 0
    ? "Nothing lined up yet. If this one sells now, the listing stays sold out."
    : `${copies.length} ${copies.length === 1 ? "copy" : "copies"} lined up. That covers the next ${copies.length} ${copies.length === 1 ? "sale" : "sales"}.`;

  return <section className="rl">
    <div className="rl-crumbs"><button type="button" className="rl-back" onClick={actions.onBack}><ArrowLeft size={16} aria-hidden="true" /> Listings</button></div>
    <header className="rl-head">
      {livePhoto ? <img src={livePhoto} alt="" /> : <span className="rl-head-blank" />}
      <div className="rl-head-copy">
        <h1>{task.listing.title}</h1>
        <p>
          {variation && <span className="rl-option">{variation.label.replace(/^[^:]+:\s*/, "")}</span>}
          <span><strong>{money(live, currency)}</strong> on eBay</span>
          <span>{variation?.quantityAvailable ?? task.listing.quantityAvailable} available</span>
          <span>{variation?.quantitySold ?? task.listing.quantitySold} sold</span>
        </p>
      </div>
      <ListingState task={task} />
      <button type="button" className="rl-icon" onClick={actions.onCheck} disabled={busy} title="Check eBay now" aria-label="Check eBay now">
        <RefreshCw size={17} className={busy ? "spin" : ""} />
      </button>
    </header>

    {awaiting && copies[0] && <ApproveBar copy={copies[0]} onApprove={actions.onApprove} />}
    {locked && <p className="rl-locked">A restock is running. You can edit again in a moment.</p>}

    <div className={`rl-canvas is-${size}`} ref={canvasRef}>
      <div className="rl-canvas-head">
        <div>
          <h2>Release line</h2>
          <p>{summary}</p>
        </div>
        {graded >= 2 && <button type="button" className="rl-quiet" onClick={sortWorstToBest} disabled={locked}>Sort worst to best</button>}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={(event) => setDragging(String(event.active.id))} onDragEnd={dragEnd} onDragCancel={() => setDragging(null)}>
        <ol className="rl-flow" aria-label="Release order, first to sell on the left">
          <li className="rl-item">
            <div className="rl-node is-live" data-key="node-live">
              <span className="rl-tile">{livePhoto ? <img src={livePhoto} alt="" draggable={false} /> : null}<span className="rl-flag">On eBay now</span></span>
              <span className="rl-price">{money(live, currency)}</span>
              <span className="rl-sub">Selling now</span>
            </div>
          </li>
          <SortableContext items={units.map((unit) => unit.id)} strategy={rectSortingStrategy} disabled={locked}>
            {units.map((unit) => {
              const first = unitCopies(unit)[0];
              return <SortableUnit
                key={unit.id}
                unit={unit}
                size={size}
                live={live}
                livePhoto={livePhoto}
                currency={currency}
                selected={selection?.type === "unit" && selection.id === unit.id}
                linkSelected={selection?.type === "link" && selection.copyId === first.id}
                locked={locked}
                onSelect={() => setSelection(selection?.type === "unit" && selection.id === unit.id ? null : { type: "unit", id: unit.id })}
                onSelectLink={() => setSelection(selection?.type === "link" && selection.copyId === first.id ? null : { type: "link", copyId: first.id })}
              />;
            })}
          </SortableContext>
          <li className="rl-item">
            <span className="rl-link is-plain" aria-hidden="true" />
            <button
              type="button"
              className={`rl-node is-add ${selection?.type === "add" || selection?.type === "new" ? "is-selected" : ""} ${copies.length === 0 ? "is-invite" : ""}`}
              data-key="node-add"
              disabled={full || locked}
              onClick={() => setSelection(selection?.type === "add" || selection?.type === "new" ? null : { type: "add" })}
              aria-expanded={selection?.type === "add" || selection?.type === "new"}
            >
              <span className="rl-tile"><Plus size={size === "xs" ? 18 : 28} strokeWidth={1.75} aria-hidden="true" /></span>
              <span className="rl-sub">{full ? `${MAX_COPIES} max` : copies.length === 0 ? "Add the next one" : "Add"}</span>
            </button>
          </li>
        </ol>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
          {dragging ? (() => {
            const unit = units.find((entry) => entry.id === dragging);
            return unit ? <div className={`rl-overlay is-${size}`}><NodeFace unit={unit} live={live} livePhoto={livePhoto} currency={currency} lifted /></div> : null;
          })() : null}
        </DragOverlay>
      </DndContext>

      {selection && <div className="rl-panel" style={{ "--caret": caret === null ? "-100px" : `${caret}px` } as CSSProperties}>
        <div className="rl-panel-body" key={selection.type === "unit" ? selection.id : selection.type === "link" ? `l-${selection.copyId}` : selection.type}>
          {selection.type === "add" && <AddChooser
            isVariation={isVariation}
            onDifferent={() => setSelection({ type: "new" })}
            onSame={() => void addSame(1)}
            onClose={() => setSelection(null)}
          />}
          {selection.type === "new" && <NewCopyForm
            index={copies.length + 1}
            live={live}
            currency={currency}
            onCancel={() => setSelection({ type: "add" })}
            onSave={async (copy) => {
              const created = await actions.onAddDistinct(copy);
              if (created) {
                const last = created.queuedCopies.at(-1);
                if (last) setSelection({ type: "unit", id: last.id });
              }
              return Boolean(created);
            }}
          />}
          {selectedUnit?.kind === "copy" && <CopyEditor
            copy={selectedUnit.copy}
            index={selectedUnit.start}
            count={copies.length}
            live={live}
            currency={currency}
            locked={locked}
            onAction={(body) => actions.onQueueAction(selectedUnit.copy.id, body)}
            onClose={() => setSelection(null)}
          />}
          {selectedUnit?.kind === "run" && <RunEditor
            copies={selectedUnit.copies}
            start={selectedUnit.start}
            live={live}
            livePhoto={livePhoto}
            currency={currency}
            locked={locked}
            canAdd={!full}
            onAddOne={() => void addSame(1, selectedUnit.copies.at(-1))}
            onQueueAction={actions.onQueueAction}
            onPatch={actions.onPatch}
            onClose={() => setSelection(null)}
          />}
          {linkCopy && <TimingEditor
            title={linkIndex === 0 ? "When the next one goes up" : `When #${linkIndex + 1} goes up`}
            after={linkIndex === 0 ? "the one on eBay" : `#${linkIndex}`}
            copy={linkCopy}
            locked={locked}
            onChange={(body) => actions.onQueueAction(linkCopy.id, body)}
            onClose={() => setSelection(null)}
          />}
        </div>
      </div>}
    </div>
  </section>;
}

function ListingState({ task }: { task: RestockTask }) {
  const map: Record<string, [string, string]> = {
    active: ["is-ok", task.queuedCopies.length ? "Watching for a sale" : "Nothing lined up"],
    scheduled: ["is-busy", "Restock coming up"],
    processing: ["is-busy", "Restocking now"],
    awaiting_approval: ["is-wait", "Waiting for your OK"],
    dry_run_ready: ["is-wait", "Test run ready"],
    attention: ["is-wait", "Needs a look"],
    error: ["is-bad", "Something went wrong"],
    paused: ["is-off", "Paused"],
  };
  const [tone, label] = map[task.status] ?? map.active;
  return <span className={`rl-state ${task.status === "active" && !task.queuedCopies.length ? "is-wait" : tone}`}><i aria-hidden="true" />{label}</span>;
}

function ApproveBar({ copy, onApprove }: { copy: QueuedCopy; onApprove: () => Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  return <div className="rl-approve" role="status">
    <span><strong>It sold.</strong> {copy.internalReference} is ready to go up when you say so.</span>
    <button type="button" className="rl-primary" disabled={busy} onClick={async () => { setBusy(true); await onApprove(); setBusy(false); }}>
      {busy ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />} Put it up
    </button>
  </div>;
}

function SortableUnit({ unit, size, live, livePhoto, currency, selected, linkSelected, locked, onSelect, onSelectLink }: {
  unit: Unit; size: string; live: number | null; livePhoto: string | null; currency: string;
  selected: boolean; linkSelected: boolean; locked: boolean;
  onSelect: () => void; onSelectLink: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id, disabled: locked });
  const first = unitCopies(unit)[0];
  const timing = timingOf(first);
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, viewTransitionName: `rl-${unit.id}` };
  const chip = timing.kind === "now" ? (size === "lg" ? timing.label : "") : size === "lg" ? timing.label : timing.short;
  return <li className={`rl-item ${isDragging ? "is-ghost" : ""}`} ref={setNodeRef} style={style}>
    <button
      type="button"
      className={`rl-link is-${timing.kind} ${linkSelected ? "is-selected" : ""}`}
      data-key={`link-${first.id}`}
      onClick={onSelectLink}
      aria-label={`Timing before ${first.internalReference}: ${timing.label}`}
    >
      {chip && <span>{chip}</span>}
    </button>
    <button
      type="button"
      className={`rl-node ${unit.kind === "run" && unit.copies.length > 1 ? "is-run" : ""} ${selected ? "is-selected" : ""}`}
      data-key={`node-${unit.id}`}
      onClick={onSelect}
      {...attributes}
      aria-pressed={selected}
      {...listeners}
    >
      <NodeFace unit={unit} live={live} livePhoto={livePhoto} currency={currency} />
    </button>
  </li>;
}

function NodeFace({ unit, live, livePhoto, currency, lifted = false }: {
  unit: Unit; live: number | null; livePhoto: string | null; currency: string; lifted?: boolean;
}): ReactNode {
  const copies = unitCopies(unit);
  const first = copies[0];
  const own = first.photos[0]?.url ?? null;
  const single = unit.kind === "copy" || copies.length === 1;
  const grade = gradeMeta(first.grade);
  const label = unit.kind === "run" && copies.length > 1
    ? `#${unit.start + 1}–${unit.start + copies.length}`
    : `${unit.start + 1}`;
  return <>
    <span className={`rl-tile ${own ? "" : "is-same"} ${lifted ? "is-lifted" : ""} ${single ? "" : "is-stack"}`}>
      {(own ?? livePhoto) ? <img src={own ?? livePhoto ?? ""} alt="" draggable={false} /> : <Camera size={20} aria-hidden="true" />}
      <span className="rl-num">{label}</span>
      {unit.kind === "run" && copies.length > 1 && <span className="rl-count">×{copies.length}</span>}
      {unit.kind === "run" && copies.length === 1 && <span className="rl-same">Same photos</span>}
      {unit.kind === "copy" && grade && <span className="rl-dot" style={{ background: grade.color }} title={grade.label} />}

    </span>
    <span className="rl-price">{priceSpan(copies, live, currency)}</span>
    <span className="rl-sub">{unit.kind === "run" ? (copies.length === 1 ? "Same as listing" : "Same photos") : grade?.label ?? "Own photos"}</span>
  </>;
}

function Chips<T extends string>({ value, options, onChange, disabled }: {
  value: T | null; options: Array<{ value: T; label: ReactNode }>; onChange: (value: T) => void; disabled?: boolean;
}) {
  return <div className="rl-chips" role="radiogroup">
    {options.map((option) => <button key={option.value} type="button" role="radio" aria-checked={value === option.value}
      className={value === option.value ? "is-on" : ""} disabled={disabled} onClick={() => onChange(option.value)}>{option.label}</button>)}
  </div>;
}

function PriceInput({ value, live, currency, disabled, onCommit, autoFocus = false, size = "lg" }: {
  value: number | null; live: number | null; currency: string; disabled?: boolean;
  onCommit: (price: string) => Promise<boolean> | void; autoFocus?: boolean; size?: "lg" | "sm";
}) {
  const saved = value === null ? "" : value.toFixed(2);
  const [draft, setDraft] = useState(saved);
  const [flash, setFlash] = useState(false);
  useEffect(() => setDraft(saved), [saved]);
  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === saved) return;
    const number = Number(trimmed);
    if (trimmed && (!Number.isFinite(number) || number <= 0)) { setDraft(saved); return; }
    const normalized = trimmed ? number.toFixed(2) : "";
    setDraft(normalized);
    const ok = await onCommit(normalized);
    if (ok !== false) { setFlash(true); window.setTimeout(() => setFlash(false), 900); }
  }
  return <label className={`rl-money is-${size} ${flash ? "is-saved" : ""}`}>
    <span aria-hidden="true">{currency === "USD" ? "$" : currency}</span>
    <input
      inputMode="decimal"
      aria-label="Price"
      placeholder={live === null ? "Price" : live.toFixed(2)}
      value={draft}
      disabled={disabled}
      autoFocus={autoFocus}
      onChange={(event) => setDraft(event.target.value.replace(/[^0-9.]/g, ""))}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { setDraft(saved); event.currentTarget.blur(); }
      }}
    />
    {flash && <Check size={14} className="rl-money-ok" aria-label="Saved" />}
  </label>;
}

function TimingChoice({ copy, locked, onChange, after }: {
  copy: QueuedCopy; locked: boolean; after: string; onChange: (body: QueueAction) => Promise<boolean>;
}) {
  const kind = timingOf(copy).kind;
  const [waitSeconds, setWaitSeconds] = useState(copy.releaseDelaySeconds ?? 3600);
  useEffect(() => { if (copy.releaseDelaySeconds !== null) setWaitSeconds(copy.releaseDelaySeconds); }, [copy.releaseDelaySeconds]);
  return <div className="rl-timing">
    <Chips<"now" | "wait" | "ask">
      value={kind}
      disabled={locked}
      options={[
        { value: "now", label: "Right away" },
        { value: "wait", label: "After a wait" },
        { value: "ask", label: "When I say so" },
      ]}
      onChange={(next) => {
        if (next === "now") void onChange({ action: "details", releaseDelaySeconds: null, needsApproval: false });
        if (next === "wait") void onChange({ action: "details", releaseDelaySeconds: waitSeconds, needsApproval: false });
        if (next === "ask") void onChange({ action: "details", needsApproval: true });
      }}
    />
    {kind === "wait" && <div className="rl-wait-row">
      <span>Wait</span>
      <div className="rl-chips is-small">
        {WAIT_OPTIONS.map((option) => <button key={option.seconds} type="button" disabled={locked}
          className={copy.releaseDelaySeconds === option.seconds ? "is-on" : ""}
          onClick={() => { setWaitSeconds(option.seconds); void onChange({ action: "details", releaseDelaySeconds: option.seconds, needsApproval: false }); }}>{option.short}</button>)}
      </div>
      <span>after {after} sells</span>
    </div>}
    <p className="rl-help">{kind === "now"
      ? `Goes up about a minute after ${after} sells.`
      : kind === "wait"
        ? "The listing shows sold out while it waits."
        : "Next pings you, then waits for you to tap Put it up here or in the Discord alert."}</p>
  </div>;
}

function TimingEditor({ title, after, copy, locked, onChange, onClose }: {
  title: string; after: string; copy: QueuedCopy; locked: boolean; onChange: (body: QueueAction) => Promise<boolean>; onClose: () => void;
}) {
  return <div className="rl-sheet">
    <div className="rl-sheet-head"><h3>{title}</h3><button type="button" className="rl-icon is-small" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
    <TimingChoice copy={copy} locked={locked} onChange={onChange} after={after} />
  </div>;
}

function CopyEditor({ copy, index, count, live, currency, locked, onAction, onClose }: {
  copy: QueuedCopy; index: number; count: number; live: number | null; currency: string; locked: boolean;
  onAction: (body: QueueAction) => Promise<boolean>; onClose: () => void;
}) {
  const [note, setNote] = useState(copy.conditionDescription);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setNote(copy.conditionDescription), [copy.conditionDescription]);
  const own = copy.photos.length > 0;
  return <div className="rl-sheet rl-editor">
    <div className="rl-photos">
      {own
        ? copy.photos.slice(0, 4).map((photo, position) => <img key={photo.id} src={photo.url} alt={`Photo ${position + 1}`} />)
        : <div className="rl-photos-same">Uses the photos already on the listing</div>}
      {copy.photos.length > 4 && <span className="rl-photos-more">+{copy.photos.length - 4}</span>}
    </div>
    <div className="rl-fields">
      <div className="rl-sheet-head">
        <h3>{index === 0 ? "Sells next" : `#${index + 1} in line`}<small>{copy.internalReference}</small></h3>
        <button type="button" className="rl-icon is-small" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="rl-row"><span>Condition</span>
        <Chips<CopyGrade> value={copy.grade} disabled={locked}
          options={GRADES.map((grade) => ({ value: grade.value, label: <><i className="rl-chip-dot" style={{ background: grade.color }} />{grade.label}</> }))}
          onChange={(grade) => void onAction({ action: "details", grade: grade === copy.grade ? null : grade })} />
      </div>
      <div className="rl-row"><span>Price</span>
        <div className="rl-price-line">
          <PriceInput value={copy.targetPrice} live={live} currency={currency} disabled={locked} onCommit={(price) => onAction({ action: "price", targetPrice: price })} />
          <small>{copy.targetPrice === null ? "Leave empty to keep the eBay price." : ""}</small>
        </div>
      </div>
      <div className="rl-row"><span>Note</span>
        <input className="rl-input" value={note} maxLength={1000} disabled={locked}
          placeholder={own ? "What's different about this copy?" : "Leave empty to keep the listing's note"}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => { const value = note.trim(); if (value !== copy.conditionDescription) { if (own && !value) setNote(copy.conditionDescription); else void onAction({ action: "details", conditionDescription: value }); } }}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      </div>
      <div className="rl-row"><span>Goes up</span>
        <TimingChoice copy={copy} locked={locked} onChange={onAction} after={index === 0 ? "the one on eBay" : `#${index}`} />
      </div>
      <div className="rl-sheet-foot">
        <div className="rl-move">
          <button type="button" className="rl-quiet" disabled={locked || index === 0} onClick={() => void onAction({ action: "move", direction: "up" })}>Sell earlier</button>
          <button type="button" className="rl-quiet" disabled={locked || index === count - 1} onClick={() => void onAction({ action: "move", direction: "down" })}>Sell later</button>
        </div>
        {confirming
          ? <span className="rl-confirm">Remove this copy? <button type="button" className="rl-quiet" onClick={() => setConfirming(false)}>Keep</button><button type="button" className="rl-danger" onClick={() => { void onAction({ action: "remove" }); onClose(); }}>Remove</button></span>
          : <button type="button" className="rl-quiet is-danger" disabled={locked} onClick={() => setConfirming(true)}><Trash2 size={14} aria-hidden="true" /> Remove</button>}
      </div>
    </div>
  </div>;
}

function RunEditor({ copies, start, live, livePhoto, currency, locked, canAdd, onAddOne, onQueueAction, onPatch, onClose }: {
  copies: QueuedCopy[]; start: number; live: number | null; livePhoto: string | null; currency: string; locked: boolean; canAdd: boolean;
  onAddOne: () => void; onQueueAction: (copyId: string, body: QueueAction) => Promise<boolean>;
  onPatch: (patch: TaskPatch) => Promise<boolean>; onClose: () => void;
}) {
  const [step, setStep] = useState("");
  const [removing, setRemoving] = useState(false);
  const firstPrice = copies[0].targetPrice ?? live;
  const stepNumber = Number(step);
  const canRaise = step.trim() !== "" && Number.isFinite(stepNumber) && stepNumber !== 0 && firstPrice !== null;
  function applyRaise() {
    if (!canRaise || firstPrice === null) return;
    void onPatch({ prices: copies.map((copy, index) => ({ copyId: copy.id, targetPrice: Math.max(0.01, firstPrice + stepNumber * index).toFixed(2) })) });
  }
  async function removeLast() {
    const last = copies.at(-1);
    if (!last) return;
    setRemoving(true);
    await onQueueAction(last.id, { action: "remove" });
    setRemoving(false);
  }
  return <div className="rl-sheet rl-editor">
    <div className="rl-photos">
      {livePhoto && <img src={livePhoto} alt="Listing photo" />}
      <div className="rl-photos-same">Every one uses the listing&apos;s photos</div>
    </div>
    <div className="rl-fields">
      <div className="rl-sheet-head">
        <h3>{copies.length === 1 ? "Same as the listing" : `${copies.length} of the same`}<small>{copies.length === 1 ? `#${start + 1} in line. Tap + to stack more.` : `#${start + 1} to #${start + copies.length} in line`}</small></h3>
        <button type="button" className="rl-icon is-small" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="rl-row"><span>How many</span>
        <div className="rl-count-stepper">
          <button type="button" aria-label="One fewer" disabled={locked || removing} onClick={() => void removeLast()}><Minus size={16} /></button>
          <output aria-live="polite">{copies.length}</output>
          <button type="button" aria-label="One more" disabled={locked || !canAdd} onClick={onAddOne}><Plus size={16} /></button>
        </div>
      </div>
      <div className="rl-row is-top"><span>Prices</span>
        <div className="rl-run-prices">
          <div className="rl-run-grid">
            {copies.map((copy, index) => <div className="rl-run-cell" key={copy.id}>
              <small>#{start + index + 1}</small>
              <PriceInput size="sm" value={copy.targetPrice} live={live} currency={currency} disabled={locked || copy.id.startsWith("pending-")}
                onCommit={(price) => onQueueAction(copy.id, { action: "price", targetPrice: price })} />
            </div>)}
          </div>
          {copies.length > 1 && <div className="rl-raise">
            <span>Change each one by</span>
            <label className="rl-money is-sm"><span aria-hidden="true">$</span><input inputMode="decimal" aria-label="Change per copy" placeholder="0.00" value={step} onChange={(event) => setStep(event.target.value.replace(/[^0-9.-]/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") applyRaise(); }} /></label>
            <button type="button" className="rl-quiet" disabled={!canRaise || locked} onClick={applyRaise}>Apply</button>
          </div>}
        </div>
      </div>
      {copies.length > 1
        ? <div className="rl-row"><span>Between them</span>
          <TimingChoice copy={copies[1]} locked={locked} after="the one before"
            onChange={async (body) => {
              const results = await Promise.all(copies.slice(1).map((copy) => onQueueAction(copy.id, body)));
              return results.every(Boolean);
            }} />
        </div>
        : <div className="rl-row"><span>Goes up</span>
          <TimingChoice copy={copies[0]} locked={locked} after={start === 0 ? "the one on eBay" : `#${start}`} onChange={(body) => onQueueAction(copies[0].id, body)} />
        </div>}
    </div>
  </div>;
}

function AddChooser({ isVariation, onDifferent, onSame, onClose }: {
  isVariation: boolean; onDifferent: () => void; onSame: () => void; onClose: () => void;
}) {
  return <div className="rl-sheet">
    <div className="rl-sheet-head"><h3>What sells after this?</h3><button type="button" className="rl-icon is-small" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
    <div className="rl-choose">
      {!isVariation && <button type="button" className="rl-choice" onClick={onDifferent}>
        <span className="rl-art is-different"><i /><i /><i /></span>
        <span><strong>A different copy</strong><small>Its own photos, condition and price. Buyers see exactly this one.</small></span>
      </button>}
      <button type="button" className="rl-choice" onClick={onSame}>
        <span className="rl-art is-same"><i /><i /><i /></span>
        <span><strong>Another of the same</strong><small>Uses the listing&apos;s photos. Add more with + once it&apos;s on the line.</small></span>
      </button>
    </div>
  </div>;
}

function NewCopyForm({ index, live, currency, onCancel, onSave }: {
  index: number; live: number | null; currency: string; onCancel: () => void; onSave: (copy: DistinctCopy) => Promise<boolean>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [grade, setGrade] = useState<CopyGrade | null>(null);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  function take(list: FileList | null) {
    const images = Array.from(list ?? []).filter((file) => file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name));
    if (images.length) setFiles((current) => [...current, ...images].slice(0, 24));
  }
  const ready = files.length > 0 && note.trim().length > 0;
  return <div className="rl-sheet rl-editor">
    <div
      className={`rl-drop ${over ? "is-over" : ""} ${files.length ? "has-files" : ""}`}
      onDragOver={(event: ReactDragEvent) => { event.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: ReactDragEvent) => { event.preventDefault(); setOver(false); take(event.dataTransfer.files); }}
      onClick={() => fileInput.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInput.current?.click(); }}
    >
      {previews.length
        ? <div className="rl-drop-grid">{previews.slice(0, 4).map((url) => <img key={url} src={url} alt="" />)}{files.length > 4 && <span>+{files.length - 4}</span>}</div>
        : <span className="rl-drop-empty"><ImagePlus size={26} strokeWidth={1.6} aria-hidden="true" /><strong>Add photos</strong><small>Drop them here or click</small></span>}
      <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => take(event.target.files)} />
    </div>
    <div className="rl-fields">
      <div className="rl-sheet-head"><h3>A different copy<small>Goes in as #{index}</small></h3><button type="button" className="rl-icon is-small" onClick={onCancel} aria-label="Back"><X size={16} /></button></div>
      <div className="rl-row"><span>Condition</span>
        <Chips<CopyGrade> value={grade} onChange={(value) => setGrade(value === grade ? null : value)}
          options={GRADES.map((entry) => ({ value: entry.value, label: <><i className="rl-chip-dot" style={{ background: entry.color }} />{entry.label}</> }))} />
      </div>
      <div className="rl-row"><span>Price</span>
        <div className="rl-price-line">
          <label className="rl-money is-lg"><span aria-hidden="true">$</span>
            <input inputMode="decimal" aria-label="Price" placeholder={live === null ? "Price" : live.toFixed(2)} value={price} onChange={(event) => setPrice(event.target.value.replace(/[^0-9.]/g, ""))} />
          </label>
          <small>{price ? "" : `Empty keeps the eBay price${live === null ? "" : ` (${money(live, currency)})`}.`}</small>
        </div>
      </div>
      <div className="rl-row"><span>Note</span>
        <input className="rl-input" value={note} maxLength={1000} placeholder="e.g. No manual, light disc scratches, tested" onChange={(event) => setNote(event.target.value)} />
      </div>
      <div className="rl-sheet-foot">
        <span className="rl-help">{!files.length ? "Add photos of this exact copy." : !note.trim() ? "Describe this copy's condition." : "Ready to add."}</span>
        <button type="button" className="rl-primary" disabled={!ready || saving} onClick={async () => {
          setSaving(true);
          const ok = await onSave({ reference: `COPY-${index}`, files, grade, price, note: note.trim() });
          setSaving(false);
          if (!ok) return;
        }}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Add to the line</button>
      </div>
    </div>
  </div>;
}
