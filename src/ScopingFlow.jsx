import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import QaQuestion from './QaQuestion'
import LoadingButton from './LoadingButton'
import Spinner from './Spinner'

// Pure Q&A, no upload alternative, always auto-loads on mount - same shape as
// RiskLogFlow.jsx, since Scoping (like Risk Log) has no document-upload path.
// Scoping runs first in the wizard, so unlike RiskLogFlow it has no prior
// charter/brief context to fold in.
//
// Two-phase submit: 'evaluate' checks only the vital-tagged answers for
// substantiveness. A thin/missing vital answer surfaces a one-round nudge
// screen (reusing QaQuestion directly, not the full QaStepper chrome) rather
// than looping back through evaluate again - the PM either edits and saves,
// or explicitly continues anyway, and either way this is the end of the
// session either way.
function ScopingFlow({ project, initialAnswers, onGenerated, onClose }) {
  // initialAnswers (ScopingView's "Update Answers" path) reuses the PM's own
  // previously-recorded questions instead of re-fetching from the 'questions'
  // action - that call regenerates via Claude on every invoke, so a second
  // call here isn't guaranteed to return the same question set (or even the
  // same count) to prefill against. Saved qa_answers only kept
  // question/answer/vital (see buildAnswerList), not the original id/type/
  // choices, so choice-type questions fall back to freeform text on edit.
  const isEditing = !!initialAnswers
  const [phase, setPhase] = useState(isEditing ? 'answering' : 'loading-questions')
  const [questions, setQuestions] = useState(() =>
    isEditing
      ? initialAnswers.map((a, i) => ({ id: String(i), text: a.question, type: 'text', vital: !!a.vital }))
      : []
  )
  const [answers, setAnswers] = useState(() =>
    isEditing ? Object.fromEntries(initialAnswers.map((a, i) => [String(i), a.answer || ''])) : {}
  )
  const [followups, setFollowups] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isEditing) loadQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('scoping', {
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

  function buildAnswerList() {
    return questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({ question: q.text, answer: answers[q.id], vital: !!q.vital }))
  }

  async function finalize(answerList, sufficient, revertPhase) {
    const saveError = await onGenerated(answerList, sufficient)
    if (saveError) {
      setError(saveError)
      setPhase(revertPhase)
    }
  }

  async function handleSubmit() {
    setPhase('evaluating')
    setError(null)

    // evaluate needs every question, including ones left blank - a missing
    // vital answer is exactly what it's checking for, so filtering empties
    // out first (like buildAnswerList does for the final save) would hide
    // the very thing it's supposed to catch.
    const fullAnswers = questions.map((q) => ({
      id: q.id,
      question: q.text,
      answer: answers[q.id] || '',
      vital: !!q.vital,
    }))

    const { data, error } = await supabase.functions.invoke('scoping', {
      body: { action: 'evaluate', project, answers: fullAnswers },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    if (data.sufficient || !(data.followups || []).length) {
      await finalize(buildAnswerList(), true, 'answering')
      return
    }

    setFollowups(data.followups)
    setPhase('followup')
  }

  async function handleFollowupFinish() {
    setPhase('finalizing')
    setError(null)
    // PM addressed (or at least saw) every nudge - take the edited answers
    // at face value rather than re-running evaluate and risking a second
    // round of nagging over the same answers.
    await finalize(buildAnswerList(), true, 'followup')
  }

  async function handleContinueAnyway() {
    setPhase('finalizing')
    setError(null)
    await finalize(buildAnswerList(), false, 'followup')
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Scoping</h3>
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
            Thinking of a few scoping questions...
          </p>
        )}

        {phase === 'error' && (
          <>
            <p className="error">{error}</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={loadQuestions}>
                Retry
              </button>
            </div>
          </>
        )}

        {phase === 'answering' && questions.length === 0 && (
          <>
            <p className="charter-status">No scoping questions came back for this project.</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => finalize([], true, 'answering')}
              >
                Continue
              </button>
            </div>
          </>
        )}

        {(phase === 'answering' || phase === 'evaluating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleSubmit}
            submitLabel="Continue"
            loadingLabel="Checking..."
            submitting={phase === 'evaluating'}
            error={error}
            onCancel={onClose}
          />
        )}

        {(phase === 'followup' || phase === 'finalizing') && (
          <>
            <p className="charter-status">
              A few of the vital questions could use more detail before moving on.
            </p>

            {followups.map((f) => {
              const question = questions.find((q) => q.id === f.questionId)
              if (!question) return null
              return (
                <div className="scoping-followup" key={f.questionId}>
                  <p className="scoping-nudge">{f.prompt}</p>
                  <QaQuestion
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) =>
                      setAnswers((prev) => ({ ...prev, [question.id]: value }))
                    }
                  />
                </div>
              )
            })}

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                disabled={phase === 'finalizing'}
                onClick={handleContinueAnyway}
              >
                Continue Anyway
              </button>
              <LoadingButton
                className="btn-primary"
                loading={phase === 'finalizing'}
                loadingLabel="Saving..."
                onClick={handleFollowupFinish}
              >
                Save &amp; Finish
              </LoadingButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default ScopingFlow
