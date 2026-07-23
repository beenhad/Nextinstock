export function BrandMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <span className="brand-mark brand-mark-compact" aria-label="Nextinstock">
        <span className="brand-letter brand-letter-blue">n</span>
      </span>
    );
  }

  return (
    <span className="brand-mark" aria-label="Nextinstock">
      <span className="brand-letter brand-letter-blue">n</span>
      <span className="brand-letter brand-letter-red">e</span>
      <span className="brand-letter brand-letter-yellow">x</span>
      <span className="brand-letter brand-letter-green">t</span>
      <span className="brand-tail">instock</span>
    </span>
  );
}
