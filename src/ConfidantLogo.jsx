// Brand mark: a rounded-square "app icon" container rotated into a diamond,
// containing an atom symbol (three overlapping ellipses at 0/60/120 deg
// around a shared center) - used at small size in AppHeader and larger on
// the Login screen, so it lives here once rather than being duplicated
// inline in both places.
//
// The two *fills* (diamond plate, nucleus) are gradients rather than the flat
// hex they used to be; the three orbit *strokes* are left alone, since they
// already form a deliberate three-tone family and gradient-stroking them
// would change the mark's read rather than polish it. Geometry is untouched.
//
// This component is NOT the source for anything in public/ - favicon.svg and
// the icon-*.png set are separate, hand-authored files carrying entirely
// different artwork (a compass, not this atom), so nothing here can drift out
// of sync with them. That divergence predates this change and is called out
// rather than silently "fixed", since picking which of the two marks is the
// real brand is a design decision, not a styling one.
//
// Gradient ids are fixed strings, not per-instance uniques: two ConfidantLogo
// instances never render on the same screen (AppHeader and Login are separate
// routes), and even if they did, the duplicate defs are byte-identical, so
// the first-wins resolution produces the same paint either way.
function ConfidantLogo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        {/* Runs corner-to-corner across the diamond - the gradient is in
            object-bounding-box units, so it rotates with the rect's own
            rotate(45) and stays aligned to the visible diamond axes. Three
            stops around the original flat #2a3a4a: a lifted top-left face,
            the original tone at the midpoint, a recessed bottom-right. */}
        <linearGradient id="confidant-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#35485e" />
          <stop offset="55%" stopColor="#2a3a4a" />
          <stop offset="100%" stopColor="#1e2b38" />
        </linearGradient>
        {/* Nucleus: hot white core falling off to the original #edf6fe at the
            rim, so the 2.5px dot reads as lit rather than as a flat chip. */}
        <radialGradient id="confidant-nucleus" cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#dceaf9" />
        </radialGradient>
      </defs>
      <rect x="10" y="10" width="28" height="28" rx="8" fill="url(#confidant-plate)" transform="rotate(45 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#a9cbec" strokeWidth="1.5" transform="rotate(0 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#77aadd" strokeWidth="1.5" transform="rotate(60 24 24)" />
      <ellipse cx="24" cy="24" rx="14" ry="6" fill="none" stroke="#cbe0f6" strokeWidth="1.5" transform="rotate(120 24 24)" />
      <circle cx="24" cy="24" r="2.5" fill="url(#confidant-nucleus)" />
    </svg>
  )
}

export default ConfidantLogo
