// CalmSky_Redesign mark: an open C ring with a milestone diamond. Only shown
// when VITE_CALMSKY_REDESIGN is on; production keeps the stacked-pages mark.
const CALMSKY = import.meta.env.VITE_CALMSKY_REDESIGN === 'true'

export default function ConfidantLogo({ size = 32, className = '' }) {
  if (CALMSKY) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M50 18 A22 22 0 1 0 50 46"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path d="M34 24 L42 32 L34 40 L26 32Z" fill="var(--accent)" />
      </svg>
    )
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect x="10" y="8" width="16" height="20" rx="3" fill="#35485e" />
      <rect x="6" y="5" width="16" height="20" rx="3" fill="#dceaf9" />
      <circle cx="20" cy="8" r="3.2" fill="var(--accent-strong)" />
    </svg>
  );
}
