import { createPortal } from 'react-dom'

// Shared modal shell - the first portal-rendered thing in the codebase.
// Extracted so the Documents editor (DocumentsRoute.jsx) has a wide surface
// to live in; size="default" reproduces the hand-rolled .modal-overlay/.modal
// markup that NewProjectFlow.jsx and the four *FollowUp.jsx components still
// use inline, so those can be migrated onto this later without a visual diff.
//
// Deliberately NOT included (no other modal in the app has them either, so
// adding them here only would be inconsistent): focus trap, Esc-to-close,
// body scroll lock, aria-labelledby wiring to a caller-supplied title.
//
// z-index: see --z-modal / --z-modal-nested in App.css. A nested overlay
// (e.g. CharterFollowUp opened from CharterView inside a wide modal) is a DOM
// descendant of this portal, so it sits in this overlay's stacking context and
// paints above it.
function Modal({ onClose, size = 'default', children }) {
  // Save-on-blur is the editing model across every doc View (CharterView's
  // textarea onBlur -> saveSection, and the same shape elsewhere), so the
  // focused field MUST lose focus before React unmounts this subtree or the
  // pending edit is dropped silently. blur() dispatches focusout
  // synchronously, React's onBlur handler runs off it, and the resulting
  // Supabase write is already in flight by the time onClose() re-renders the
  // parent. Backdrop clicks blur on mousedown anyway; this covers the close
  // button and any programmatic close.
  function requestClose() {
    const active = document.activeElement
    if (active && typeof active.blur === 'function') active.blur()
    onClose?.()
  }

  // mousedown rather than click so a drag that starts inside the panel and
  // ends on the backdrop (text selection overshoot) doesn't close the modal.
  function handleBackdropMouseDown(e) {
    if (e.target === e.currentTarget) requestClose()
  }

  return createPortal(
    <div className="modal-overlay" onMouseDown={handleBackdropMouseDown}>
      <div className={`modal ${size === 'wide' ? 'modal--wide' : ''}`} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" onClick={requestClose} aria-label="Close">
          &times;
        </button>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body
  )
}

export default Modal
