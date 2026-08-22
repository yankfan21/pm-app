import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { DEFAULT_PHASES } from './phases'
import ScopingFlow from './ScopingFlow'
import CharterFlow from './CharterFlow'
import RiskLogFlow from './RiskLogFlow'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

const METHODOLOGIES = [
  { value: 'waterfall', label: 'Waterfall', description: 'Sequential phases, fixed plan up front' },
  { value: 'agile', label: 'Agile', description: 'Iterative sprints, evolving backlog' },
  { value: 'hybrid', label: 'Hybrid', description: 'Waterfall structure with agile execution' },
]

const CREATION_MODES = [
  {
    value: 'guided',
    label: 'Guided setup',
    description: 'Answer a few assistant questions to draft a Charter and Risk Log right after creating',
  },
  {
    value: 'quick',
    label: 'Quick create',
    description: 'Skip straight to the project - draft these later from Documents/Risk Log',
  },
]

function NewProjectFlow({ onCreated, onClose }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [methodology, setMethodology] = useState(null)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [priority, setPriority] = useState(null)
  const [deadline, setDeadline] = useState('')
  const [tbd, setTbd] = useState(false)
  const [creationMode, setCreationMode] = useState('guided')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Set once the projects-row insert (step 4) succeeds in guided mode -
  // steps 5/6/7 need the real row (id, name, goal, priority, deadline) to
  // pass to ScopingFlow/CharterFlow/RiskLogFlow, same as any other
  // post-creation caller of those components. Quick create never sets
  // these; it calls onCreated immediately instead of visiting steps 5-7.
  const [createdProject, setCreatedProject] = useState(null)
  // The just-generated scoping row (or null if step 5 was skipped) - passed
  // to CharterFlow and RiskLogFlow as established context, same idea as
  // charterRow below.
  const [scopingRow, setScopingRow] = useState(null)
  // The just-generated charter (or null if step 6 was skipped) - passed to
  // RiskLogFlow as context so its "questions" call can skip anything the
  // charter already covers, same as it would post-creation.
  const [charterRow, setCharterRow] = useState(null)

  const step2Valid = name.trim() !== '' && goal.trim() !== ''
  const step3Valid = priority !== null && (tbd || deadline !== '')

  async function handleCreate() {
    setSubmitting(true)
    setError(null)

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: name.trim(),
        goal: goal.trim(),
        priority,
        deadline: tbd ? null : deadline,
        methodology,
        owner_id: user?.id ?? null,
        owner_email: user?.email ?? null,
      })
      .select()
      .single()

    if (error) {
      setSubmitting(false)
      setError(error.message)
      return
    }

    // Phases are a fixed Waterfall/Hybrid grouping layer - Agile projects
    // never get them (same gate the rest of the Waterfall-side UI uses).
    // Best-effort: the project itself already exists at this point, so a
    // phase-seeding failure shouldn't block navigating into it - the
    // backfill in phases_schema.sql (or a manual retry) can fill this in
    // later, same as any other project that predates this feature.
    if (methodology !== 'agile') {
      const { error: phaseError } = await supabase.from('phases').insert(
        DEFAULT_PHASES.map((p) => ({ project_id: data.id, ...p }))
      )
      if (phaseError) {
        console.error('Failed to seed phases for new project:', phaseError.message)
      }
    }

    setSubmitting(false)

    if (creationMode === 'quick') {
      onCreated(data)
      return
    }

    setCreatedProject(data)
    setStep(5)
  }

  // Mirrors DocSection's insertDoc (ProjectDocSectionRoutes.jsx) for these
  // doc types - duplicated rather than shared since every other caller of
  // ScopingFlow/CharterFlow/RiskLogFlow already inserts inline the same way.
  async function handleScopingGenerated(answerList, sufficient) {
    const { data, error: insertError } = await supabase
      .from('scopings')
      .insert({ project_id: createdProject.id, qa_answers: answerList, sufficient })
      .select()
      .single()

    if (insertError) return insertError.message

    setScopingRow(data)
    setStep(6)
    return null
  }

  function handleSkipScoping() {
    setStep(6)
  }

  async function handleCharterGenerated(result, answerList) {
    const { data, error: insertError } = await supabase
      .from('charters')
      .insert({ project_id: createdProject.id, ...result, qa_answers: answerList })
      .select()
      .single()

    if (insertError) return insertError.message

    setCharterRow(data)
    setStep(7)
    return null
  }

  function handleSkipCharter() {
    setStep(7)
  }

  async function handleRiskLogGenerated(risks, answerList) {
    const { error: insertError } = await supabase
      .from('risk_logs')
      .insert({ project_id: createdProject.id, risks, qa_answers: answerList })

    if (insertError) return insertError.message

    onCreated(createdProject)
    return null
  }

  function handleSkipRiskLog() {
    onCreated(createdProject)
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button type="button" className="modal-close" onClick={onClose}>
          &times;
        </button>

        {step === 1 && (
          <div className="modal-step">
            <h2>New Project</h2>
            <p className="step-label">Step 1 of 4</p>

            <label>Methodology</label>
            <div className="methodology-buttons">
              {METHODOLOGIES.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  className={methodology === m.value ? 'selected' : ''}
                  onClick={() => setMethodology(m.value)}
                >
                  <span className="methodology-name">{m.label}</span>
                  <span className="methodology-description">{m.description}</span>
                </button>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={methodology === null}
                onClick={() => setStep(2)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="modal-step">
            <h2>New Project</h2>
            <p className="step-label">Step 2 of 4</p>

            <label>
              Project name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </label>

            <label>
              One-line goal
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(1)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!step2Valid}
                onClick={() => setStep(3)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="modal-step">
            <h2>New Project</h2>
            <p className="step-label">Step 3 of 4</p>

            <label>Priority</label>
            <div className="priority-buttons">
              {PRIORITIES.map((p) => (
                <button
                  type="button"
                  key={p}
                  className={priority === p ? 'selected' : ''}
                  onClick={() => setPriority(p)}
                >
                  {p}
                </button>
              ))}
            </div>

            <label>
              Target Go Live
              <input
                type="date"
                value={deadline}
                disabled={tbd}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>

            <label className="tbd-checkbox">
              <input
                type="checkbox"
                checked={tbd}
                onChange={(e) => {
                  setTbd(e.target.checked)
                  if (e.target.checked) setDeadline('')
                }}
              />
              TBD
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(2)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!step3Valid}
                onClick={() => setStep(4)}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="modal-step">
            <h2>New Project</h2>
            <p className="step-label">Step 4 of 4 &mdash; Review</p>

            <label>After creating</label>
            <div className="methodology-buttons">
              {CREATION_MODES.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  className={creationMode === m.value ? 'selected' : ''}
                  onClick={() => setCreationMode(m.value)}
                >
                  <span className="methodology-name">{m.label}</span>
                  <span className="methodology-description">{m.description}</span>
                </button>
              ))}
            </div>

            <dl className="review-list">
              <dt>Methodology</dt>
              <dd>{METHODOLOGIES.find((m) => m.value === methodology)?.label}</dd>
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Goal</dt>
              <dd>{goal}</dd>
              <dt>Priority</dt>
              <dd>{priority}</dd>
              <dt>Target Go Live</dt>
              <dd>{tbd ? 'TBD' : deadline}</dd>
            </dl>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setStep(3)}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={submitting}
                onClick={handleCreate}
              >
                {submitting ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        )}

        {step === 5 && createdProject && (
          <div className="modal-step">
            <div className="section-header">
              <p className="step-label">Step 5 of 7 &mdash; Scoping (optional)</p>
              <button type="button" className="btn-secondary" onClick={handleSkipScoping}>
                Skip for now
              </button>
            </div>
            <ScopingFlow
              project={createdProject}
              onGenerated={handleScopingGenerated}
              onClose={handleSkipScoping}
            />
          </div>
        )}

        {step === 6 && createdProject && (
          <div className="modal-step">
            <div className="section-header">
              <p className="step-label">Step 6 of 7 &mdash; Charter (optional)</p>
              <button type="button" className="btn-secondary" onClick={handleSkipCharter}>
                Skip for now
              </button>
            </div>
            <CharterFlow
              project={createdProject}
              scoping={scopingRow}
              autoStart
              onGenerated={handleCharterGenerated}
              onClose={handleSkipCharter}
            />
          </div>
        )}

        {step === 7 && createdProject && (
          <div className="modal-step">
            <div className="section-header">
              <p className="step-label">Step 7 of 7 &mdash; Risk Log (optional)</p>
              <button type="button" className="btn-secondary" onClick={handleSkipRiskLog}>
                Skip for now
              </button>
            </div>
            <RiskLogFlow
              project={createdProject}
              charter={charterRow}
              brief={null}
              scoping={scopingRow}
              onGenerated={handleRiskLogGenerated}
              onClose={handleSkipRiskLog}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default NewProjectFlow
