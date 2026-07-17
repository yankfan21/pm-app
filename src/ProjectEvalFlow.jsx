import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { todayLocalDateString } from './ganttLayout'
import Spinner from './Spinner'

// Evaluate Project has no Q&A intake and no PM editing - it's a read-only
// diagnostic snapshot, not a co-authored document, so this Flow just runs
// the evaluation immediately on mount and hands the result to onGenerated.
// "today" is computed locally (not server-side) for the same reason
// GanttChart does - comparing due dates against the viewer's actual local
// calendar day, not whatever day it happens to be in the edge function's
// server timezone.
function ProjectEvalFlow({ project, charter, riskLog, budget, tasks, statusUpdates, sprints, retros, milestones, onGenerated, onClose }) {
  const [phase, setPhase] = useState('evaluating')
  const [error, setError] = useState(null)
  // Unlike the other Flow components' mount effect (which only fetches
  // Q&A questions - harmless if it runs twice), this one auto-inserts a row
  // on success with no PM confirmation step in between. StrictMode
  // deliberately double-invokes mount effects in dev, which would otherwise
  // fire two real evaluations (and two inserts) from one click - this ref
  // survives that remount and makes sure the real work only runs once.
  const hasRunRef = useRef(false)

  useEffect(() => {
    if (hasRunRef.current) return
    hasRunRef.current = true
    runEvaluation()
  }, [])

  async function runEvaluation() {
    setPhase('evaluating')
    setError(null)

    const { data, error } = await supabase.functions.invoke('project-eval', {
      body: {
        action: 'evaluate',
        project,
        charter,
        riskLog,
        budget,
        tasks,
        statusUpdates,
        sprints,
        retros,
        milestones,
        today: todayLocalDateString(),
      },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    const saveError = await onGenerated(data)
    if (saveError) {
      setError(saveError)
      setPhase('error')
    }
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Evaluate Project</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'evaluating' && (
          <p className="charter-status">
            <Spinner />
            Reviewing the charter, risk log, budget, and status history, plus milestones/tasks or
            sprints/backlog/retros depending on methodology...
          </p>
        )}

        {phase === 'error' && (
          <>
            <p className="error">{error}</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={runEvaluation}>
                Retry
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ProjectEvalFlow
