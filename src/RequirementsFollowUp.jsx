import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaQuestion from './QaQuestion'

function RequirementsFollowUp({ project, brief, onApplied, onClose }) {
  const [phase, setPhase] = useState('loading-questions')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('requirements', {
      body: { action: 'followup', project, brief },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    const qs = data.questions || []
    if (qs.length === 0) {
      setPhase('no-gaps')
      return
    }

    setQuestions(qs)
    setPhase('answering')
  }

  const anyAnswered = questions.some((q) => (answers[q.id] || '').trim() !== '')

  async function handleSubmit() {
    setPhase('applying')
    setError(null)

    const answerList = questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({
        question: q.text,
        answer: answers[q.id],
        sections: q.sections || [],
      }))

    const { data, error } = await supabase.functions.invoke('requirements', {
      body: { action: 'apply_followup', project, brief, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const updates = data.updates || {}
    if (Object.keys(updates).length === 0) {
      setError('No sections needed updating based on those answers.')
      setPhase('answering')
      return
    }

    const { data: updatedRow, error: dbError } = await supabase
      .from('requirements_briefs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', brief.id)
      .select()
      .single()

    if (dbError) {
      setError(dbError.message)
      setPhase('answering')
      return
    }

    onApplied(updatedRow)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>

        <div className="modal-step">
          <h2>Ask Follow-up Questions</h2>
          <p className="step-label">The AI reviews your requirements brief for gaps</p>

          {phase === 'loading-questions' && (
            <p className="charter-status">Reviewing the brief...</p>
          )}

          {phase === 'no-gaps' && (
            <>
              <p className="charter-status">
                No gaps found &mdash; this brief looks complete.
              </p>
              <div className="modal-actions">
                <button type="button" className="btn-primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}

          {phase === 'error' && (
            <>
              <p className="error">{error}</p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={loadQuestions}
                >
                  Retry
                </button>
              </div>
            </>
          )}

          {(phase === 'answering' || phase === 'applying') && (
            <>
              <p className="charter-status">
                Answer any that are relevant, edit or dismiss any AI suggestions, and skip the
                rest.
              </p>

              {questions.map((q) => (
                <QaQuestion
                  key={q.id}
                  question={q}
                  value={answers[q.id]}
                  onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                />
              ))}

              {error && <p className="error">{error}</p>}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!anyAnswered || phase === 'applying'}
                  onClick={handleSubmit}
                >
                  {phase === 'applying' ? 'Updating...' : 'Update Brief'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default RequirementsFollowUp
