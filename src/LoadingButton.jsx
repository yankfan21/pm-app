import Spinner from './Spinner'

// Shared loading-state pattern for every AI-generation button: disables on
// click, swaps the label to its "-ing..." form, and shows an inline spinner,
// then reverts automatically once the caller's `loading` prop goes false
// (on success or error - error toasts/messages are handled by each caller
// as before, this component only owns the button's busy state).
function LoadingButton({ loading, loadingLabel, children, disabled, className = '', ...rest }) {
  return (
    <button
      type="button"
      className={className}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner />}
      {loading ? loadingLabel : children}
    </button>
  )
}

export default LoadingButton
