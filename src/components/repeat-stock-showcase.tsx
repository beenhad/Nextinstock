"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const steps = [
  {
    title: "Pick the listing", short: "Pick",
    summary: "Choose the live listing you keep restocking. On a variation listing, pick the exact color or option.",
    video: "/demos/choose.mp4?v=4", webm: "/demos/choose.webm?v=4", poster: "/demos/choose.jpg?v=4",
  },
  {
    title: "Queue the next copies", short: "Queue",
    summary: "Shoot each copy once. Give it photos, a condition note, and a price, then set the selling order.",
    video: "/demos/prepare-detail.mp4?v=1", webm: "", poster: "/demos/prepare-detail.jpg?v=1",
  },
  {
    title: "It restocks on its own", short: "Restock",
    summary: "When one sells, Next swaps in the next copy, checks that eBay took it, and puts one back up for sale.",
    video: "/demos/restock.mp4?v=4", webm: "/demos/restock.webm?v=4", poster: "/demos/restock.jpg?v=4",
  },
  {
    title: "Get the ping", short: "Alert",
    summary: "Every sale and restock posts to your Discord, so you know it happened without opening eBay.",
    video: "/demos/discord-detail.mp4?v=3", webm: "", poster: "/demos/discord-detail.jpg?v=2",
  },
] as const;

export function RepeatStockShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inView, setInView] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const autoAdvance = useRef(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    autoAdvance.current = !reduced;
    if (reduced) return;
    const node = rootRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setPlaying(inView); }, [inView]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) void video.play().catch(() => undefined);
    else video.pause();
  }, [activeIndex, playing]);

  function select(index: number, fromUser: boolean) {
    if (fromUser) autoAdvance.current = false;
    setProgress(0);
    setActiveIndex(index);
    if (fromUser) setPlaying(true);
  }

  function handleEnded() {
    if (autoAdvance.current) select((activeIndex + 1) % steps.length, false);
    else { const video = videoRef.current; if (video) { video.currentTime = 0; void video.play().catch(() => undefined); } }
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nextIndex = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? (activeIndex + 1) % steps.length
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? (activeIndex + steps.length - 1) % steps.length
        : event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    select(nextIndex, true);
    event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']")[nextIndex]?.focus();
  }

  const step = steps[activeIndex];
  return <div className="steps-showcase" ref={rootRef}>
    <div className="steps-tabs" role="tablist" aria-label="How Next restocks a listing" aria-orientation="vertical" onKeyDown={handleTabKeyDown}>
      {steps.map((item, index) => {
        const state = index === activeIndex ? "is-active" : index < activeIndex ? "is-done" : "";
        return <button type="button" role="tab" id={`steps-tab-${index}`} aria-controls="steps-panel" aria-selected={activeIndex === index} tabIndex={activeIndex === index ? 0 : -1} className={`steps-tab ${state}`} key={item.title} onClick={() => select(index, true)}>
          <span className="steps-tab-index">0{index + 1}</span>
          <span className="steps-tab-copy"><strong><span className="steps-tab-full">{item.title}</span><span className="steps-tab-short">{item.short}</span></strong><small>{item.summary}</small></span>
          <span className="steps-tab-progress" aria-hidden="true"><span style={{ transform: `scaleX(${index === activeIndex ? progress : index < activeIndex ? 1 : 0})` }} /></span>
        </button>;
      })}
    </div>
    <div className="steps-stage" id="steps-panel" role="tabpanel" aria-labelledby={`steps-tab-${activeIndex}`}>
      <button className="steps-stage-surface" type="button" onClick={() => setPlaying((value) => !value)} aria-label={`${playing ? "Pause" : "Play"} the ${step.title.toLowerCase()} preview`}>
        <video
          key={step.video}
          ref={videoRef}
          className="steps-video"
          poster={step.poster}
          muted
          playsInline
          preload="none"
          aria-hidden="true"
          onTimeUpdate={(event) => { const v = event.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
          onEnded={handleEnded}
        >
          {step.webm && <source src={step.webm} type="video/webm" />}
          <source src={step.video} type="video/mp4" />
        </video>
        <span className={`steps-play-state ${playing ? "" : "is-paused"}`} aria-hidden="true">{playing ? "" : "Play"}</span>
      </button>
    </div>
    <p className="steps-mobile-caption" aria-live="polite">{step.summary}</p>
  </div>;
}
