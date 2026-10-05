export function OfferMeter({ total, remaining, preview = false }: { total: number; remaining: number; preview?: boolean }) {
  const claimed = total - remaining;
  const pct = Math.max(4, Math.round((claimed / total) * 100));
  return <div className="deal-bar">
    <div className="deal-bar-head">
      <span className="deal-bar-badge"><span className="deal-bar-dot" aria-hidden="true" />Launch price</span>
      <strong><b>{remaining}</b> of {total} left at $49</strong>
    </div>
    <div className="deal-bar-track" role="progressbar" aria-label="Launch price spots claimed" aria-valuenow={claimed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${claimed} of ${total} launch spots claimed`}>
      <span className="deal-bar-fill" style={{ width: `${pct}%` }} />
      {Array.from({ length: total - 1 }, (_, i) => <i key={i} style={{ left: `${((i + 1) / total) * 100}%` }} />)}
    </div>
    <small>{preview ? "Example count for local preview. Set the real count before launch." : "Goes to $99 when these are gone."}</small>
  </div>;
}
