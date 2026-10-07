"use client";

import { useEffect } from "react";

// Spells n → e → x → t in the eBay colors.
const otherLetters = ["/favicon-e.png", "/favicon-x.png", "/favicon-t.png"];

export function FaviconCycle() {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) return;

    const blueIcon = icon.href;
    const colors = [blueIcon, ...otherLetters];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let current = 0;

    const reset = () => {
      current = 0;
      icon.href = blueIcon;
    };
    const tick = () => {
      if (document.hidden || reducedMotion.matches) return;
      current = (current + 1) % colors.length;
      icon.href = colors[current];
    };
    const onVisibilityChange = () => {
      if (!document.hidden) reset();
    };
    const onMotionChange = () => {
      if (reducedMotion.matches) reset();
    };

    const timer = window.setInterval(tick, 2600);
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotion.addEventListener("change", onMotionChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotion.removeEventListener("change", onMotionChange);
      reset();
    };
  }, []);

  return null;
}
