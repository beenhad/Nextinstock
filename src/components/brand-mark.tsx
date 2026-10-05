export function BrandMark({ compact = false, tag = true }: { compact?: boolean; tag?: boolean }) {
  if (compact) {
    return (
      <span className="brand-mark brand-mark-compact" aria-label="Next in stock" />
    );
  }

  return (
    <span className="brand-mark" aria-label="Next in stock">
      <span className="brand-word" aria-hidden="true">
        <span className="brand-letter brand-letter-blue">n</span>
        <span className="brand-letter brand-letter-red">e</span>
        <span className="brand-letter brand-letter-yellow">x</span>
        <span className="brand-letter brand-letter-green">t</span>
      </span>
      {tag && <span className="brand-tag" aria-hidden="true"><span>in</span><span>stock</span></span>}
    </span>
  );
}
