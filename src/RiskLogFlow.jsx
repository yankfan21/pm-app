import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import Spinner from './Spinner'

function RiskLogFlow({ project, charter, brief, onGenerated, onClose }) {
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

    const { data, error } = await supabase.functions.invoke('risk-log', {
      body: { action: 'questions', project, charter, brief },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    setQuestions(data.questions || [])
    setPhase('answering')
  }

  async function handleSubmit() {
    setPhase('generating')
    setError(null)

    const answerList = questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({
        question: q.text,
        answer: answers[q.id],
      }))

    const { data, error } = await supabase.functions.invoke('risk-log', {
      body: { action: 'generate', project, charter, brief, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const saveError = await onGenerated(data.risks || [], answerList)
    if (saveError) {
      setError(saveError)
      setPhase('answering')
    }
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Risk Log</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'loading-questions' && (
          <p className="charter-status">
            <Spinner />
            Checking what's already known...
          </p>
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
              Nothing genuinely missing &mdash; the project data already covers the basics. You
              can still generate a risk log from what's known.
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
                Generate Risk Log
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && questions.length === 0 && (
          <p className="charter-status">
            <Spinner />
            Generating...
          </p>
        )}

        {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleSubmit}
            submitLabel="Generate Risk Log"
            loadingLabel="Generating..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  )
}

export default RiskLogFlow
