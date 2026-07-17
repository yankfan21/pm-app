// Single source of the inline spinner markup - same visual used by
// LoadingButton's busy state and by the "request in flight" status screens
// in the Q&A/generation modals, so both draw from the same .btn-spinner
// CSS/@keyframes in App.css.
function Spinner() {
  return <span className="btn-spinner" aria-hidden="true" />
}

export default Spinner
