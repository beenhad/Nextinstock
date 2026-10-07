"use client";

import { useEffect } from "react";

// Images and videos can't be dragged out of the page. Dropping files onto the tool still works.
export function NoImageDrag() {
  useEffect(() => {
    const block = (event: DragEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "IMG" || target.tagName === "VIDEO" || target.tagName === "PICTURE")) event.preventDefault();
    };
    document.addEventListener("dragstart", block);
    return () => document.removeEventListener("dragstart", block);
  }, []);
  return null;
}
