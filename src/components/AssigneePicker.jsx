import { useState } from 'react'

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
  ownerEmail,
  onChange,
  disabled = false,
}) {
  const [mode, setMode] = useState(() => (assigneeUserId ? 'collaborator' : assigneeName ? 'other' : 'none'))
  const [nameDraft, setNameDraft] = useState(assigneeName || '')

  // project_collaborators never includes the owner (ManageAccess.jsx blocks
  // inviting yourself), so the owner is otherwise invisible to this picker.
  // Always synthesize a self-entry when the owner's id/email are known -
  // projects.owner_email (see add_owner_email_to_projects.sql) is
  // denormalized onto the project row itself, same pattern as
  // project_collaborators.email, so every viewer with access to the project
  // can see who the owner is, not just the owner viewing their own tasks.
  const options = ownerUserId && ownerEmail ? [...collaborators, { user_id: ownerUserId, email: `${ownerEmail} (Owner)` }] : collaborators

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
        <option value={OTHER_VALUE} title="Type a free-text name (e.g. a contractor)">
          Other
        </option>
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
// their own "Unassigned" copy. `project` is optional (defaults to no owner
// match) so call sites that never render owner-assigned tasks don't need to
// thread it through just to call this.
export function resolveAssigneeLabel(task, collaborators, project) {
  if (task.assignee_user_id) {
    if (project && task.assignee_user_id === project.owner_id) {
      return project.owner_email ? `${project.owner_email} (Owner)` : 'Owner'
    }
    const match = collaborators.find((c) => c.user_id === task.assignee_user_id)
    return match ? match.email : 'Unknown collaborator'
  }
  if (task.assignee_name) return task.assignee_name
  return null
}
