import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaQuestion from './QaQuestion'

function RequirementsFlow({ project, charter, onGenerated, onClose }) {
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
      body: { action: 'questions', project, charter },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    setQuestions(data.questions || [])
    setPhase('answering')
  }

  const anyAnswered = questions.some((q) => (answers[q.id] || '').trim() !== '')

  async function handleSubmit() {
    setPhase('generating')
    setError(null)

    const answerList = questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({
        question: q.text,
        answer: answers[q.id],
      }))

    const { data, error } = await supabase.functions.invoke('requirements', {
      body: { action: 'generate', project, charter, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const saveError = await onGenerated(data, answerList)
    if (saveError) {
      setError(saveError)
      setPhase('answering')
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>

        <div className="modal-step">
          <h2>Generate Requirements Brief</h2>
          <p className="step-label">
            A few discovery questions, skipping anything already covered by this project
            {charter ? ' or its charter' : ''}
          </p>

          {phase === 'loading-questions' && (
            <p className="charter-status">Checking what's already known...</p>
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

          {phase === 'answering' && questions.length === 0 && (
            <>
              <p className="charter-status">
                Nothing genuinely missing &mdash; the project data
                {charter ? ' and charter' : ''} already cover the basics. You can still generate
                a brief from what's known.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button type="button" className="btn-primary" onClick={handleSubmit}>
                  Generate Requirements Brief
                </button>
              </div>
            </>
          )}

          {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
            <>
              <p className="step-label">
                Answer what's relevant, edit or dismiss any AI suggestions, and skip the rest.
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
                  disabled={!anyAnswered || phase === 'generating'}
                  onClick={handleSubmit}
                >
                  {phase === 'generating' ? 'Generating...' : 'Generate Requirements Brief'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default RequirementsFlow
