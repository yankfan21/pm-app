import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportRiskLogDocx, exportRiskLogPdf } from './riskLogExport'
import LoadingButton from './LoadingButton'
import { LIKELIHOOD_SCALE, SEVERITY_SCALE, getRiskScore, getRiskBand, scaleLabel } from './riskScale'

// Same manual-height-tracking approach as CharterView.jsx's autoResize -
// a plain <textarea rows={2}> clips or scrolls anything past its fixed
// 2-row height instead of growing, which combined with a too-narrow column
// (see .risk-log-main-table below) was the "Risk/Mitigation cut off with no
// way to see full text" bug: even a wide-enough column doesn't help if a
// long entry still needs more than 2 rows to display.
function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const SEVERITY_FILTERS = ['All', 'Critical', 'High', 'Medium', 'Low']

function newRow() {
  return {
    id: crypto.randomUUID(),
    risk: '',
    likelihood: null,
    severity: null,
    mitigation: '',
    owner: '',
  }
}

function withIds(risks) {
  return (risks || []).map((r) => (r.id ? r : { ...r, id: crypto.randomUUID() }))
}

function RiskLogView({
  project,
  charter,
  brief,
  riskLog,
  canEdit,
  onUpdate,
  initialSeverityFilter,
  onSeverityFilterChange,
}) {
  const [rows, setRows] = useState(() => withIds(riskLog.risks))
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [severityFilter, setSeverityFilter] = useState(
    SEVERITY_FILTERS.includes(initialSeverityFilter) ? initialSeverityFilter : 'All'
  )
  const textareaRefs = useRef({})

  // Re-sync when arriving with a different severity badge (e.g. clicking
  // "Medium" from Key Metrics while already on this page) - the URL param
  // changes but this component doesn't remount.
  useEffect(() => {
    if (SEVERITY_FILTERS.includes(initialSeverityFilter)) setSeverityFilter(initialSeverityFilter)
  }, [initialSeverityFilter])

  const displayRows =
    severityFilter === 'All'
      ? rows
      : rows.filter((r) => getRiskBand(r.likelihood, r.severity) === severityFilter)

  function handleFilterChange(level) {
    setSeverityFilter(level)
    onSeverityFilterChange?.(level)
  }

  // Covers both the initial mount (so an existing long entry isn't clipped
  // before its first keystroke) and any row added/removed/reordered - the
  // per-keystroke case is handled directly in each textarea's onChange.
  useEffect(() => {
    rows.forEach((r) => {
      autoResize(textareaRefs.current[`${r.id}-risk`])
      autoResize(textareaRefs.current[`${r.id}-mitigation`])
    })
  }, [rows])

  async function persist(nextRows) {
    setError(null)

    const { data, error } = await supabase
      .from('risk_logs')
      .update({ risks: nextRows, updated_at: new Date().toISOString() })
      .eq('id', riskLog.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this risk log.')
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
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={handleExportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportDocx}>
            Export Word
          </button>
          {canEdit && (
            <LoadingButton
              className="btn-secondary"
              loading={suggestLoading}
              loadingLabel="Thinking..."
              onClick={handleSuggest}
            >
              Suggest Additional Risks
            </LoadingButton>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="filter-tabs risk-log-severity-filter">
        {SEVERITY_FILTERS.map((level) => (
          <button
            key={level}
            type="button"
            className={`filter-tab ${severityFilter === level ? 'selected' : ''}`}
            onClick={() => handleFilterChange(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="risk-table-wrap">
        <table className="risk-log-table risk-log-main-table">
          <thead>
            <tr>
              <th>Risk</th>
              <th>Likelihood</th>
              <th>Severity</th>
              <th>Score</th>
              <th>Band</th>
              <th>Mitigation</th>
              <th>Owner</th>
              <th aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const score = getRiskScore(row.likelihood, row.severity)
              const band = getRiskBand(row.likelihood, row.severity)
              return (
              <tr key={row.id}>
                <td>
                  <textarea
                    ref={(el) => (textareaRefs.current[`${row.id}-risk`] = el)}
                    className="risk-cell-input"
                    value={row.risk}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      updateCell(row.id, 'risk', e.target.value)
                      autoResize(e.target)
                    }}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    className="risk-level-select"
                    value={row.likelihood ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      handleSelectChange(row.id, 'likelihood', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Unscored</option>
                    {LIKELIHOOD_SCALE.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value} - {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="risk-level-select"
                    value={row.severity ?? ''}
                    disabled={!canEdit}
                    onChange={(e) =>
                      handleSelectChange(row.id, 'severity', e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">Unscored</option>
                    {SEVERITY_SCALE.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value} - {s.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{score ?? '—'}</td>
                <td>
                  <span className={`risk-level-badge risk-level-${(band || 'unscored').toLowerCase()}`}>
                    {band || 'Needs scoring'}
                  </span>
                </td>
                <td>
                  <textarea
                    ref={(el) => (textareaRefs.current[`${row.id}-mitigation`] = el)}
                    className="risk-cell-input"
                    value={row.mitigation}
                    rows={2}
                    readOnly={!canEdit}
                    onChange={(e) => {
                      updateCell(row.id, 'mitigation', e.target.value)
                      autoResize(e.target)
                    }}
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
              )
            })}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  {rows.length === 0 ? 'No risks logged yet' : `No ${severityFilter} risks logged`}
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
                      Likelihood: {scaleLabel(LIKELIHOOD_SCALE, s.likelihood)} &middot; Severity:{' '}
                      {scaleLabel(SEVERITY_SCALE, s.severity)} &middot; Score:{' '}
                      {getRiskScore(s.likelihood, s.severity) ?? '—'} (
                      {getRiskBand(s.likelihood, s.severity) || 'Needs scoring'})
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
