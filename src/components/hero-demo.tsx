"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CircleDot, ImageIcon, PackageCheck, RotateCcw } from "lucide-react";
import { GamePhoto } from "./game-photo";

type DemoStage = "ready" | "sold" | "applying" | "live";

const stageCopy: Record<DemoStage, { label: string; detail: string }> = {
  ready: { label: "Copy A is live", detail: "Copy B is first in line" },
  sold: { label: "Sale detected", detail: "Listing hidden at quantity 0" },
  applying: { label: "Applying Copy B", detail: "Photos and condition are switching" },
  live: { label: "Copy B is live", detail: "Same listing. Correct copy." },
};

export function HeroDemo() {
  const [stage, setStage] = useState<DemoStage>("ready");
  const [currentCopy, setCurrentCopy] = useState<"a" | "b">("a");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function clearTimers() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  }

  function runDemo() {
    clearTimers();
    setCurrentCopy("a");
    setStage("sold");
    timers.current.push(
      window.setTimeout(() => setStage("applying"), 850),
      window.setTimeout(() => {
        setCurrentCopy("b");
        setStage("live");
      }, 1950),
    );
  }

  function resetDemo() {
    clearTimers();
    setCurrentCopy("a");
    setStage("ready");
  }

  const isRunning = stage === "sold" || stage === "applying";

  return (
    <div className="hero-demo" aria-label="Interactive Nextinstock restock demo">
      <div className="demo-window-bar">
        <div className="demo-context">
          <span className="demo-store-dot" />
          <span>Restock queue</span>
        </div>
        <span className="demo-listing-id">EBAY · 2668••••9941</span>
      </div>

      <div className="demo-body">
        <div className="demo-live-panel">
          <div className="demo-panel-heading">
            <span>On eBay now</span>
            <span className={`status-pill status-${stage}`}>
              {stage === "ready" || stage === "live" ? "Live" : stage === "sold" ? "Out of stock" : "Updating"}
            </span>
          </div>
          <div className={`demo-photo-stage demo-stage-${stage}`}>
            <GamePhoto copy={currentCopy} angle="front" />
            {stage === "applying" && (
              <div className="photo-apply-overlay">
                <span className="apply-spinner" />
                Applying next copy
              </div>
            )}
          </div>
          <div className="demo-listing-copy">
            <span className="demo-eyebrow">Nintendo GameCube · Complete</span>
            <strong>Super Circuit 64</strong>
            <span>{currentCopy === "a" ? "Very good · Light corner wear" : "Very good · Clean case and manual"}</span>
          </div>
        </div>

        <div className="demo-handoff" aria-hidden="true">
          <ArrowRight size={18} />
        </div>

        <div className="demo-queue-panel">
          <div className="demo-panel-heading">
            <span>Next in line</span>
            <span className="queue-count">2 ready</span>
          </div>
          <div className={`queue-copy queue-copy-primary ${stage === "live" ? "queue-copy-used" : ""}`}>
            <GamePhoto copy="b" angle="front" />
            <div>
              <span className="queue-position">Next</span>
              <strong>Copy B</strong>
              <span>6 photos · Clean case</span>
            </div>
            <span className="ready-check"><Check size={14} /></span>
          </div>
          <div className="queue-copy queue-copy-secondary">
            <GamePhoto copy="c" angle="front" />
            <div>
              <span className="queue-position">After that</span>
              <strong>Copy C</strong>
              <span>5 photos · Minor wear</span>
            </div>
            <span className="ready-check"><Check size={14} /></span>
          </div>
        </div>
      </div>

      <div className="demo-action-bar">
        <div className="demo-event-copy" aria-live="polite">
          <span className="event-icon">
            {stage === "ready" && <CircleDot size={17} />}
            {stage === "sold" && <PackageCheck size={17} />}
            {stage === "applying" && <ImageIcon size={17} />}
            {stage === "live" && <Check size={17} />}
          </span>
          <span>
            <strong>{stageCopy[stage].label}</strong>
            <small>{stageCopy[stage].detail}</small>
          </span>
        </div>
        {stage === "live" ? (
          <button className="demo-button demo-button-secondary" type="button" onClick={resetDemo}>
            <RotateCcw size={15} /> Reset
          </button>
        ) : (
          <button className="demo-button" type="button" onClick={runDemo} disabled={isRunning}>
            {isRunning ? "Restocking…" : "Simulate a sale"}
            {!isRunning && <ArrowRight size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}
