"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; window.clearTimeout(timer.current); }; }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      if (!mounted.current) return;
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked; the text is still selectable */ }
  }
  return <div className="copy-command">
    <div className="copy-command-bar">
      <span className="copy-command-dots" aria-hidden="true"><i /><i /><i /></span>
      <span>Terminal</span>
      <button type="button" onClick={() => void copy()} aria-label="Copy install commands">
        {copied ? <><Check size={13} aria-hidden="true" /> Copied</> : <><Copy size={13} aria-hidden="true" /> Copy</>}
      </button>
    </div>
    <pre><code>{command.split("\n").map((line) => <span key={line}><b aria-hidden="true">$ </b>{line}{"\n"}</span>)}</code></pre>
  </div>;
}
