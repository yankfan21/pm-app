import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

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

  const allAnswered = questions.every((q) => (answers[q.id] || '').trim() !== '')

  async function handleSubmit() {
    setPhase('generating')
    setError(null)

    const answerList = questions.map((q) => ({
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
    <div className="modal-overlay">
      <div className="modal">
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>

        <div className="modal-step">
          <h2>Generate Charter</h2>
          <p className="step-label">
            A few quick questions to fill in the gaps
          </p>

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
            <>
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
                  disabled={!allAnswered || phase === 'generating'}
                  onClick={handleSubmit}
                >
                  {phase === 'generating' ? 'Generating...' : 'Generate Charter'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default CharterFlow
