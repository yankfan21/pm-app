import { useState } from 'react'

// Logging a Status Update is a plain dated form, not an AI Q&A wizard - the
// PM writes free text for whichever of the three prompts are relevant and
// leaves the rest blank. No edge function call: the fields are inserted
// as-is via onGenerated, same callback shape the other Flow components use
// so ProjectDetail.jsx doesn't need a separate code path to save it.
function StatusUpdateFlow({ onGenerated, onClose }) {
  const [whatGotDone, setWhatGotDone] = useState('')
  const [whatsBlocked, setWhatsBlocked] = useState('')
  const [whatsComingUp, setWhatsComingUp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const saveError = await onGenerated({
      what_got_done: whatGotDone.trim() || null,
      whats_blocked: whatsBlocked.trim() || null,
      whats_coming_up: whatsComingUp.trim() || null,
    })

    setSubmitting(false)
    if (saveError) setError(saveError)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Log Status Update</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <form className="modal-step" onSubmit={handleSubmit}>
        <div className="charter-doc-section">
          <h4 className="charter-doc-heading">What got done</h4>
          <textarea
            className="charter-doc-body"
            value={whatGotDone}
            onChange={(e) => setWhatGotDone(e.target.value)}
            rows={3}
            placeholder="What got done this week..."
          />
        </div>

        <div className="charter-doc-section">
          <h4 className="charter-doc-heading">What's blocked</h4>
          <textarea
            className="charter-doc-body"
            value={whatsBlocked}
            onChange={(e) => setWhatsBlocked(e.target.value)}
            rows={3}
            placeholder="Anything blocked or stuck..."
          />
        </div>

        <div className="charter-doc-section">
          <h4 className="charter-doc-heading">What's coming up</h4>
          <textarea
            className="charter-doc-body"
            value={whatsComingUp}
            onChange={(e) => setWhatsComingUp(e.target.value)}
            rows={3}
            placeholder="What's coming up next..."
          />
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Log Status Update'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default StatusUpdateFlow
