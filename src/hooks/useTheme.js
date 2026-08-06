// ConfidantPM is a single permanent dark-navy theme now - no light mode, no
// system-preference switching. This hook is kept only so App.jsx's existing
// call site (which stamps data-theme="dark" on <html> before first paint,
// mirroring the inline snippet in index.html) doesn't need touching.
export function useTheme() {
  return { theme: 'dark' }
}

export default useTheme
