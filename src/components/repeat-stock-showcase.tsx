"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const steps = [
  { title: "Choose the listing", summary: "Find the listing you want to keep selling from.", video: "/demos/choose.mp4?v=4", webm: "/demos/choose.webm?v=4", poster: "/demos/choose.jpg?v=4", frame: "wide" },
  { title: "Prepare the next copy", summary: "Add its photos, condition, and price ahead of time.", video: "/demos/prepare-detail.mp4?v=1", webm: "", poster: "/demos/prepare-detail.jpg?v=1", frame: "medium" },
  { title: "Restock after the sale", summary: "See the next copy go live on the same listing.", video: "/demos/restock.mp4?v=4", webm: "/demos/restock.webm?v=4", poster: "/demos/restock.jpg?v=4", frame: "wide" },
  { title: "See it in Discord", summary: "Get sale and restock updates in your channel.", video: "/demos/discord-detail.mp4?v=2", webm: "", poster: "/demos/discord-detail.jpg?v=2", frame: "compact" },
] as const;

export function RepeatStockShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastIndex = useRef(activeIndex);

  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) setPlaying(true);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) { lastIndex.current = activeIndex; return; }
    if (lastIndex.current !== activeIndex) video.currentTime = 0;
    lastIndex.current = activeIndex;
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [activeIndex, playing]);

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? (activeIndex + 1) % steps.length
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? (activeIndex + steps.length - 1) % steps.length
        : event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    setActiveIndex(nextIndex);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  }

  const step = steps[activeIndex];
  return <div className="repeat-showcase">
    <div className="repeat-showcase-tabs" role="tablist" aria-label="Restock workflow" aria-orientation="vertical" onKeyDown={handleTabKeyDown}>
      {steps.map((item, index) => <button type="button" role="tab" id={`repeat-tab-${index}`} aria-controls="repeat-panel" aria-selected={activeIndex === index} tabIndex={activeIndex === index ? 0 : -1} className={activeIndex === index ? "is-active" : ""} key={item.title} onClick={() => setActiveIndex(index)}>
        <span className="repeat-step-index">0{index + 1}</span>
        <span className="repeat-step-copy"><strong>{item.title}</strong><small>{item.summary}</small></span>
      </button>)}
    </div>
    <div className={`repeat-showcase-panel is-${step.frame}`} id="repeat-panel" role="tabpanel" aria-labelledby={`repeat-tab-${activeIndex}`}>
      <button className="repeat-demo-surface" type="button" onClick={() => setPlaying((value) => !value)} aria-label={`${playing ? "Pause" : "Play"} ${step.title} preview`}>
        <video key={step.video} ref={videoRef} className="repeat-demo-video" poster={step.poster} muted loop playsInline preload="metadata" aria-hidden="true">
          <source src={step.video} type="video/mp4" />
          {step.webm && <source src={step.webm} type="video/webm" />}
        </video>
      </button>
    </div>
  </div>;
}
