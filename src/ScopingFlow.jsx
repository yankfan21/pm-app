import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import QaQuestion from './QaQuestion'
import LoadingButton from './LoadingButton'
import Spinner from './Spinner'
import Modal from './components/Modal'
import { METHODOLOGY_LABELS } from './methodology'

// Numbered stages for a fresh (non-editing) scoping session. The
// methodology-suggestion step sits between them but isn't numbered - it's
// an assistant-driven checkpoint, not a Q&A stage of its own - so
// STAGE_TOTAL stays fixed at 3 and Risk still reads "Stage 3 of 3"
// immediately after it.
const STAGE_TOTAL = 3
const STAGE_LABELS = { initiation: 'Project Scope & Goals', risk: 'Initial Risk Assessment' }
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
  // (or even the same count) to prefill against. Answers saved before
  // commit 6238278 only kept question/answer/vital, so those still fall
  // back to a synthetic id and freeform text below - only fixable by
  // re-answering, not by a smarter reconstruction.
  const isEditing = !!initialAnswers
  const [phase, setPhase] = useState(isEditing ? 'answering' : 'loading-questions')
  // Answers saved after commit 6238278 carry their own id/type/choices/
  // stage - reconstruct from those when present so a choice question
  // stays a choice question on edit, and so buildAnswerList (below) can
  // re-save each answer under its own original stage instead of
  // collapsing a mixed initiation+risk array to one value. Older saved
  // answers have none of those fields, so they still fall back to a
  // synthetic index-based id, freeform text, and the `stage` prop
  // (ScopingView's derived single-value fallback) as their stage.
  const [questions, setQuestions] = useState(() =>
    isEditing
      ? initialAnswers.map((a, i) => ({
          id: a.id ?? String(i),
          text: a.question,
          type: a.type ?? 'text',
          ...(a.choices ? { choices: a.choices } : {}),
          vital: !!a.vital,
          stage: a.stage ?? stage,
        }))
      : []
  )
  const [answers, setAnswers] = useState(() =>
    isEditing
      ? Object.fromEntries(initialAnswers.map((a, i) => [a.id ?? String(i), a.answer || '']))
      : {}
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
        stage: q.stage,
      }))
  }

  async function finalize(answerList, sufficient, revertPhase) {
    // Unfiltered (blanks included) question/answer/vital view of this
    // stage's answers, separate from the persisted/enriched buildAnswerList
    // shape - only the initiation stage's onComplete uses this (to feed
    // suggest_methodology), but it costs nothing to always pass it.
    const fullAnswers = questions.map((q) => ({
      question: q.text,
      answer: answers[q.id] || '',
      vital: !!q.vital,
    }))

    const completeError = await onComplete(answerList, sufficient, fullAnswers)
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
          Thinking of a few project discovery questions...
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
          <p className="charter-status">No project discovery questions came back for this project.</p>
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

// Drives the Initiation -> Methodology Suggestion -> Risk sequence for a
// fresh (non-editing) scoping session. Initiation and Risk each run their
// own independent ScopingStage instance (remounted via key={phase} so
// loading-questions/answering/evaluate state doesn't leak between them);
// onGenerated is still called exactly once, after Risk (the last stage)
// completes, with the two stages' answer lists concatenated and an overall
// sufficient that's true only if both stages were.
//
// The methodology step in between is assistant-driven and silent by
// default: it calls suggest_methodology, and only surfaces a confirm modal
// when there's an actual suggestion that differs from the PM's original
// manual pick (NewProjectFlow step 1). Anything else - no suggestion, a
// suggestion matching what's already set, or the call failing outright -
// falls straight through to Risk with no UI at all, since this step is an
// enhancement on top of the Q&A, not a gate the PM has to clear.
function ScopingWizard({ project, onGenerated, onClose }) {
  const [phase, setPhase] = useState('initiation')
  const [initiationResult, setInitiationResult] = useState(null)
  const [suggestion, setSuggestion] = useState(null)
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState(null)

  async function handleInitiationComplete(answerList, sufficient, fullAnswers) {
    setInitiationResult({ answers: answerList, sufficient })
    setPhase('suggesting')

    try {
      const { data, error } = await supabase.functions.invoke('scoping', {
        body: { action: 'suggest_methodology', project, answers: fullAnswers },
      })

      const suggested = !error && !data?.error ? data?.suggestedMethodology : null

      if (!suggested || suggested === project.methodology) {
        setPhase('risk')
        return null
      }

      setSuggestion({ suggestedMethodology: suggested, reason: data.reason })
      setPhase('methodology-confirm')
    } catch {
      setPhase('risk')
    }

    return null
  }

  async function handleAcceptSwitch() {
    setSwitching(true)
    setSwitchError(null)

    // Only updates projects.methodology - it does not re-seed phases or
    // toggle waterfall/agile sections for the new methodology.
    // ProjectDetailLayout.jsx's handleMethodologyChange (the existing
    // manual-switch path) already has warning-modal copy and reseeding
    // logic for exactly this kind of change; a later session should have
    // this accepted-suggestion path borrow from or route through that
    // instead of writing the column directly the way this does for now.
    const { error } = await supabase
      .from('projects')
      .update({ methodology: suggestion.suggestedMethodology })
      .eq('id', project.id)

    setSwitching(false)

    if (error) {
      setSwitchError(error.message)
      return
    }

    setPhase('risk')
  }

  function handleKeepCurrent() {
    setPhase('risk')
  }

  async function handleRiskComplete(answerList, sufficient) {
    const combined = [...(initiationResult?.answers || []), ...answerList]
    const overallSufficient = (initiationResult?.sufficient ?? true) && sufficient
    return await onGenerated(combined, overallSufficient)
  }

  return (
    <>
      {(phase === 'initiation' || phase === 'risk') && (
        <p className="step-label">
          Stage {STAGE_NUMBERS[phase]} of {STAGE_TOTAL}: {STAGE_LABELS[phase]}
        </p>
      )}

      {phase === 'initiation' && (
        <ScopingStage
          key="initiation"
          project={project}
          stage="initiation"
          onComplete={handleInitiationComplete}
          onClose={onClose}
        />
      )}

      {phase === 'suggesting' && (
        <p className="charter-status">
          <Spinner />
          Reviewing your answers...
        </p>
      )}

      {phase === 'methodology-confirm' && suggestion && (
        <Modal onClose={handleKeepCurrent}>
          <h3 className="charter-heading">The assistant has a methodology suggestion</h3>
          <p>
            Current methodology:{' '}
            <strong>{METHODOLOGY_LABELS[project.methodology] ?? project.methodology}</strong>
          </p>
          <p>
            Suggested methodology:{' '}
            <strong>
              {METHODOLOGY_LABELS[suggestion.suggestedMethodology] ?? suggestion.suggestedMethodology}
            </strong>
          </p>
          <p className="charter-status">{suggestion.reason}</p>

          {switchError && <p className="error">{switchError}</p>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={handleKeepCurrent}
              disabled={switching}
            >
              Keep {METHODOLOGY_LABELS[project.methodology] ?? project.methodology} and continue
            </button>
            <LoadingButton
              className="btn-primary"
              loading={switching}
              loadingLabel="Switching..."
              onClick={handleAcceptSwitch}
            >
              Switch to {METHODOLOGY_LABELS[suggestion.suggestedMethodology] ?? suggestion.suggestedMethodology}
            </LoadingButton>
          </div>
        </Modal>
      )}

      {phase === 'risk' && (
        <ScopingStage
          key="risk"
          project={project}
          stage="risk"
          onComplete={handleRiskComplete}
          onClose={onClose}
        />
      )}
    </>
  )
}

// Pure Q&A, no upload alternative, always auto-loads on mount - same shape
// as RiskLogFlow.jsx, since Scoping (like Risk Log) has no document-upload
// path. Scoping runs first in the wizard, so unlike RiskLogFlow it has no
// prior charter/brief context to fold in.
function ScopingFlow({ project, initialAnswers, stage, onGenerated, onClose, isWizardStep = false }) {
  const isEditing = !!initialAnswers

  return (
    <div className="charter">
      {isEditing ? (
        // Edit path predates the stage split and still edits the saved
        // answers as one flat list rather than per-stage. `stage` is an
        // optional caller-supplied override (ScopingView derives it from
        // the stored answers' own .stage field when they all agree) -
        // defaults to "risk" otherwise, since that's the stage whose Edge
        // Function prompt is the original (pre-split) scoping question
        // set, keeping evaluate behavior for legacy/mixed-stage answers
        // the same as before this rework. Reworking this to edit
        // per-stage is a later session's work.
        <ScopingStage
          project={project}
          stage={stage || 'risk'}
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
