export function OfferMeter({ total, remaining }: { total: number; remaining: number }) {
  const claimed = total - remaining;
  return <div className="desktop-offer-meter">
    <div className="desktop-offer-meter-heading">
      <span>Spots at $49</span>
      <strong>{remaining} of {total} spots left</strong>
    </div>
    <div className="desktop-offer-meter-track" role="progressbar" aria-label="Desktop early bird spots claimed" aria-valuenow={claimed} aria-valuemin={0} aria-valuemax={total} aria-valuetext={`${claimed} of ${total} spots claimed`}>
      <span style={{ width: `${(claimed / total) * 100}%` }} />
    </div>
  </div>;
}
