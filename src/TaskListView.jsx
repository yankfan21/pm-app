import { useMemo, useState } from 'react'
import { resolveAssigneeLabel } from './components/AssigneePicker'

// Two separate status vocabularies, matching whichever side this instance
// is scoped to - Waterfall tasks use tasks.status (ProjectDetail.jsx's
// TASK_STATUS_OPTIONS), backlog/sprint items use tasks.backlog_status
// (BacklogView.jsx's STATUS_OPTIONS). Duplicated locally rather than
// imported, matching how every other file in this app already keeps its
// own copy of these small option lists (BOARD_COLUMNS, STATUS_OPTIONS,
// TASK_STATUS_OPTIONS are all separately defined, not shared).
const WATERFALL_STATUS_OPTIONS = [
  { key: 'not_started', label: 'Not Started', colorClass: 'pending' },
  { key: 'in_progress', label: 'In Progress', colorClass: 'partial' },
  { key: 'completed', label: 'Completed', colorClass: 'done' },
  { key: 'delayed', label: 'Delayed', colorClass: 'critical' },
]

const AGILE_STATUS_OPTIONS = [
  { key: 'backlog', label: 'Backlog', colorClass: 'pending' },
  { key: 'ready', label: 'Ready', colorClass: 'ready' },
  { key: 'in_sprint', label: 'In Sprint', colorClass: 'partial' },
  { key: 'done', label: 'Done', colorClass: 'done' },
]

function statusFor(task, variant) {
  if (variant === 'agile') {
    const key = task.backlog_status ?? 'backlog'
    return AGILE_STATUS_OPTIONS.find((o) => o.key === key) || AGILE_STATUS_OPTIONS[0]
  }
  const key = task.status ?? 'not_started'
  return WATERFALL_STATUS_OPTIONS.find((o) => o.key === key) || WATERFALL_STATUS_OPTIONS[0]
}

// Read-only, sortable table of whichever task subset the caller passes in
// (already scoped to one side - Waterfall or Agile - by ProjectDetail.jsx,
// same convention GanttChart/BacklogView use). Title is deliberately not
// sortable; only Due Date/Status/Assignee were asked for.
function TaskListView({ title, tasks, collaborators, variant, expanded }) {
  const [sortKey, setSortKey] = useState('due_date')
  const [sortDir, setSortDir] = useState('asc')

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const rows = useMemo(() => {
    const withMeta = tasks.map((task) => ({
      task,
      status: statusFor(task, variant),
      assigneeLabel: resolveAssigneeLabel(task, collaborators) || 'Unassigned',
    }))

    const dir = sortDir === 'asc' ? 1 : -1
    withMeta.sort((a, b) => {
      if (sortKey === 'due_date') {
        // Nulls always sort last regardless of direction (an unscheduled
        // item isn't "later" than a dated one in either direction) - hence
        // the early returns bypass the `* dir` flip below.
        if (!a.task.due_date && !b.task.due_date) return 0
        if (!a.task.due_date) return 1
        if (!b.task.due_date) return -1
        return a.task.due_date.localeCompare(b.task.due_date) * dir
      }
      if (sortKey === 'status') {
        return a.status.label.localeCompare(b.status.label) * dir
      }
      return a.assigneeLabel.localeCompare(b.assigneeLabel) * dir
    })
    return withMeta
  }, [tasks, collaborators, variant, sortKey, sortDir])

  function sortHeader(label, key) {
    const active = sortKey === key
    return (
      <button type="button" className="list-sort-header" onClick={() => toggleSort(key)}>
        {label}
        {active && <span aria-hidden="true">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
      </button>
    )
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">{title}</span>
        <span className={`doc-status-badge ${tasks.length > 0 ? 'done' : 'pending'}`}>
          {tasks.length > 0 ? `${tasks.length} Item${tasks.length === 1 ? '' : 's'}` : 'No items'}
        </span>
      </h2>

      {expanded && (
        <div className="risk-table-wrap">
          <table className="risk-log-table list-view-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>{sortHeader('Due Date', 'due_date')}</th>
                <th>{sortHeader('Status', 'status')}</th>
                <th>{sortHeader('Assignee', 'assignee')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ task, status, assigneeLabel }) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.due_date || '—'}</td>
                  <td>
                    <span className={`status-dot ${status.colorClass}`} aria-hidden="true" /> {status.label}
                  </td>
                  <td>{assigneeLabel}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    No items yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default TaskListView
