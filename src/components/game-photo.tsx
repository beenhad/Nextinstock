type GamePhotoProps = {
  copy?: "current" | "next";
  className?: string;
  alt?: string;
};

const photos = {
  current: "https://i.ebayimg.com/images/g/Xx8AAeSwHNVpYYFS/s-l1600.webp",
  next: "https://i.ebayimg.com/images/g/XlQAAeSwp7tpYYFZ/s-l1600.webp",
};

export function GamePhoto({
  copy = "current",
  className = "",
  alt,
}: GamePhotoProps) {
  return (
    <div className={`game-photo game-photo-${copy} ${className}`.trim()}>
      {/* The seller supplied this eBay listing and owns the source photographs. */}
      <img
        src={photos[copy]}
        alt={alt ?? `Pokémon XD: Gale of Darkness ${copy} copy photograph`}
        draggable={false}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
