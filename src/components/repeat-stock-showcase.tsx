"use client";

import { useState, type KeyboardEvent } from "react";

const views = [
  {
    tab: "Prep in batches",
    eyebrow: "01 / READY BEFORE THE SALE",
    title: "The next copy is already waiting.",
    body: "Photograph and describe copies when you have time, then put them in the order you want to sell them.",
    primary: "Next copy",
    detail: "Photos and condition ready",
    status: "Queued",
    behind: "Batch inventory",
    behindDetail: "3 copies prepared",
  },
  {
    tab: "Show one at a time",
    eyebrow: "02 / CONTROL WHAT BUYERS SEE",
    title: "Your whole stack stays off the shelf.",
    body: "Keep one copy available on the listing while the rest wait in your queue. Choose what goes live after each sale.",
    primary: "Visible on eBay",
    detail: "1 copy available",
    status: "Live",
    behind: "Held in queue",
    behindDetail: "2 copies ready",
  },
  {
    tab: "Set the next price",
    eyebrow: "03 / PLAN THE NEXT RESTOCK",
    title: "Price each copy for what it is.",
    body: "Queue the rough copy first and set a different restock price for the cleaner one behind it.",
    primary: "Next restock",
    detail: "Condition and price planned",
    status: "Ready",
    behind: "Following copy",
    behindDetail: "Different condition, different price",
  },
] as const;

export function RepeatStockShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = views[activeIndex];

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = event.key === "ArrowRight"
      ? (activeIndex + 1) % views.length
      : event.key === "ArrowLeft"
        ? (activeIndex + views.length - 1) % views.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? views.length - 1
            : null;

    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  }

  return (
    <div className="repeat-showcase">
      <div className="repeat-showcase-tabs" role="tablist" aria-label="Repeat stock benefits" onKeyDown={handleTabKeyDown}>
        {views.map((view, index) => (
          <button
            type="button"
            role="tab"
            id={`repeat-tab-${index}`}
            aria-controls="repeat-panel"
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            className={activeIndex === index ? "is-active" : ""}
            key={view.tab}
            onClick={() => setActiveIndex(index)}
          >
            <span>0{index + 1}</span>{view.tab}
          </button>
        ))}
      </div>
      <div className="repeat-showcase-panel" id="repeat-panel" role="tabpanel" aria-labelledby={`repeat-tab-${activeIndex}`}>
        <div className="repeat-showcase-copy" key={active.tab}>
          <span>{active.eyebrow}</span>
          <h3>{active.title}</h3>
          <p>{active.body}</p>
        </div>
        <div className="repeat-showcase-visual" aria-hidden="true">
          <div className="repeat-showcase-back" key={`${active.tab}-back`}>
            <span className="repeat-showcase-tile" />
            <div><strong>{active.behind}</strong><small>{active.behindDetail}</small></div>
          </div>
          <div className="repeat-showcase-front" key={`${active.tab}-front`}>
            <span className="repeat-showcase-tile" />
            <div><strong>{active.primary}</strong><small>{active.detail}</small></div>
            <em>{active.status}</em>
          </div>
        </div>
      </div>
    </div>
  );
}
