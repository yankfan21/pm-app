import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportRiskLogDocx, exportRiskLogPdf } from './riskLogExport'
import LoadingButton from './LoadingButton'
import { LIKELIHOOD_SCALE, SEVERITY_SCALE, getRiskScore, getRiskBand, scaleLabel } from './riskScale'

// Same manual-height-tracking approach as CharterView.jsx's autoResize -
// a plain <textarea rows={2}> clips or scrolls anything past its fixed
// 2-row height instead of growing.
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
  // Per-row expand state, same collapsed-row/expand-on-click convention as
  // Backlog/Tasks-and-Milestones' group collapsing (collapseOverrides +
  // .collapsible-toggle/.chevron in BacklogView.jsx/PlanningTasksRoute.jsx),
  // just at per-risk granularity instead of per-group - risks have no
  // natural grouping to collapse by, so each row is its own independently
  // toggleable unit. A row stays expanded until explicitly collapsed again
  // (clicking its header, or the delete action) - it does not auto-collapse
  // on blur/save, matching how those group views never auto-collapse
  // mid-edit either.
  const [expandedIds, setExpandedIds] = useState(() => new Set())
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

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Only expanded rows render textareas at all (collapsed rows show plain
  // text), so this only needs to size whichever are currently mounted -
  // covers both the initial mount of a freshly-expanded row and any
  // programmatic value change; the per-keystroke case is handled directly
  // in each textarea's onChange.
  useEffect(() => {
    rows.forEach((r) => {
      if (!expandedIds.has(r.id)) return
      autoResize(textareaRefs.current[`${r.id}-risk`])
      autoResize(textareaRefs.current[`${r.id}-mitigation`])
      autoResize(textareaRefs.current[`${r.id}-owner`])
    })
  }, [rows, expandedIds])

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
    const row = newRow()
    const next = [...rows, row]
    setRows(next)
    persist(next)
    // Opens already expanded so the PM can fill in Likelihood/Severity/
    // Mitigation/Owner immediately, rather than having to click it open
    // right after creating it.
    setExpandedIds((prev) => new Set(prev).add(row.id))
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

      <ul className="risk-list">
        {displayRows.map((row) => {
          const score = getRiskScore(row.likelihood, row.severity)
          const band = getRiskBand(row.likelihood, row.severity)
          const bandClass = (band || 'unscored').toLowerCase()
          const isExpanded = expandedIds.has(row.id)

          return (
            <li className={`risk-row ${isExpanded ? 'risk-row-expanded' : ''}`} key={row.id}>
              <div className="risk-row-header">
                <button
                  type="button"
                  className="collapsible-toggle risk-row-toggle"
                  aria-expanded={isExpanded}
                  onClick={() => toggleExpanded(row.id)}
                >
                  <span className={`chevron ${isExpanded ? '' : 'collapsed'}`} aria-hidden="true">
                    ▾
                  </span>
                  <span className="risk-row-title">{row.risk || '(untitled risk)'}</span>
                  {!isExpanded && (
                    <>
                      <span className={`risk-level-badge risk-row-band risk-level-${bandClass}`}>
                        {band || 'Needs scoring'}
                      </span>
                      <span className="risk-row-score">{score ?? '—'}</span>
                      <span className="risk-row-owner">{row.owner || 'Unassigned'}</span>
                    </>
                  )}
                </button>
                {canEdit && !isExpanded && (
                  <button
                    type="button"
                    className="risk-delete-btn"
                    aria-label="Delete risk"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteRow(row.id)
                    }}
                  >
                    &times;
                  </button>
                )}
              </div>

              {isExpanded && (
                <div className="risk-card-body">
                  <label className="risk-field">
                    <span className="risk-field-label">Risk</span>
                    <textarea
                      ref={(el) => (textareaRefs.current[`${row.id}-risk`] = el)}
                      className="risk-cell-input risk-card-textarea"
                      value={row.risk}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateCell(row.id, 'risk', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={handleTextBlur}
                    />
                  </label>

                  <div className="risk-score-row">
                    <label className="risk-field risk-field-narrow">
                      <span className="risk-field-label">Likelihood</span>
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
                    </label>

                    <label className="risk-field risk-field-narrow">
                      <span className="risk-field-label">Severity</span>
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
                    </label>

                    <div className="risk-field risk-field-narrow">
                      <span className="risk-field-label">Score / Band</span>
                      <div className="risk-score-band-value">
                        <span className="risk-score-cell">{score ?? '—'}</span>
                        <span className={`risk-level-badge risk-level-${bandClass}`}>
                          {band || 'Needs scoring'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <label className="risk-field">
                    <span className="risk-field-label">Mitigation</span>
                    <textarea
                      ref={(el) => (textareaRefs.current[`${row.id}-mitigation`] = el)}
                      className="risk-cell-input risk-card-textarea"
                      value={row.mitigation}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateCell(row.id, 'mitigation', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={handleTextBlur}
                    />
                  </label>

                  <label className="risk-field">
                    <span className="risk-field-label">Owner</span>
                    <textarea
                      ref={(el) => (textareaRefs.current[`${row.id}-owner`] = el)}
                      className="risk-cell-input risk-card-textarea"
                      value={row.owner}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateCell(row.id, 'owner', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={handleTextBlur}
                    />
                  </label>

                  {canEdit && (
                    <div className="risk-card-actions">
                      <button
                        type="button"
                        className="btn-secondary risk-delete-btn-labeled"
                        onClick={() => deleteRow(row.id)}
                      >
                        Delete Risk
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {displayRows.length === 0 && (
          <li className="empty">{rows.length === 0 ? 'No risks logged yet' : `No ${severityFilter} risks logged`}</li>
        )}
      </ul>

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
