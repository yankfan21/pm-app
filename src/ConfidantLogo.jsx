// Brand mark: a rounded-square "app icon" container rotated into a diamond,
// containing an atom symbol (three overlapping ellipses at 0/60/120 deg
// around a shared center) - used at small size in AppHeader and larger on
// the Login screen, so it lives here once rather than being duplicated
// inline in both places.
function ConfidantLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect x="10" y="10" width="28" height="28" rx="8" fill="#2d2a4a" transform="rotate(45 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#AFA9EC" strokeWidth="1.5" transform="rotate(0 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#7F77DD" strokeWidth="1.5" transform="rotate(60 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#CECBF6" strokeWidth="1.5" transform="rotate(120 24 24)" />
      <circle cx="24" cy="24" r="2.5" fill="#EEEDFE" />
    </svg>
  )
}

export default ConfidantLogo
