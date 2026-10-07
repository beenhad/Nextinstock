"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

const clip = (name: string) => ({ video: `/demos/${name}.mp4?v=11`, poster: `/demos/${name}.jpg?v=11` });

const steps = [
  {
    title: "Pick the listing", short: "Pick",
    summary: "Paste the item number of a listing you have more than one of.",
    ...clip("choose"), fit: "fill",
  },
  {
    title: "Line up your copies", short: "Line up",
    summary: "Different condition? Give a copy its own photos, grade, and price. Identical? Stack as many as you have.",
    ...clip("prepare"), fit: "fill",
  },
  {
    title: "Set the pace", short: "Pace",
    summary: "Raise the price with each sale, wait between releases, or hold a copy until you say so.",
    ...clip("pace"), fit: "fill",
  },
  {
    title: "It sells, the next one goes up", short: "Restock",
    summary: "The next copy goes live on the same item number. Same listing, same sold count.",
    ...clip("restock"), fit: "fill",
  },
  {
    title: "Get the alert", short: "Alert",
    summary: "Discord tells you what sold and what went up. A copy waiting on you comes with a Put it up link.",
    ...clip("discord"), fit: "framed",
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
    <div className={`steps-stage is-${step.fit}`} id="steps-panel" role="tabpanel" aria-labelledby={`steps-tab-${activeIndex}`}>
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
          <source src={step.video} type="video/mp4" />
        </video>
        <span className={`steps-play-state ${playing ? "" : "is-paused"}`} aria-hidden="true">{playing ? "" : "Play"}</span>
      </button>
    </div>
    <p className="steps-mobile-caption" aria-live="polite">{step.summary}</p>
  </div>;
}
