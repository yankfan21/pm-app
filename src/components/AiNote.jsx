import { useState } from 'react'
import { Link } from 'react-router-dom'

const DISMISS_KEY = 'dashboard-ai-note-dismissed'

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
  } catch {
    return []
  }
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// One suggestion at a time, from a rule-based fact (a slipped milestone).
// Wording is templated for now. "Show me options" only lays out the facts
// and links to the project - nothing is changed unless the PM does it.
function AiNote({ fact }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [open, setOpen] = useState(false)

  if (!fact || dismissed.includes(fact.key)) return null
  const { project, milestone, openTasks, days } = fact

  function dismiss() {
    const next = [...dismissed, fact.key]
    setDismissed(next)
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)))
    } catch {
      // storage unavailable: dismissal lasts for this visit only
    }
  }

  return (
    <aside className="ai-note" aria-label="Suggestion">
      <span className="ai-note-spark" aria-hidden="true">✦</span>
      <div className="ai-note-body">
        <p className="ai-note-text">
          On {project.name}, the {milestone.name} milestone slipped by {plural(days, 'day')} and{' '}
          {plural(openTasks.length, 'task')} tied to it {openTasks.length === 1 ? 'is' : 'are'} still open.
          {project.deadline ? ` The go-live is ${project.deadline}.` : ''}
        </p>
        <small className="ai-note-source">
          Based on the project plan and task statuses. I won&rsquo;t change anything unless you say so.
        </small>
        {open && (
          <ul className="ai-note-options">
            {openTasks.slice(0, 5).map((t) => (
              <li key={t.id}>
                {t.title}
                {t.due_date ? ` (due ${t.due_date})` : ''}
              </li>
            ))}
          </ul>
        )}
        <div className="ai-note-actions">
          {open ? (
            <Link to={`/projects/${project.id}`} className="btn-primary">Open project</Link>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Show me options</button>
          )}
          <button type="button" className="btn-secondary" onClick={dismiss}>Not now</button>
        </div>
      </div>
    </aside>
  )
}

export default AiNote
