export default function WeddingHallIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Roof / pediment */}
      <polyline
        points="8,36 50,6 92,36"
        stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round"
      />

      {/* Left pillar */}
      <line x1="16" y1="36" x2="16" y2="88" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
      {/* Right pillar */}
      <line x1="84" y1="36" x2="84" y2="88" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />

      {/* Base */}
      <line x1="8" y1="88" x2="92" y2="88" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />

      {/* Left curtain drape */}
      <path
        d="M16,38 C22,48 18,60 24,72 C20,76 16,80 16,88"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />
      {/* Right curtain drape */}
      <path
        d="M84,38 C78,48 82,60 76,72 C80,76 84,80 84,88"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"
      />

      {/* Heart */}
      <path
        d="M50,72 C50,72 32,60 32,49 C32,42 37,38 43,40 C46,41 50,45 50,45 C50,45 54,41 57,40 C63,38 68,42 68,49 C68,60 50,72 50,72 Z"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" fill="none"
      />
    </svg>
  )
}
