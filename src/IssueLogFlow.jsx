import { useState } from 'react'

// Issues Log has no AI Q&A generation path (unlike RiskLogFlow.jsx) - issues
// are things that DID/ARE happening, not something worth speculatively
// brainstorming from Charter/Brief context. This "Flow" is just the
// Documents checklist's not-yet-started entry point: one button that seeds
// a blank row and hands off straight to IssueLogView, matching how
// ExecutionRiskLogRoute already bypasses RiskLogFlow's AI Q&A for the same
// "flag it now" reasoning.
function newIssueRow() {
  return {
    id: crypto.randomUUID(),
    description: '',
    priority: 'Medium',
    owner: '',
    status: 'Open',
    resolution: '',
    resolution_date: '',
  }
}

function IssueLogFlow({ onGenerated, onClose }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  async function handleStart() {
    setStarting(true)
    setError(null)

    const saveError = await onGenerated([newIssueRow()], [])
    setStarting(false)
    if (saveError) setError(saveError)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Start Issues Log</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {error && <p className="error">{error}</p>}
        <p className="charter-status">
          Issues are logged manually as they come up, not AI-generated - start the log to add the
          first one.
        </p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleStart} disabled={starting}>
            {starting ? 'Starting...' : 'Start Issues Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default IssueLogFlow
