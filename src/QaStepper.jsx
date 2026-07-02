import { useState } from 'react'
import QaQuestion from './QaQuestion'

// Shared step-by-step Q&A pattern: one question per screen with a progress
// indicator and Back/Next nav. Used by every AI document flow (Charter,
// Requirements Brief, and their follow-up flows) so future document types
// get this UX for free instead of re-implementing it.
function QaStepper({
  questions,
  answers,
  onAnswerChange,
  onSubmit,
  submitLabel,
  loadingLabel,
  submitting,
  error,
  onCancel,
}) {
  const [step, setStep] = useState(0)
  const total = questions.length
  const question = questions[step]
  const isLast = step === total - 1

  if (!question) return null

  function handleNext() {
    if (isLast) onSubmit()
    else setStep((s) => Math.min(s + 1, total - 1))
  }

  function handleBack() {
    if (step === 0) onCancel()
    else setStep((s) => Math.max(s - 1, 0))
  }

  return (
    <div className="qa-stepper">
      <p className="step-label">
        Question {step + 1} of {total}
      </p>

      <QaQuestion
        question={question}
        value={answers[question.id]}
        onChange={(value) => onAnswerChange(question.id, value)}
      />

      {isLast && error && <p className="error">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="btn-secondary" onClick={handleBack}>
          {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={isLast && submitting}
          onClick={handleNext}
        >
          {isLast ? (submitting ? loadingLabel : submitLabel) : 'Next'}
        </button>
      </div>
    </div>
  )
}

export default QaStepper
