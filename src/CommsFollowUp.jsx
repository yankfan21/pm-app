import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import { COMMS_VARIANTS } from './commsSections'

// Shared "ask follow-up questions" revise flow for both Stakeholder Comms
// Plan document types. See CommsFlow.jsx for why this is one parameterized
// component rather than two near-duplicate files.
function CommsFollowUp({ variant, project, doc, onApplied, onClose }) {
  const { table, title } = COMMS_VARIANTS[variant]
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

    const { data, error } = await supabase.functions.invoke('comms-plan', {
      body: { action: 'followup', variant, project, doc },
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

    const { data, error } = await supabase.functions.invoke('comms-plan', {
      body: { action: 'apply_followup', variant, project, doc, answers: answerList },
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
      .from(table)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
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

          {phase === 'loading-questions' && (
            <p className="charter-status">Reviewing the {title.toLowerCase()}...</p>
          )}

          {phase === 'no-gaps' && (
            <>
              <p className="charter-status">
                No gaps found &mdash; this {title.toLowerCase()} looks complete.
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
            <QaStepper
              questions={questions}
              answers={answers}
              onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
              onSubmit={handleSubmit}
              submitLabel={`Update ${title}`}
              loadingLabel="Updating..."
              submitting={phase === 'applying'}
              error={error}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default CommsFollowUp
