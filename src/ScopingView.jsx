import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import Spinner from './Spinner'
import ScopingFlow from './ScopingFlow'

// Scoping has no narrative sections (unlike Charter) and no structured row
// table (unlike Risk Log) - just a flat list of Q&A pairs plus the
// `sufficient` flag ScopingFlow's end-of-session evaluate check set. That
// call's followups ({questionId, prompt}) aren't persisted anywhere, so a
// thin scoping doc re-runs the same 'evaluate' action on mount to show which
// vital answers were flagged, reusing ScopingFlow's own followup shape
// rather than re-deriving "thin" with separate client-side logic.
function ScopingView({ project, scoping, canEdit, onUpdate }) {
  const [followups, setFollowups] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)

  const answers = scoping.qa_answers || []

  useEffect(() => {
    // Reset on every scoping change (not just mount) so an edit that flips
    // sufficient true<->false clears a stale nudge/error from the answers it
    // replaced.
    setFollowups(null)
    setError(null)
    if (scoping.sufficient !== false) return

    let cancelled = false

    async function checkFollowups() {
      const { data, error } = await supabase.functions.invoke('scoping', {
        body: {
          action: 'evaluate',
          project,
          // Stored qa_answers dropped the question `id` the evaluate action
          // keys followups off of (only non-empty question/answer/vital
          // survive into the saved row) - the array index stands in for it
          // here, then maps each returned followup straight back to the
          // answer it belongs to.
          answers: answers.map((a, i) => ({ ...a, id: String(i) })),
        },
      })

      if (cancelled) return
      if (error || data?.error) {
        setError(error?.message || data.error)
        return
      }
      setFollowups(data.followups || [])
    }

    checkFollowups()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoping.id, scoping.sufficient, scoping.qa_answers])

  async function handleUpdateSubmit(answerList, sufficient) {
    const { data, error: updateError } = await supabase
      .from('scopings')
      .update({ qa_answers: answerList, sufficient })
      .eq('id', scoping.id)
      .select()
      .single()

    if (updateError) return updateError.message

    onUpdate(data)
    setEditing(false)
    return null
  }

  if (editing) {
    return (
      <ScopingFlow
        project={project}
        initialAnswers={answers}
        onGenerated={handleUpdateSubmit}
        onClose={() => setEditing(false)}
      />
    )
  }

  return (
    <div className="charter">
      {canEdit && (
        <div className="section-header">
          <div className="charter-actions">
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              Update Answers
            </button>
          </div>
        </div>
      )}

      <ul className="qa-list">
        {answers.map((a, i) => (
          <li className="qa-item" key={i}>
            <p className="qa-question">
              {a.question}
              {a.vital && <span className="qa-vital-badge">Vital</span>}
            </p>
            <p className="qa-answer">{a.answer || <em>No answer given</em>}</p>
          </li>
        ))}
        {answers.length === 0 && <li className="empty">No scoping answers recorded</li>}
      </ul>

      {scoping.sufficient === false && (
        <div className="scoping-thin-section">
          <p className="charter-status">
            A few vital answers were flagged as thin when this scoping session was saved:
          </p>

          {error && <p className="error">{error}</p>}

          {!followups && !error && (
            <p className="charter-status">
              <Spinner />
              Checking which answers were flagged...
            </p>
          )}

          {followups && followups.length === 0 && (
            <p className="charter-status">
              No specific nudges came back - worth re-checking the vital answers above anyway.
            </p>
          )}

          {followups?.map((f) => {
            const answer = answers[Number(f.questionId)]
            if (!answer) return null
            return (
              <div className="scoping-followup" key={f.questionId}>
                <p className="scoping-nudge">{f.prompt}</p>
                <p className="qa-question">{answer.question}</p>
                <p className="qa-answer">{answer.answer || <em>No answer given</em>}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ScopingView
