import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportIssueLogDocx, exportIssueLogPdf } from './issueLogExport'
import { OPEN_ISSUE_STATUSES, appendStatusNote, createIssueObject, sortIssues } from './issueLogUtils'

// Own component, not a reuse/shrink of RiskLogView.jsx - Issues Log is a
// separate entity (issues DID/ARE happening, risks MAY happen), with its
// own field shape and no AI-generation path (manual entry only, see
// IssueLogFlow.jsx). Same manual-height-tracking textarea approach as
// RiskLogView.jsx/CharterView.jsx's autoResize.
function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function formatDateTime(iso) {
  if (!iso) return String.fromCharCode(8212)
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const PRIORITIES = ['Low', 'Medium', 'High']
const STATUSES = ['Open', 'In Progress', 'Blocked', 'Closed']
const STATUS_FILTERS = ['All', ...STATUSES]
// 'OpenGroup' is a deep-link-only filter value (Key Metrics Dashboard's
// Issue Summary card - see KeyMetricsDashboard.jsx/DocumentsRoute.jsx),
// combining Open/In Progress/Blocked - not a visible tab, since none of the
// literal-status tabs above map 1:1 to it.
const VALID_FILTER_VALUES = ['All', 'OpenGroup', ...STATUSES]

function withIds(issues) {
  return (issues || []).map((i) => (i.id ? i : { ...i, id: crypto.randomUUID() }))
}

function statusSlug(status) {
  return status.toLowerCase().replace(/\s+/g, '-')
}

function IssueLogView({
  project,
  issueLog,
  canEdit,
  onUpdate,
  initialStatusFilter,
  onStatusFilterChange,
}) {
  const [rows, setRows] = useState(() => withIds(issueLog.issues))
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState(
    VALID_FILTER_VALUES.includes(initialStatusFilter) ? initialStatusFilter : 'All'
  )
  const [noteDrafts, setNoteDrafts] = useState({})
  const textareaRefs = useRef({})

  // Re-sync when arriving with a different filter (e.g. clicking the other
  // Issue Summary badge while already on this page) - the URL param changes
  // but this component doesn't remount.
  useEffect(() => {
    if (VALID_FILTER_VALUES.includes(initialStatusFilter)) setStatusFilter(initialStatusFilter)
  }, [initialStatusFilter])

  const filteredRows =
    statusFilter === 'All'
      ? rows
      : statusFilter === 'OpenGroup'
        ? rows.filter((r) => OPEN_ISSUE_STATUSES.includes(r.status))
        : rows.filter((r) => r.status === statusFilter)
  const displayRows = sortIssues(filteredRows)

  function handleFilterChange(status) {
    setStatusFilter(status)
    onStatusFilterChange?.(status)
  }

  useEffect(() => {
    rows.forEach((r) => {
      autoResize(textareaRefs.current[`${r.id}-description`])
    })
  }, [rows])

  async function persist(nextRows) {
    setError(null)

    const { data, error } = await supabase
      .from('issue_logs')
      .update({ issues: nextRows, updated_at: new Date().toISOString() })
      .eq('id', issueLog.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this issues log.')
      return
    }

    onUpdate(data[0])
  }

  function updateCell(id, key, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }

  function handleTextBlur() {
    persist(rows)
  }

  function handleSelectChange(id, key, value) {
    const next = rows.map((r) => (r.id === id ? { ...r, [key]: value } : r))
    setRows(next)
    persist(next)
  }

  function addRow() {
    const next = [...rows, createIssueObject()]
    setRows(next)
    persist(next)
    // createIssueObject() defaults to status 'Open', so adding under an
    // In Progress/Blocked/Closed filter would create the row in the DB but
    // render it nowhere - same trap as RiskLogView.jsx's addRow(). Reset to
    // All so it's on screen immediately. handleFilterChange (not a bare
    // setStatusFilter) so the parent's ?issueFilter= URL param is cleared
    // too, rather than pointing at a filter the list no longer applies.
    handleFilterChange('All')
  }

  function deleteRow(id) {
    const next = rows.filter((r) => r.id !== id)
    setRows(next)
    persist(next)
  }

  function handleAddNote(id) {
    const draft = noteDrafts[id]
    if (!draft || !draft.trim()) return

    const next = rows.map((r) => (r.id === id ? appendStatusNote(r, draft) : r))
    setRows(next)
    setNoteDrafts((prev) => ({ ...prev, [id]: '' }))
    persist(next)
  }

  async function handleExportPdf() {
    try {
      exportIssueLogPdf(project, rows)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
  }

  async function handleExportDocx() {
    try {
      await exportIssueLogDocx(project, rows)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
  }

  return (
    <div className="charter">
      <div className="section-header">
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={handleExportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportDocx}>
            Export Word
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="filter-tabs risk-log-severity-filter">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            className={`filter-tab ${statusFilter === status ? 'selected' : ''}`}
            onClick={() => handleFilterChange(status)}
          >
            {status}
          </button>
        ))}
      </div>

      <div className="risk-table-wrap">
        <table className="risk-log-table issue-log-main-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Priority</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Status Notes</th>
              <th>Last Update</th>
              <th aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.id}>
                <td>
                  <textarea
                    ref={(el) => (textareaRefs.current[`${row.id}-description`] = el)}
                    className="risk-cell-input"
                    value={row.description}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      updateCell(row.id, 'description', e.target.value)
                      autoResize(e.target)
                    }}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    className="issue-priority-select"
                    value={row.priority}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'priority', e.target.value)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p} className={`issue-priority-option ${p.toLowerCase()}`}>
                        {p}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.owner}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'owner', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    className={`risk-level-select issue-status-${statusSlug(row.status)}`}
                    value={row.status}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'status', e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s} className={`issue-status-option ${statusSlug(s)}`}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <div className="issue-status-notes-cell">
                    {(row.status_notes || []).length > 0 && (
                      <ul className="issue-status-notes-list">
                        {row.status_notes.map((n, i) => (
                          <li key={i}>
                            <span className="issue-status-note-text">{n.note}</span>
                            <span className="issue-status-note-date">{formatDateTime(n.created_at)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canEdit && (
                      <div className="issue-status-note-add">
                        <textarea
                          rows={2}
                          placeholder="Add a status note..."
                          value={noteDrafts[row.id] || ''}
                          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-secondary issue-status-note-add-btn"
                          onClick={() => handleAddNote(row.id)}
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </td>
                <td>{formatDateTime(row.last_update)}</td>
                <td>
                  {canEdit && (
                    <button
                      type="button"
                      className="risk-delete-btn"
                      aria-label="Delete issue"
                      onClick={() => deleteRow(row.id)}
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  {rows.length === 0
                    ? 'No issues logged yet'
                    : `No ${statusFilter === 'OpenGroup' ? 'open' : statusFilter} issues logged`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button type="button" className="btn-secondary risk-add-btn" onClick={addRow}>
          + Add Issue
        </button>
      )}
    </div>
  )
}

export default IssueLogView
