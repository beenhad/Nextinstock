"use client";

import { useEffect } from "react";

const otherColors = ["/favicon-red.svg", "/favicon-yellow.svg", "/favicon-green.svg"];

export function FaviconCycle() {
  useEffect(() => {
    const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"][type="image/svg+xml"]');
    if (!icon) return;

    const blueIcon = icon.href;
    const colors = [blueIcon, ...otherColors];
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
