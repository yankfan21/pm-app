import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'
import { DEFAULT_PHASES } from './phases'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

const METHODOLOGIES = [
  { value: 'waterfall', label: 'Waterfall', description: 'Sequential phases, fixed plan up front' },
  { value: 'agile', label: 'Agile', description: 'Iterative sprints, evolving backlog' },
  { value: 'hybrid', label: 'Hybrid', description: 'Waterfall structure with agile execution' },
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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

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
    onCreated(data)
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
              Deadline
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

            <dl className="review-list">
              <dt>Methodology</dt>
              <dd>{METHODOLOGIES.find((m) => m.value === methodology)?.label}</dd>
              <dt>Name</dt>
              <dd>{name}</dd>
              <dt>Goal</dt>
              <dd>{goal}</dd>
              <dt>Priority</dt>
              <dd>{priority}</dd>
              <dt>Deadline</dt>
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
      </div>
    </div>
  )
}

export default NewProjectFlow
