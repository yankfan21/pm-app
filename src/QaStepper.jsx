import { useState } from 'react'
import QaQuestion from './QaQuestion'
import LoadingButton from './LoadingButton'

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
      {/* Segmented progress, one segment per question. Purely visual - the
          text label below carries the same information for screen readers
          that don't announce progressbar roles. */}
      <div
        className="qa-progress"
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
      >
        {questions.map((q, i) => (
          <span key={q.id} className={i <= step ? 'on' : ''} aria-hidden="true" />
        ))}
      </div>

      <p className="step-label">
        Question {step + 1} of {total}
      </p>

      <div className="qa-card">
        {/* key: each question gets a fresh QaQuestion, so dismissing one
            question's suggestion no longer hides the next one's. */}
        <QaQuestion
          key={question.id}
          question={question}
          value={answers[question.id]}
          onChange={(value) => onAnswerChange(question.id, value)}
        />

        {isLast && error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={handleBack}>
            {step === 0 ? 'Cancel' : 'Back'}
          </button>
          <LoadingButton
            className="btn-primary"
            loading={isLast && submitting}
            loadingLabel={loadingLabel}
            onClick={handleNext}
          >
            {isLast ? submitLabel : 'Next'}
          </LoadingButton>
        </div>
      </div>
    </div>
  )
}

export default QaStepper
