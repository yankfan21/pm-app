import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import Spinner from './Spinner'

// Same targeted "ask follow-up questions" patch flow as CharterFollowUp.
function PostMortemFollowUp({ project, doc, onApplied, onClose }) {
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

    const { data, error } = await supabase.functions.invoke('post-mortem', {
      body: { action: 'followup', project, doc },
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

    const { data, error } = await supabase.functions.invoke('post-mortem', {
      body: { action: 'apply_followup', project, doc, answers: answerList },
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

    const { data: updatedRows, error: dbError } = await supabase
      .from('post_mortems')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select()

    if (dbError) {
      setError(dbError.message)
      setPhase('answering')
      return
    }

    if (!updatedRows || updatedRows.length === 0) {
      setError('Update failed — you may not have permission to edit this post-mortem.')
      setPhase('answering')
      return
    }

    onApplied(updatedRows[0])
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
            <p className="charter-status">
              <Spinner />
              Reviewing the post-mortem...
            </p>
          )}

          {phase === 'no-gaps' && (
            <>
              <p className="charter-status">
                No gaps found &mdash; this post-mortem looks complete.
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
              submitLabel="Update Post-Mortem"
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

export default PostMortemFollowUp
