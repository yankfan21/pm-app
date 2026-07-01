import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function CharterFollowUp({ project, charter, onApplied, onClose }) {
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

    const { data, error } = await supabase.functions.invoke('charter', {
      body: { action: 'followup', project, charter },
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

    const { data, error } = await supabase.functions.invoke('charter', {
      body: { action: 'apply_followup', project, charter, answers: answerList },
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
      .from('charters')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', charter.id)
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
          <p className="step-label">The AI reviews your charter for gaps</p>

          {phase === 'loading-questions' && (
            <p className="charter-status">Reviewing the charter...</p>
          )}

          {phase === 'no-gaps' && (
            <>
              <p className="charter-status">
                No gaps found &mdash; this charter looks complete.
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
                Answer any that are relevant &mdash; skip the rest.
              </p>

              {questions.map((q) => (
                <label key={q.id}>
                  {q.text}
                  {q.type === 'choice' ? (
                    <div className="priority-buttons">
                      {q.choices.map((choice) => (
                        <button
                          type="button"
                          key={choice}
                          className={answers[q.id] === choice ? 'selected' : ''}
                          onClick={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: choice }))
                          }
                        >
                          {choice}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={answers[q.id] || ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    />
                  )}
                </label>
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
                  {phase === 'applying' ? 'Updating...' : 'Update Charter'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CharterFollowUp
