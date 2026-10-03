export function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="brand-mark brand-mark-compact" aria-label="Next" />
    );
  }

  return (
    <span className="brand-mark" aria-label="Next">
      <span className="brand-letter brand-letter-blue">n</span>
      <span className="brand-letter brand-letter-red">e</span>
      <span className="brand-letter brand-letter-yellow">x</span>
      <span className="brand-letter brand-letter-green">t</span>
    </span>
  );
}
