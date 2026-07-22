import { useState } from 'react'
import { useAuth } from '../AuthContext'

// Assignee = either a real project collaborator (assignee_user_id, FK to
// auth.users - see tasks_assignee.sql) or a one-off free-text name
// (assignee_name, for a contractor who isn't a collaborator). The two are
// mutually exclusive at the DB level (tasks_assignee_single_check), so this
// component only ever writes one of them at a time, always nulling the
// other in the same onChange call.
//
// `mode` is local UI state, not derived fresh from props every render -
// deliberately, so that picking "Other" and then clearing the name field
// back to empty keeps showing the text input (an empty assignee_name commits
// as null, which would otherwise look identical to "no assignee picked yet"
// and silently collapse back to the Unassigned option while still focused).
// Each call site renders one instance per task (list row keyed by task.id,
// review-table row keyed by temp_id), so a fresh mount already reflects
// that task's current assignment - this only needs to track the choice the
// user makes going forward, same pattern as DependencyPicker's local query/
// isOpen state.
const OTHER_VALUE = '__other__'

export default function AssigneePicker({
  collaborators,
  assigneeUserId,
  assigneeName,
  ownerUserId,
  onChange,
  disabled = false,
}) {
  const { user } = useAuth()
  const [mode, setMode] = useState(() => (assigneeUserId ? 'collaborator' : assigneeName ? 'other' : 'none'))
  const [nameDraft, setNameDraft] = useState(assigneeName || '')

  // project_collaborators never includes the owner (ManageAccess.jsx blocks
  // inviting yourself), so the owner is otherwise invisible to this picker.
  // Synthesizing a self-entry only when the viewer IS the owner - there's no
  // stored owner email/name readable by other viewers to label an entry for
  // them, so this only solves owner self-assignment, not other collaborators
  // assigning tasks to the owner.
  const isOwnerViewing = Boolean(user && ownerUserId && user.id === ownerUserId)
  const options = isOwnerViewing
    ? [...collaborators, { user_id: ownerUserId, email: `${user.email} (Owner)` }]
    : collaborators

  function handleSelectChange(e) {
    const val = e.target.value
    if (val === '') {
      setMode('none')
      onChange({ assignee_user_id: null, assignee_name: null })
    } else if (val === OTHER_VALUE) {
      setMode('other')
      onChange({ assignee_user_id: null, assignee_name: nameDraft.trim() || null })
    } else {
      setMode('collaborator')
      onChange({ assignee_user_id: val, assignee_name: null })
    }
  }

  function handleNameChange(e) {
    const next = e.target.value
    setNameDraft(next)
    onChange({ assignee_user_id: null, assignee_name: next.trim() || null })
  }

  const selectValue = mode === 'collaborator' ? assigneeUserId || '' : mode === 'other' ? OTHER_VALUE : ''

  return (
    <span className={`assignee-picker${mode === 'other' ? ' assignee-picker--other' : ''}`}>
      <select
        className="assignee-picker-select"
        value={selectValue}
        disabled={disabled}
        onChange={handleSelectChange}
      >
        <option value="">Unassigned</option>
        {options.map((c) => (
          <option key={c.user_id} value={c.user_id}>
            {c.email}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other (type name)…</option>
      </select>
      {mode === 'other' && (
        <input
          type="text"
          className="assignee-picker-name-input"
          placeholder="Assignee name…"
          value={nameDraft}
          disabled={disabled}
          onChange={handleNameChange}
        />
      )}
    </span>
  )
}

// Shared label resolution so every call site (task list rows, Gantt bars/
// tooltips/filter) renders an assignee identically. Prefers the resolved
// collaborator email over the raw uuid; falls back to the free-text name;
// null (not a placeholder string) when unassigned, so callers can decide
// their own "Unassigned" copy.
export function resolveAssigneeLabel(task, collaborators) {
  if (task.assignee_user_id) {
    const match = collaborators.find((c) => c.user_id === task.assignee_user_id)
    return match ? match.email : 'Unknown collaborator'
  }
  if (task.assignee_name) return task.assignee_name
  return null
}
