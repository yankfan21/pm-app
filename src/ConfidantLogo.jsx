export default function ConfidantLogo({ size = 32, className = '' }) {
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
