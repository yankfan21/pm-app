import { useState } from 'react'
import { supabase } from './supabaseClient'
import { exportRiskLogDocx, exportRiskLogPdf } from './riskLogExport'

const LEVELS = ['Low', 'Medium', 'High']

function newRow() {
  return {
    id: crypto.randomUUID(),
    risk: '',
    likelihood: 'Medium',
    impact: 'Medium',
    mitigation: '',
    owner: '',
  }
}

function withIds(risks) {
  return (risks || []).map((r) => (r.id ? r : { ...r, id: crypto.randomUUID() }))
}

function RiskLogView({ project, charter, brief, riskLog, canEdit, onUpdate }) {
  const [rows, setRows] = useState(() => withIds(riskLog.risks))
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)

  async function persist(nextRows) {
    setError(null)

    const { data, error } = await supabase
      .from('risk_logs')
      .update({ risks: nextRows, updated_at: new Date().toISOString() })
      .eq('id', riskLog.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onUpdate(data)
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
      exportRiskLogPdf(project, rows)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
  }

  async function handleExportDocx() {
    try {
      await exportRiskLogDocx(project, rows)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
  }

  async function handleSuggest() {
    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('risk-log', {
      body: { action: 'suggest', project, charter, brief, risks: rows },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setSuggestions((data.risks || []).map((r) => ({ ...r, id: crypto.randomUUID() })))
  }

  function acceptSuggestion(suggestion) {
    const { id: _id, ...rest } = suggestion
    const next = [...rows, { id: crypto.randomUUID(), ...rest }]
    setRows(next)
    persist(next)
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
  }

  function dismissSuggestion(id) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Risk Log</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={handleExportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportDocx}>
            Export Word
          </button>
          {canEdit && (
            <button
              type="button"
              className="btn-secondary"
              disabled={suggestLoading}
              onClick={handleSuggest}
            >
              {suggestLoading ? 'Thinking...' : 'Suggest Additional Risks'}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="risk-table-wrap">
        <table className="risk-log-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Likelihood</th>
              <th>Impact</th>
              <th>Mitigation</th>
              <th>Owner</th>
              <th aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <textarea
                    className="risk-cell-input"
                    value={row.risk}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'risk', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    className={`risk-level-select risk-level-${row.likelihood.toLowerCase()}`}
                    value={row.likelihood}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'likelihood', e.target.value)}
                  >
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className={`risk-level-select risk-level-${row.impact.toLowerCase()}`}
                    value={row.impact}
                    disabled={!canEdit}
                    onChange={(e) => handleSelectChange(row.id, 'impact', e.target.value)}
                  >
                    {LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    className="risk-cell-input"
                    value={row.mitigation}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'mitigation', e.target.value)}
                    onBlur={handleTextBlur}
                  />
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
                  {canEdit && (
                    <button
                      type="button"
                      className="risk-delete-btn"
                      aria-label="Delete risk"
                      onClick={() => deleteRow(row.id)}
                    >
                      &times;
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  No risks logged yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button type="button" className="btn-secondary risk-add-btn" onClick={addRow}>
          + Add Risk
        </button>
      )}

      {suggestions != null && canEdit && (
        <div className="risk-suggestions">
          {suggestions.length === 0 ? (
            <p className="charter-status">
              No additional risks identified beyond what's already logged.
            </p>
          ) : (
            <>
              <p className="risk-suggestions-label">
                AI suggestions &mdash; not required, review and accept or dismiss each
              </p>
              {suggestions.map((s) => (
                <div className="risk-suggestion-card" key={s.id}>
                  <div className="risk-suggestion-body">
                    <p className="risk-suggestion-title">{s.risk}</p>
                    <p className="risk-suggestion-meta">
                      Likelihood: {s.likelihood} &middot; Impact: {s.impact}
                      {s.owner ? ` · Owner: ${s.owner}` : ''}
                    </p>
                    {s.mitigation && <p className="risk-suggestion-mitigation">{s.mitigation}</p>}
                  </div>
                  <div className="risk-suggestion-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => dismissSuggestion(s.id)}
                    >
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => acceptSuggestion(s)}
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default RiskLogView
