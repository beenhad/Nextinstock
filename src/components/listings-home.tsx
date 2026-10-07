"use client";

import { ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";
import type { ActivityEvent, RestockTask } from "@/lib/types";
import { GRADES } from "./tool-actions";

function money(value: number | null | undefined, currency = "USD") {
  if (value === null || value === undefined) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function stateOf(task: RestockTask): { tone: string; label: string } {
  if (task.status === "awaiting_approval") return { tone: "is-wait", label: "Waiting for your OK" };
  if (task.status === "scheduled") return { tone: "is-busy", label: "Restock coming up" };
  if (task.status === "processing") return { tone: "is-busy", label: "Restocking now" };
  if (task.status === "error") return { tone: "is-bad", label: "Something went wrong" };
  if (task.status === "attention") return { tone: "is-wait", label: "Needs a look" };
  if (task.status === "dry_run_ready") return { tone: "is-wait", label: "Test run ready" };
  if (!task.queuedCopies.length) return { tone: "is-wait", label: "Nothing lined up" };
  return { tone: "is-ok", label: "Watching" };
}

export function ListingsHome({ tasks, events, loading, onOpen, onNew }: {
  tasks: RestockTask[]; events: ActivityEvent[]; loading: boolean; onOpen: (task: RestockTask) => void; onNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const restocked = events.filter((event) => ["restock_completed", "variation_restock_confirmed"].includes(event.type) && new Date(event.createdAt) >= monthStart).length;
  const queued = tasks.reduce((sum, task) => sum + task.queuedCopies.length, 0);
  const visible = tasks.filter((task) => {
    const needle = query.trim().toLowerCase();
    return !needle || [task.listing.title, task.itemId, ...task.queuedCopies.map((copy) => copy.internalReference)].some((value) => value.toLowerCase().includes(needle));
  });
  // Listings that need you float to the top.
  const ordered = [...visible].sort((a, b) => Number(stateOf(b).tone === "is-wait") - Number(stateOf(a).tone === "is-wait"));

  return <section className="lh">
    <header className="lh-top">
      <div>
        <h1>Listings</h1>
        <p>{tasks.length} watched, {queued} {queued === 1 ? "copy" : "copies"} lined up, {restocked} restocked this month</p>
      </div>
      <div className="lh-actions">
        {tasks.length > 4 && <label className="lh-search"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a listing" aria-label="Find a listing" /></label>}
        <button type="button" className="rl-primary is-big" onClick={onNew}><Plus size={17} aria-hidden="true" /> Add a listing</button>
      </div>
    </header>

    {loading ? <div className="lh-empty">Loading your listings</div>
      : tasks.length === 0 ? <div className="lh-empty is-first">
        <strong>Pick a listing you have more than one of.</strong>
        <span>Then line up what sells after it. Next puts each one up when the last one sells.</span>
        <button type="button" className="rl-primary is-big" onClick={onNew}><Plus size={17} aria-hidden="true" /> Add your first listing</button>
      </div>
        : <ul className="lh-list">
          {ordered.map((task) => {
            const variation = task.listing.variations.find((candidate) => candidate.key === task.variationKey);
            const currency = variation?.currency ?? task.listing.currency;
            const live = variation?.price ?? task.listing.price;
            const next = task.queuedCopies[0];
            const state = stateOf(task);
            const photo = variation?.imageUrls[0] ?? task.listing.imageUrls[0];
            return <li key={task.id}>
              <button type="button" className="lh-row" onClick={() => onOpen(task)} style={{ viewTransitionName: `lh-${task.id}` }}>
                {photo ? <img src={photo} alt="" /> : <span className="lh-blank" />}
                <span className="lh-title">
                  <strong>{variation && <em>{variation.label.replace(/^[^:]+:\s*/, "")}</em>}{task.listing.title}</strong>
                  <small>{variation?.quantitySold ?? task.listing.quantitySold} sold</small>
                </span>
                <span className="lh-line" aria-label={`${task.queuedCopies.length} lined up`}>
                  <span className="lh-pips">
                    <i className="is-live" />
                    {task.queuedCopies.slice(0, 25).map((copy) => <i key={copy.id} className={copy.photos.length ? "" : "is-same"} style={copy.grade ? { background: GRADES.find((grade) => grade.value === copy.grade)?.color } : undefined} />)}
                  </span>
                  <small>{task.queuedCopies.length ? `${task.queuedCopies.length} lined up` : "None lined up"}</small>
                </span>
                <span className="lh-price"><strong>{money(live, currency)}</strong><small>{next ? `then ${money(next.targetPrice ?? live, currency)}` : "sold out after this"}</small></span>
                <span className={`rl-state ${state.tone}`}><i aria-hidden="true" />{state.label}</span>
                <ChevronRight size={18} className="lh-chev" aria-hidden="true" />
              </button>
            </li>;
          })}
        </ul>}
  </section>;
}
