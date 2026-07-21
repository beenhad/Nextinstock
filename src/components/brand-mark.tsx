import { Layers3 } from "lucide-react";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label="Nextinstock">
      <span className="brand-glyph" aria-hidden="true">
        <Layers3 size={17} strokeWidth={2.2} />
      </span>
      {!compact && <span>Nextinstock</span>}
    </span>
  );
}
