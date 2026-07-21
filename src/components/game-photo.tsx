type GamePhotoProps = {
  copy?: "a" | "b" | "c";
  angle?: "front" | "back" | "disc" | "detail";
  className?: string;
  label?: string;
};

const copyColors = {
  a: { sky: "#d9e5ff", sun: "#ffbc57", land: "#4b67d0", accent: "#e95353" },
  b: { sky: "#d8efe8", sun: "#ffd16b", land: "#26816c", accent: "#7357d9" },
  c: { sky: "#eee0ff", sun: "#ffbd73", land: "#754ea2", accent: "#e44d75" },
};

export function GamePhoto({
  copy = "a",
  angle = "front",
  className = "",
  label,
}: GamePhotoProps) {
  const colors = copyColors[copy];
  const title = label ?? `Super Circuit 64, copy ${copy.toUpperCase()}, ${angle} view`;

  return (
    <div className={`game-photo ${className}`} role="img" aria-label={title}>
      <svg viewBox="0 0 360 300" aria-hidden="true">
        <defs>
          <linearGradient id={`bg-${copy}-${angle}`} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#f8faf8" />
            <stop offset="1" stopColor="#e7ebe8" />
          </linearGradient>
          <linearGradient id={`case-${copy}-${angle}`} x1="0" x2="1">
            <stop offset="0" stopColor="#202b4f" />
            <stop offset="0.08" stopColor="#3a4e86" />
            <stop offset="0.12" stopColor="#1b2341" />
            <stop offset="1" stopColor="#11182e" />
          </linearGradient>
          <filter id={`shadow-${copy}-${angle}`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#1b2220" floodOpacity="0.22" />
          </filter>
        </defs>
        <rect width="360" height="300" rx="18" fill={`url(#bg-${copy}-${angle})`} />
        <ellipse cx="180" cy="258" rx="112" ry="18" fill="#25302b" opacity="0.09" />

        {angle === "disc" ? (
          <g filter={`url(#shadow-${copy}-${angle})`}>
            <circle cx="180" cy="145" r="92" fill="#e8e9e7" stroke="#c5cbc8" strokeWidth="3" />
            <circle cx="180" cy="145" r="78" fill={colors.sky} opacity="0.86" />
            <path d="M108 165c32-41 70-54 144-22v63H108z" fill={colors.land} />
            <path d="M130 150c29-38 68-45 103-17" fill="none" stroke={colors.accent} strokeWidth="9" strokeLinecap="round" />
            <circle cx="180" cy="145" r="23" fill="#f8faf8" stroke="#aeb7b2" strokeWidth="4" />
            <circle cx="180" cy="145" r="7" fill="#c8ceca" />
            <text x="180" y="104" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="800" fill="#17233b">SUPER CIRCUIT</text>
            <text x="180" y="121" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="10" fontWeight="700" letterSpacing="2" fill="#17233b">64</text>
            {copy === "a" && <path d="M112 207l22-5" stroke="#afb4b1" strokeWidth="2" opacity="0.8" />}
          </g>
        ) : angle === "detail" ? (
          <g filter={`url(#shadow-${copy}-${angle})`}>
            <path d="M72 84h216v142H72z" fill="#e5e8e6" stroke="#c8ceca" strokeWidth="3" />
            <path d="M72 84h216v32H72z" fill="#d4d9d6" />
            <path d="M92 137h145M92 157h173M92 177h122" stroke="#8b9691" strokeWidth="7" strokeLinecap="round" opacity="0.55" />
            <circle cx="260" cy="178" r="16" fill={colors.accent} opacity="0.8" />
            {copy === "a" ? (
              <g>
                <path d="M72 84l22 7-12 17" fill="#c0c5c2" />
                <path d="M77 214l27-7" stroke="#a99f93" strokeWidth="5" strokeLinecap="round" />
                <text x="180" y="247" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fill="#59635f">light corner wear</text>
              </g>
            ) : (
              <text x="180" y="247" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="12" fill="#59635f">clean manual edges</text>
            )}
          </g>
        ) : (
          <g transform={angle === "back" ? "translate(310 22) scale(-1 1)" : "translate(73 22)"} filter={`url(#shadow-${copy}-${angle})`}>
            <rect x="0" y="0" width="214" height="238" rx="7" fill={`url(#case-${copy}-${angle})`} />
            <rect x="15" y="10" width="184" height="218" rx="2" fill={colors.sky} />
            {angle === "front" ? (
              <g>
                <circle cx="151" cy="59" r="35" fill={colors.sun} />
                <path d="M15 144c51-65 99-74 184-25v109H15z" fill={colors.land} />
                <path d="M35 152c38-55 83-65 137-27" fill="none" stroke="#f7f9f5" strokeWidth="10" strokeLinecap="round" opacity="0.85" />
                <path d="M47 162c43-41 81-43 118-15" fill="none" stroke={colors.accent} strokeWidth="7" strokeLinecap="round" />
                <text x="107" y="47" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="900" fill="#18223c">SUPER</text>
                <text x="107" y="70" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="19" fontWeight="900" fill="#18223c">CIRCUIT 64</text>
                <rect x="26" y="198" width="34" height="20" rx="3" fill="#f8faf8" opacity="0.9" />
                <text x="43" y="212" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="9" fontWeight="800" fill="#17213a">E</text>
                {copy === "a" && <path d="M189 178l9 19" stroke="#e6dccb" strokeWidth="5" opacity="0.75" />}
              </g>
            ) : (
              <g transform="translate(214 0) scale(-1 1)">
                <rect x="29" y="30" width="156" height="57" rx="5" fill="#f8faf8" opacity="0.84" />
                <path d="M43 104h124M43 122h108M43 140h130" stroke="#f7f9f5" strokeWidth="7" strokeLinecap="round" opacity="0.65" />
                <rect x="34" y="164" width="65" height="40" rx="4" fill={colors.sun} opacity="0.9" />
                <rect x="108" y="164" width="72" height="40" rx="4" fill={colors.accent} opacity="0.75" />
              </g>
            )}
            <path d="M7 10v218" stroke="#7082b6" strokeWidth="2" opacity="0.55" />
          </g>
        )}
      </svg>
    </div>
  );
}
