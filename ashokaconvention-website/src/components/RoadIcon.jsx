export default function RoadIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Road edges — perspective trapezoid */}
      <path
        d="M 10,92 L 38,14 L 62,14 L 90,92 Z"
        stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill="none"
      />

      {/* Horizon line */}
      <line x1="28" y1="14" x2="72" y2="14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />

      {/* Center dashes — shrink towards vanishing point */}
      <line x1="50" y1="83" x2="50" y2="72" stroke="currentColor" strokeWidth="3"   strokeLinecap="round" />
      <line x1="50" y1="64" x2="50" y2="56" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <line x1="50" y1="49" x2="50" y2="43" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="50" y1="37" x2="50" y2="33" stroke="currentColor" strokeWidth="1"   strokeLinecap="round" />
    </svg>
  )
}
