import { useState } from 'react'
import { Link } from 'react-router-dom'

export const DISMISS_KEY = 'dashboard-ai-note-dismissed'

export function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]')
  } catch {
    return []
  }
}

// One suggestion at a time, from a rule-based fact (a slipped milestone, else
// the top attention item).
// Wording is templated for now. "Show me options" only lays out the open
// tasks (when there are any) and links to the project - nothing is changed unless the PM does it.
// Dismissal state lives in the Dashboard (dismissed / onDismiss) so the
// attention list can show the note's item again once the note is gone.
function AiNote({ fact, dismissed, onDismiss }) {
  const [open, setOpen] = useState(false)

  if (!fact || dismissed.includes(fact.key)) return null
  const { project, openTasks, sentence } = fact
  const hasTasks = openTasks.length > 0

  return (
    <aside className="ai-note" aria-label="Suggestion">
      <span className="ai-note-spark" aria-hidden="true">✦</span>
      <div className="ai-note-body">
        <p className="ai-note-text">{sentence}</p>
        <small className="ai-note-source">
          Based on the project plan and task statuses. I won&rsquo;t change anything unless you say so.
        </small>
        {open && hasTasks && (
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
          {open || !hasTasks ? (
            <Link to={`/projects/${project.id}`} className="btn-primary">Open project</Link>
          ) : (
            <button type="button" className="btn-primary" onClick={() => setOpen(true)}>Show me options</button>
          )}
          <button type="button" className="btn-secondary" onClick={() => onDismiss(fact.key)}>Not now</button>
        </div>
      </div>
    </aside>
  )
}

export default AiNote
