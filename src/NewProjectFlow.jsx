import { useState } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './AuthContext'

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

function NewProjectFlow({ onCreated, onClose }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [priority, setPriority] = useState(null)
  const [deadline, setDeadline] = useState('')
  const [tbd, setTbd] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const step1Valid = name.trim() !== '' && goal.trim() !== ''
  const step2Valid = priority !== null && (tbd || deadline !== '')

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
        owner_id: user.id,
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setError(error.message)
      return
    }

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
            <p className="step-label">Step 1 of 3</p>

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
                className="btn-primary"
                disabled={!step1Valid}
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
            <p className="step-label">Step 2 of 3</p>

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
            <p className="step-label">Step 3 of 3 &mdash; Review</p>

            <dl className="review-list">
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
                onClick={() => setStep(2)}
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
