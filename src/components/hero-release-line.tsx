"use client";

import { useState, type CSSProperties } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, RefreshCw } from "lucide-react";
import styles from "./hero-release-line.module.css";

type DotColor = "amber" | "green" | "red";

// Product photo from Asmodee UK: https://www.asmodee.co.uk/products/pok1010447101-pokemon-tcg-elite-trainer-box-30th-celebration
const productPhoto = "/demos/pokemon-30th-etb.webp";
const copies = {
  first: { count: 1, price: "$144.99" },
  second: { count: 1, price: "$149.99" },
  third: { count: 1, price: "$154.99" },
  stack: { count: 3, price: "$159.99–169.99" },
} as const;
type CopyId = keyof typeof copies;
type Timing = "now" | "wait" | "ask";
const slots = [17.9, 30.6, 45.5, 61];
const connectorClasses = [styles.connectorOne, styles.connectorTwo, styles.connectorThree, styles.connectorFour, styles.connectorFive];

const dotCycle: DotColor[] = ["amber", "green", "red"];

export function HeroReleaseLine() {
  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<CopyId[]>(["first", "second", "third", "stack"]);
  const [dotColors, setDotColors] = useState<Record<CopyId, DotColor>>({ first: "amber", second: "amber", third: "green", stack: "green" });
  const [timings, setTimings] = useState<Partial<Record<CopyId | "add", Timing>>>({});
  const [watching, setWatching] = useState(true);
  const [refreshCount, setRefreshCount] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  let nextNumber = 1;
  const positions = order.map((id, index) => {
    const number = nextNumber;
    nextNumber += copies[id].count;
    return { id, x: slots[index], number };
  });
  const timingTargets = [...positions, { id: "add" as const, number: nextNumber }];

  function toggleSelected(id: string) {
    setSelected((current) => current === id ? null : id);
  }

  function cycleDot(id: CopyId) {
    setDotColors((current) => ({ ...current, [id]: dotCycle[(dotCycle.indexOf(current[id]) + 1) % dotCycle.length] }));
  }

  function cycleTiming(id: CopyId | "add") {
    setTimings((current) => ({ ...current, [id]: current[id] === "wait" ? "ask" : current[id] === "ask" ? "now" : "wait" }));
  }

  function reorder(event: DragEndEvent) {
    const from = order.indexOf(event.active.id as CopyId);
    const to = order.indexOf(event.over?.id as CopyId);
    if (from !== -1 && to !== -1 && from !== to) setOrder((current) => arrayMove(current, from, to));
  }

  return <div className={`hero-shot ${styles.frame}`} role="group" aria-label="Interactive release line illustration; changes here are only visual">
    <header className={styles.header}>
      <button type="button" className={`${styles.headerPhoto} ${selected === "live" ? styles.headerPhotoSelected : ""}`} onClick={() => toggleSelected("live")} aria-label="Highlight the copy on eBay" aria-pressed={selected === "live"}>
        <img src={productPhoto} alt="" draggable={false} />
      </button>
      <div className={styles.heading}>
        <strong>Pokémon TCG: 30th Celebration ETB</strong>
        <span><b>$139.99</b> on eBay <i /> 1 available <i /> 8 sold</span>
      </div>
      <button type="button" className={`${styles.watching} ${watching ? "" : styles.paused}`} onClick={() => setWatching((value) => !value)} aria-pressed={watching} aria-label={watching ? "Pause preview status" : "Resume preview status"}>
        <span className={styles.statusDot} key={`${watching}-${refreshCount}`} />
        {watching ? "Watching for a sale" : "Paused in preview"}
      </button>
      <button type="button" className={styles.refresh} onClick={() => setRefreshCount((value) => value + 1)} aria-label="Replay status refresh animation">
        <RefreshCw key={refreshCount} aria-hidden="true" />
      </button>
    </header>

    <section className={styles.canvas} aria-label="Six example copies in the release line">
      <div className={styles.canvasHeading}><h2>Release line</h2><p>6 copies lined up. That covers the next 6 sales.</p></div>

      {timingTargets.map(({ id, number }, index) => {
        const timing = timings[id] ?? "now";
        return <button key={id} type="button"
          className={`${styles.connector} ${connectorClasses[index]} ${id === "add" ? styles.dashed : ""} ${timing !== "now" ? styles.connectorActive : ""}`}
          onClick={() => cycleTiming(id)}
          aria-label={`Timing before ${id === "add" ? "the add tile" : id === "stack" ? `copies ${number} through ${number + 2}` : `copy ${number}`}: ${timing === "wait" ? "2 days" : timing === "ask" ? "ask" : "right away"}. Click to cycle.`}
          title="Click to cycle timing: right away, 2 days, ask">
          {timing !== "now" && <span>{timing === "wait" ? "2 days" : "ask"}</span>}
        </button>;
      })}

      <div className={`${styles.node} ${styles.liveNode}`}>
        <button type="button" className={`${styles.tile} ${styles.liveTile} ${selected === "live" ? styles.selected : ""}`} onClick={() => toggleSelected("live")} aria-label="Highlight the copy on eBay" aria-pressed={selected === "live"}>
          <img src={productPhoto} alt="" draggable={false} />
          <span className={styles.liveFlag}>On eBay now</span>
        </button>
        <strong className={`${styles.price} ${styles.livePrice}`}>$139.99</strong>
      </div>

      <DndContext id="hero-release-line" sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          {positions.map(({ id, x, number }) => <SortableCopy key={id} id={id} x={x} number={number}
            color={dotColors[id]} selected={selected === id} onSelect={() => toggleSelected(id)} onCycleDot={() => cycleDot(id)} />)}
        </SortableContext>
      </DndContext>

      <div className={`${styles.node} ${styles.addNode}`}>
        <button type="button" className={`${styles.tile} ${styles.addTile} ${selected === "add" ? styles.selected : ""}`} onClick={() => toggleSelected("add")} aria-label="Highlight add-copy tile" aria-pressed={selected === "add"}><Plus aria-hidden="true" /></button>
      </div>
    </section>
  </div>;
}

function SortableCopy({ id, x, number, color, selected, onSelect, onCycleDot }: {
  id: CopyId; x: number; number: number; color: DotColor; selected: boolean; onSelect: () => void; onCycleDot: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const isStack = id === "stack";
  const label = isStack ? `copies ${number} through ${number + 2}, three identical ETBs` : `copy ${number}`;
  return <div ref={setNodeRef} className={`${styles.node} ${isStack ? styles.stackNode : ""} ${isDragging ? styles.dragging : ""}`}
    style={{ left: `${x}cqw`, transform: CSS.Transform.toString(transform), transition: transition ? `${transition}, left 220ms ease` : undefined } as CSSProperties}>
    <button ref={setActivatorNodeRef} type="button" className={`${styles.tile} ${isStack ? styles.stackTile : ""} ${selected ? styles.selected : ""}`}
      {...attributes} {...listeners} onClick={onSelect} aria-label={`Highlight ${label}; drag to reorder`} aria-pressed={selected} title={`Drag to reorder ${label}`}>
      <img src={productPhoto} alt="" draggable={false} />
      <span className={isStack ? styles.stackNumber : styles.number}>{isStack ? `#${number}–${number + 2}` : number}</span>
      {isStack && <span className={styles.stackCount}>×3</span>}
    </button>
    {!isStack && <button type="button" className={`${styles.copyDot} ${styles[color]}`} onClick={onCycleDot} aria-label={`Change copy ${number} dot color`} title="Change dot color" />}
    <strong className={styles.price}>{copies[id].price}</strong>
  </div>;
}
