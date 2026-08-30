import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import QaQuestion from './QaQuestion'
import LoadingButton from './LoadingButton'
import Spinner from './Spinner'

// Stage order for a fresh (non-editing) scoping session. Stage 2
// (methodology suggestion) doesn't exist yet - it lands between these two
// in a later session. STAGE_TOTAL is fixed at 3 now (rather than
// STAGE_ORDER.length) so the "Stage X of 3" indicator doesn't need to
// change again when that stage is added.
const STAGE_ORDER = ['initiation', 'risk']
const STAGE_TOTAL = 3
const STAGE_LABELS = { initiation: 'Project Initiation', risk: 'Risk' }
const STAGE_NUMBERS = { initiation: 1, risk: 3 }

// One stage's full Q&A session: loads questions (or reconstructs them from
// initialAnswers, for the editing path), runs the answering ->
// evaluate -> followup cycle, and calls onComplete(answerList, sufficient)
// exactly once when the PM finishes this stage. onComplete may itself be
// async and return an error string to reject the completion (e.g. a save
// failure) - on rejection this reverts to whatever phase it was called
// from and shows the error, same as the old single-stage finalize() did.
//
// Two-phase submit per stage: 'evaluate' checks only the vital-tagged
// answers for substantiveness. A thin/missing vital answer surfaces a
// one-round nudge screen (reusing QaQuestion directly, not the full
// QaStepper chrome) rather than looping back through evaluate again - the
// PM either edits and saves, or explicitly continues anyway, and either
// way this is the end of the stage either way.
function ScopingStage({ project, stage, initialAnswers, onComplete, onClose }) {
  // initialAnswers (ScopingView's "Update Answers" edit path) reuses the
  // PM's own previously-recorded questions instead of re-fetching from the
  // 'questions' action - that call regenerates via Claude on every invoke,
  // so a second call here isn't guaranteed to return the same question set
  // (or even the same count) to prefill against. Saved qa_answers only kept
  // question/answer/vital until this pass (see buildAnswerList), so
  // choice-type questions still fall back to freeform text on edit - fixing
  // that reconstruction is a later session's work, not this one.
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
      body: { action: 'questions', project, stage },
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
      .map((q) => ({
        id: q.id,
        question: q.text,
        answer: answers[q.id],
        vital: !!q.vital,
        type: q.type,
        ...(q.choices ? { choices: q.choices } : {}),
        stage,
      }))
  }

  async function finalize(answerList, sufficient, revertPhase) {
    const completeError = await onComplete(answerList, sufficient)
    if (completeError) {
      setError(completeError)
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
      body: { action: 'evaluate', project, answers: fullAnswers, stage },
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

  // Re-runs 'evaluate' against whatever's currently in the answer fields,
  // then persists whatever sufficient value comes back - unlike the old
  // two-button split, this never hardcodes true or false, so an answer
  // fixed on this screen actually lands as sufficient: true.
  async function handleFollowupFinish() {
    setPhase('finalizing')
    setError(null)

    const fullAnswers = questions.map((q) => ({
      id: q.id,
      question: q.text,
      answer: answers[q.id] || '',
      vital: !!q.vital,
    }))

    const { data, error } = await supabase.functions.invoke('scoping', {
      body: { action: 'evaluate', project, answers: fullAnswers, stage },
    })

    if (error || data?.error) {
      setError(error?.message || data.error || "Couldn't check your answers — please try again.")
      setPhase('followup')
      return
    }

    await finalize(buildAnswerList(), data.sufficient, 'followup')
  }

  return (
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
            <LoadingButton
              className="btn-primary"
              loading={phase === 'finalizing'}
              loadingLabel="Checking..."
              onClick={handleFollowupFinish}
            >
              Save &amp; Finish
            </LoadingButton>
          </div>
        </>
      )}
    </div>
  )
}

// Drives the Initiation -> Risk sequence for a fresh (non-editing) scoping
// session. Each stage runs its own independent ScopingStage instance
// (remounted via key={stage} so loading-questions/answering/evaluate state
// doesn't leak between stages); onGenerated is still called exactly once,
// after Risk (the last stage) completes, with the two stages' answer lists
// concatenated and an overall sufficient that's true only if both stages
// were.
function ScopingWizard({ project, onGenerated, onClose }) {
  const [stageIndex, setStageIndex] = useState(0)
  const [initiationResult, setInitiationResult] = useState(null)

  const stage = STAGE_ORDER[stageIndex]

  async function handleStageComplete(answerList, sufficient) {
    if (stage === 'initiation') {
      setInitiationResult({ answers: answerList, sufficient })
      setStageIndex(1)
      return null
    }

    const combined = [...(initiationResult?.answers || []), ...answerList]
    const overallSufficient = (initiationResult?.sufficient ?? true) && sufficient
    return await onGenerated(combined, overallSufficient)
  }

  return (
    <>
      <p className="step-label">
        Stage {STAGE_NUMBERS[stage]} of {STAGE_TOTAL}: {STAGE_LABELS[stage]}
      </p>
      <ScopingStage
        key={stage}
        project={project}
        stage={stage}
        onComplete={handleStageComplete}
        onClose={onClose}
      />
    </>
  )
}

// Pure Q&A, no upload alternative, always auto-loads on mount - same shape
// as RiskLogFlow.jsx, since Scoping (like Risk Log) has no document-upload
// path. Scoping runs first in the wizard, so unlike RiskLogFlow it has no
// prior charter/brief context to fold in.
function ScopingFlow({ project, initialAnswers, onGenerated, onClose }) {
  const isEditing = !!initialAnswers

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

      {isEditing ? (
        // Edit path predates the stage split and still edits the saved
        // answers as one flat list rather than per-stage - fixed at the
        // "risk" stage name since that's the stage whose Edge Function
        // prompt is the original (pre-split) scoping question set, so
        // evaluate behavior for edited answers is unchanged from before
        // this rework. Reworking this to edit per-stage is a later
        // session's work.
        <ScopingStage
          project={project}
          stage="risk"
          initialAnswers={initialAnswers}
          onComplete={onGenerated}
          onClose={onClose}
        />
      ) : (
        <ScopingWizard project={project} onGenerated={onGenerated} onClose={onClose} />
      )}
    </div>
  )
}

export default ScopingFlow
