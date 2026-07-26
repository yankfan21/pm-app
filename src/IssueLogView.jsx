import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportIssueLogDocx, exportIssueLogPdf } from './issueLogExport'

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

const PRIORITIES = ['Low', 'Medium', 'High']
const STATUSES = ['Open', 'In Progress', 'Pending', 'Closed']
const STATUS_FILTERS = ['All', ...STATUSES]

function newRow() {
  return {
    id: crypto.randomUUID(),
    description: '',
    priority: 'Medium',
    owner: '',
    status: 'Open',
    resolution: '',
    resolution_date: '',
  }
}

function withIds(issues) {
  return (issues || []).map((i) => (i.id ? i : { ...i, id: crypto.randomUUID() }))
}

function statusSlug(status) {
  return status.toLowerCase().replace(/\s+/g, '-')
}

function IssueLogView({ project, issueLog, canEdit, onUpdate }) {
  const [rows, setRows] = useState(() => withIds(issueLog.issues))
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const textareaRefs = useRef({})

  const displayRows = statusFilter === 'All' ? rows : rows.filter((r) => r.status === statusFilter)

  useEffect(() => {
    rows.forEach((r) => {
      autoResize(textareaRefs.current[`${r.id}-description`])
      autoResize(textareaRefs.current[`${r.id}-resolution`])
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
    const next = [...rows, newRow()]
    setRows(next)
    persist(next)
  }

  function deleteRow(id) {
    const next = rows.filter((r) => r.id !== id)
    setRows(next)
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
            onClick={() => setStatusFilter(status)}
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
              <th>Resolution</th>
              <th>Date</th>
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
                    className={`risk-level-select risk-level-${row.priority.toLowerCase()}`}
                    value={row.priority}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'priority', e.target.value)}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
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
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    ref={(el) => (textareaRefs.current[`${row.id}-resolution`] = el)}
                    className="risk-cell-input"
                    value={row.resolution}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      updateCell(row.id, 'resolution', e.target.value)
                      autoResize(e.target)
                    }}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    className="risk-cell-input"
                    value={row.resolution_date || ''}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'resolution_date', e.target.value)}
                  />
                </td>
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
                  {rows.length === 0 ? 'No issues logged yet' : `No ${statusFilter} issues logged`}
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
