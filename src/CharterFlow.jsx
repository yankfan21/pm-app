import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'

function CharterFlow({ project, onGenerated, onClose }) {
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
      body: { action: 'questions', project },
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

    const { data, error } = await supabase.functions.invoke('charter', {
      body: { action: 'generate', project, answers: answerList },
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
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Charter</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'loading-questions' && (
          <p className="charter-status">Thinking of a few questions...</p>
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

        {(phase === 'answering' || phase === 'generating') && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleSubmit}
            submitLabel="Generate Charter"
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

export default CharterFlow
