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

const TEXT_FIELDS = ['description', 'mitigation', 'owner', 'contingency_trigger', 'contingency_plan']

function RiskLogView({
  project,
  charter,
  brief,
  scoping,
  riskLog,
  tasks,
  canEdit,
  initialSeverityFilter,
  onSeverityFilterChange,
  highlightRiskId,
  onRiskHighlightDone,
  onTaskCreated,
}) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [severityFilter, setSeverityFilter] = useState(
    SEVERITY_FILTERS.includes(initialSeverityFilter) ? initialSeverityFilter : 'All'
  )
  const [expandedIds, setExpandedIds] = useState(() => new Set())
  const textareaRefs = useRef({})
  const rowRefs = useRef({})
  const [flashRiskId, setFlashRiskId] = useState(null)

  // Notes and additional task links are both per-risk child records - only
  // fetched once a row is actually expanded, not up front for every risk in
  // the log.
  const [notesByRisk, setNotesByRisk] = useState({})
  const [riskTasksByRisk, setRiskTasksByRisk] = useState({})
  const [detailLoadedIds, setDetailLoadedIds] = useState(() => new Set())
  const [noteDrafts, setNoteDrafts] = useState({})
  const [noteSubmitting, setNoteSubmitting] = useState(() => new Set())
  const [assistantNoteLoading, setAssistantNoteLoading] = useState(() => new Set())
  const [contingencyDrafts, setContingencyDrafts] = useState({})
  const [contingencyLoading, setContingencyLoading] = useState(() => new Set())
  const [linkTaskId, setLinkTaskId] = useState({})
  const [newTaskTitle, setNewTaskTitle] = useState({})

  useEffect(() => {
    if (SEVERITY_FILTERS.includes(initialSeverityFilter)) setSeverityFilter(initialSeverityFilter)
  }, [initialSeverityFilter])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('risks')
        .select('*')
        .eq('risk_log_id', riskLog.id)
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      setRows(data || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [riskLog.id])

  useEffect(() => {
    if (!highlightRiskId || loading) return
    setFlashRiskId(highlightRiskId)
    rowRefs.current[highlightRiskId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      setFlashRiskId(null)
      onRiskHighlightDone?.()
    }, 2000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightRiskId, loading])

  const displayRows =
    severityFilter === 'All'
      ? rows
      : rows.filter((r) => getRiskBand(r.likelihood, r.severity) === severityFilter)

  function handleFilterChange(level) {
    setSeverityFilter(level)
    onSeverityFilterChange?.(level)
  }

  async function loadDetails(riskId) {
    if (detailLoadedIds.has(riskId)) return
    setDetailLoadedIds((prev) => new Set(prev).add(riskId))

    const [notesRes, linksRes] = await Promise.all([
      supabase.from('risk_notes').select('*').eq('risk_id', riskId).order('created_at', { ascending: true }),
      supabase.from('risk_tasks').select('task_id, created_at').eq('risk_id', riskId),
    ])

    if (!notesRes.error) setNotesByRisk((prev) => ({ ...prev, [riskId]: notesRes.data || [] }))
    if (!linksRes.error) setRiskTasksByRisk((prev) => ({ ...prev, [riskId]: linksRes.data || [] }))
  }

  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        loadDetails(id)
      }
      return next
    })
  }

  useEffect(() => {
    rows.forEach((r) => {
      if (!expandedIds.has(r.id)) return
      autoResize(textareaRefs.current[`${r.id}-description`])
      TEXT_FIELDS.forEach((f) => autoResize(textareaRefs.current[`${r.id}-${f}`]))
    })
  }, [rows, expandedIds])

  function updateLocal(id, key, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)))
  }

  async function persistField(id, key, value) {
    setError(null)
    const { data, error } = await supabase.from('risks').update({ [key]: value }).eq('id', id).select().single()
    if (error) {
      setError(error.message)
      return
    }
    setRows((prev) => prev.map((r) => (r.id === id ? data : r)))
  }

  function handleTextBlur(id, key) {
    const row = rows.find((r) => r.id === id)
    if (row) persistField(id, key, row[key])
  }

  function handleSelectChange(id, key, value) {
    updateLocal(id, key, value)
    persistField(id, key, value)
  }

  async function addRow() {
    setError(null)
    const { data, error } = await supabase
      .from('risks')
      .insert({ risk_log_id: riskLog.id, title: '' })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setRows((prev) => [...prev, data])
    handleFilterChange('All')
    setExpandedIds((prev) => new Set(prev).add(data.id))
    setDetailLoadedIds((prev) => new Set(prev).add(data.id))
    setNotesByRisk((prev) => ({ ...prev, [data.id]: [] }))
    setRiskTasksByRisk((prev) => ({ ...prev, [data.id]: [] }))
  }

  async function deleteRow(id) {
    setError(null)
    const { error } = await supabase.from('risks').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
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
      body: { action: 'suggest', project, charter, brief, scoping, risks: rows },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setSuggestions((data.risks || []).map((r) => ({ ...r, id: crypto.randomUUID() })))
  }

  async function acceptSuggestion(suggestion) {
    setError(null)
    const { id: _id, ...rest } = suggestion
    const { data, error } = await supabase
      .from('risks')
      .insert({ risk_log_id: riskLog.id, ...rest })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setRows((prev) => [...prev, data])
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
  }

  function dismissSuggestion(id) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  async function handleSuggestContingency(row) {
    setContingencyLoading((prev) => new Set(prev).add(row.id))
    setError(null)

    const { data, error } = await supabase.functions.invoke('risk-log', {
      body: {
        action: 'suggest_contingency',
        project,
        risk: { title: row.title, description: row.description, likelihood: row.likelihood, severity: row.severity },
      },
    })

    setContingencyLoading((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setContingencyDrafts((prev) => ({
      ...prev,
      [row.id]: { contingency_trigger: data.contingency_trigger, contingency_plan: data.contingency_plan },
    }))
  }

  async function acceptContingency(id) {
    const draft = contingencyDrafts[id]
    if (!draft) return
    await persistField(id, 'contingency_trigger', draft.contingency_trigger)
    await persistField(id, 'contingency_plan', draft.contingency_plan)
    setContingencyDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  function dismissContingency(id) {
    setContingencyDrafts((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function handleAddNote(riskId) {
    const body = (noteDrafts[riskId] || '').trim()
    if (!body) return

    setNoteSubmitting((prev) => new Set(prev).add(riskId))
    setError(null)

    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('risk_notes')
      .insert({ risk_id: riskId, source: 'human', author_id: userData?.user?.id, body })
      .select()
      .single()

    setNoteSubmitting((prev) => {
      const next = new Set(prev)
      next.delete(riskId)
      return next
    })

    if (error) {
      setError(error.message)
      return
    }

    setNotesByRisk((prev) => ({ ...prev, [riskId]: [...(prev[riskId] || []), data] }))
    setNoteDrafts((prev) => ({ ...prev, [riskId]: '' }))
  }

  async function handleGenerateNote(row) {
    setAssistantNoteLoading((prev) => new Set(prev).add(row.id))
    setError(null)

    const { data, error } = await supabase.functions.invoke('risk-log', {
      body: {
        action: 'generate_note',
        project,
        risk: {
          id: row.id,
          title: row.title,
          description: row.description,
          likelihood: row.likelihood,
          severity: row.severity,
          mitigation: row.mitigation,
          owner: row.owner,
          contingency_trigger: row.contingency_trigger,
          contingency_plan: row.contingency_plan,
        },
      },
    })

    setAssistantNoteLoading((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    if (data.note) {
      setNotesByRisk((prev) => ({ ...prev, [row.id]: [...(prev[row.id] || []), data.note] }))
    }
  }

  async function linkPrimaryTask(row, taskId) {
    await persistField(row.id, 'task_id', taskId || null)
  }

  async function createAndLinkPrimaryTask(row) {
    const title = (newTaskTitle[row.id] || '').trim()
    if (!title) return
    setError(null)

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ title, project_id: project.id })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onTaskCreated?.(task)
    setNewTaskTitle((prev) => ({ ...prev, [row.id]: '' }))
    await linkPrimaryTask(row, task.id)
  }

  async function addRiskTaskLink(riskId, taskId) {
    if (!taskId) return
    setError(null)
    const { data, error } = await supabase
      .from('risk_tasks')
      .insert({ risk_id: riskId, task_id: taskId })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setRiskTasksByRisk((prev) => ({ ...prev, [riskId]: [...(prev[riskId] || []), data] }))
    setLinkTaskId((prev) => ({ ...prev, [riskId]: '' }))
  }

  async function removeRiskTaskLink(riskId, taskId) {
    setError(null)
    const { error } = await supabase.from('risk_tasks').delete().eq('risk_id', riskId).eq('task_id', taskId)
    if (error) {
      setError(error.message)
      return
    }
    setRiskTasksByRisk((prev) => ({ ...prev, [riskId]: (prev[riskId] || []).filter((l) => l.task_id !== taskId) }))
  }

  async function createAndLinkAdditionalTask(riskId) {
    const title = (newTaskTitle[`${riskId}-link`] || '').trim()
    if (!title) return
    setError(null)

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ title, project_id: project.id })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onTaskCreated?.(task)
    setNewTaskTitle((prev) => ({ ...prev, [`${riskId}-link`]: '' }))
    await addRiskTaskLink(riskId, task.id)
  }

  const taskTitleById = new Map((tasks || []).map((t) => [t.id, t.title]))

  if (loading) {
    return <p className="charter-status">Loading...</p>
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
          const notes = notesByRisk[row.id] || []
          const links = riskTasksByRisk[row.id] || []
          const contingencyDraft = contingencyDrafts[row.id]
          const linkableTasks = (tasks || []).filter(
            (t) => t.id !== row.task_id && !links.some((l) => l.task_id === t.id)
          )

          return (
            <li
              className={`risk-row ${isExpanded ? 'risk-row-expanded' : ''} ${flashRiskId === row.id ? 'hotspot-row-highlight' : ''}`}
              key={row.id}
              ref={(el) => {
                rowRefs.current[row.id] = el
              }}
            >
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
                  <span className="risk-row-title">{row.title || '(untitled risk)'}</span>
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
                    <span className="risk-field-label">Title</span>
                    <input
                      type="text"
                      className="risk-cell-input"
                      value={row.title}
                      readOnly={!canEdit}
                      onChange={(e) => updateLocal(row.id, 'title', e.target.value)}
                      onBlur={() => handleTextBlur(row.id, 'title')}
                    />
                  </label>

                  <label className="risk-field">
                    <span className="risk-field-label">Description</span>
                    <textarea
                      ref={(el) => (textareaRefs.current[`${row.id}-description`] = el)}
                      className="risk-cell-input risk-card-textarea"
                      value={row.description || ''}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateLocal(row.id, 'description', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={() => handleTextBlur(row.id, 'description')}
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
                      value={row.mitigation || ''}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateLocal(row.id, 'mitigation', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={() => handleTextBlur(row.id, 'mitigation')}
                    />
                  </label>

                  <label className="risk-field">
                    <span className="risk-field-label">Owner</span>
                    <textarea
                      ref={(el) => (textareaRefs.current[`${row.id}-owner`] = el)}
                      className="risk-cell-input risk-card-textarea"
                      value={row.owner || ''}
                      rows={2}
                      readOnly={!canEdit}
                      onChange={(e) => {
                        updateLocal(row.id, 'owner', e.target.value)
                        autoResize(e.target)
                      }}
                      onBlur={() => handleTextBlur(row.id, 'owner')}
                    />
                  </label>

                  <div className="risk-field">
                    <span className="risk-field-label">Contingency</span>
                    <label className="risk-field">
                      <span className="risk-field-label">If this happens (trigger)</span>
                      <textarea
                        ref={(el) => (textareaRefs.current[`${row.id}-contingency_trigger`] = el)}
                        className="risk-cell-input risk-card-textarea"
                        value={row.contingency_trigger || ''}
                        rows={2}
                        readOnly={!canEdit}
                        onChange={(e) => {
                          updateLocal(row.id, 'contingency_trigger', e.target.value)
                          autoResize(e.target)
                        }}
                        onBlur={() => handleTextBlur(row.id, 'contingency_trigger')}
                      />
                    </label>
                    <label className="risk-field">
                      <span className="risk-field-label">...then do this (plan)</span>
                      <textarea
                        ref={(el) => (textareaRefs.current[`${row.id}-contingency_plan`] = el)}
                        className="risk-cell-input risk-card-textarea"
                        value={row.contingency_plan || ''}
                        rows={2}
                        readOnly={!canEdit}
                        onChange={(e) => {
                          updateLocal(row.id, 'contingency_plan', e.target.value)
                          autoResize(e.target)
                        }}
                        onBlur={() => handleTextBlur(row.id, 'contingency_plan')}
                      />
                    </label>
                    {canEdit && (
                      <LoadingButton
                        className="btn-secondary"
                        loading={contingencyLoading.has(row.id)}
                        loadingLabel="Thinking..."
                        onClick={() => handleSuggestContingency(row)}
                      >
                        Suggest Contingency
                      </LoadingButton>
                    )}
                    {contingencyDraft && (
                      <div className="risk-suggestion-card">
                        <div className="risk-suggestion-body">
                          <p className="risk-suggestion-title">Trigger: {contingencyDraft.contingency_trigger}</p>
                          <p className="risk-suggestion-mitigation">Plan: {contingencyDraft.contingency_plan}</p>
                        </div>
                        <div className="risk-suggestion-actions">
                          <button type="button" className="btn-secondary" onClick={() => dismissContingency(row.id)}>
                            Dismiss
                          </button>
                          <button type="button" className="btn-primary" onClick={() => acceptContingency(row.id)}>
                            Accept
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="risk-field">
                    <span className="risk-field-label">Linked Task</span>
                    {row.task_id ? (
                      <p className="charter-status">{taskTitleById.get(row.task_id) || '(task no longer exists)'}</p>
                    ) : (
                      <p className="charter-status">None linked</p>
                    )}
                    {canEdit && (
                      <>
                        <select
                          value={row.task_id || ''}
                          onChange={(e) => linkPrimaryTask(row, e.target.value)}
                        >
                          <option value="">None</option>
                          {(tasks || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="New task title..."
                          value={newTaskTitle[row.id] || ''}
                          onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        />
                        <button type="button" className="btn-secondary" onClick={() => createAndLinkPrimaryTask(row)}>
                          Create &amp; Link New Task
                        </button>
                      </>
                    )}
                  </div>

                  {links.length > 0 && (
                    <div className="risk-field">
                      <span className="risk-field-label">Additional Linked Tasks</span>
                      <ul>
                        {links.map((l) => (
                          <li key={l.task_id}>
                            {taskTitleById.get(l.task_id) || '(task no longer exists)'}
                            {canEdit && (
                              <button type="button" onClick={() => removeRiskTaskLink(row.id, l.task_id)}>
                                Remove
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {canEdit && (
                    <div className="risk-field">
                      <select
                        value={linkTaskId[row.id] || ''}
                        onChange={(e) => setLinkTaskId((prev) => ({ ...prev, [row.id]: e.target.value }))}
                      >
                        <option value="">Link another task...</option>
                        {linkableTasks.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => addRiskTaskLink(row.id, linkTaskId[row.id])}
                      >
                        Link
                      </button>
                      <input
                        type="text"
                        placeholder="New task title..."
                        value={newTaskTitle[`${row.id}-link`] || ''}
                        onChange={(e) =>
                          setNewTaskTitle((prev) => ({ ...prev, [`${row.id}-link`]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => createAndLinkAdditionalTask(row.id)}
                      >
                        Create &amp; Link New Task
                      </button>
                    </div>
                  )}

                  <div className="risk-field">
                    <span className="risk-field-label">Notes</span>
                    <ul className="risk-notes-list">
                      {notes.map((n) => (
                        <li key={n.id} className={n.source === 'assistant' ? 'risk-note-assistant' : 'risk-note-human'}>
                          <span className="risk-note-source">{n.source === 'assistant' ? 'Assistant' : 'PM'}</span>
                          <span className="risk-note-body">{n.body}</span>
                          <span className="risk-note-time">{new Date(n.created_at).toLocaleString()}</span>
                        </li>
                      ))}
                      {notes.length === 0 && <li className="empty">No notes yet</li>}
                    </ul>
                    {canEdit && (
                      <>
                        <textarea
                          rows={2}
                          placeholder="Add a note..."
                          value={noteDrafts[row.id] || ''}
                          onChange={(e) => setNoteDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={noteSubmitting.has(row.id) || !(noteDrafts[row.id] || '').trim()}
                          onClick={() => handleAddNote(row.id)}
                        >
                          {noteSubmitting.has(row.id) ? 'Adding...' : 'Add Note'}
                        </button>
                        <LoadingButton
                          className="btn-secondary"
                          loading={assistantNoteLoading.has(row.id)}
                          loadingLabel="Thinking..."
                          onClick={() => handleGenerateNote(row)}
                        >
                          Ask Assistant for a Note
                        </LoadingButton>
                      </>
                    )}
                  </div>

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
                Suggestions &mdash; not required, review and accept or dismiss each
              </p>
              {suggestions.map((s) => (
                <div className="risk-suggestion-card" key={s.id}>
                  <div className="risk-suggestion-body">
                    <p className="risk-suggestion-title">{s.title}</p>
                    {s.description && <p className="risk-suggestion-mitigation">{s.description}</p>}
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
