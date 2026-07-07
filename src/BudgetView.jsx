import { useState } from 'react'
import { supabase } from './supabaseClient'

const VIEWS = [
  { key: 'summary', label: 'Summary' },
  { key: 'category', label: 'By Category' },
  { key: 'task', label: 'By Task' },
]

function newRow() {
  return {
    id: crypto.randomUUID(),
    category: '',
    name: '',
    task_id: null,
    estimated_amount: 0,
    actual_amount: 0,
    notes: '',
  }
}

function withIds(items) {
  return (items || []).map((r) => (r.id ? r : { ...r, id: crypto.randomUUID() }))
}

function formatCurrency(amount) {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function sum(rows, field) {
  return rows.reduce((total, r) => total + (Number(r[field]) || 0), 0)
}

function healthStatus(estimated, actual) {
  if (estimated === 0 && actual === 0) return null
  if (actual <= estimated) return { key: 'under', label: 'Under Budget' }
  if (actual <= estimated * 1.1) return { key: 'near', label: 'Near Limit' }
  return { key: 'over', label: 'Over Budget' }
}

function BudgetView({ project, charter, brief, tasks, budget, onUpdate }) {
  const [rows, setRows] = useState(() => withIds(budget.line_items))
  const [error, setError] = useState(null)
  const [view, setView] = useState('summary')
  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [exporting, setExporting] = useState(null)

  const taskById = new Map((tasks || []).map((t) => [t.id, t]))
  const existingTasks = (tasks || []).map((t) => ({ id: t.id, title: t.title }))

  async function persist(nextRows) {
    setError(null)

    const { data, error } = await supabase
      .from('budget_trackers')
      .update({ line_items: nextRows, updated_at: new Date().toISOString() })
      .eq('id', budget.id)
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

  function handleFieldChange(id, key, value) {
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
    setExporting('pdf')
    setError(null)
    try {
      const { exportBudgetPdf } = await import('./budgetExport')
      exportBudgetPdf(project, rows, tasks)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
    setExporting(null)
  }

  async function handleExportDocx() {
    setExporting('docx')
    setError(null)
    try {
      const { exportBudgetDocx } = await import('./budgetExport')
      await exportBudgetDocx(project, rows, tasks)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
    setExporting(null)
  }

  async function handleExportExcel() {
    setExporting('excel')
    setError(null)
    try {
      const { exportBudgetExcel } = await import('./budgetExport')
      await exportBudgetExcel(project, rows, tasks)
    } catch (err) {
      setError('Failed to export Excel: ' + err.message)
    }
    setExporting(null)
  }

  async function handleSuggest() {
    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('budget', {
      body: { action: 'suggest', project, charter, brief, line_items: rows, existingTasks },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setSuggestions(
      (data.line_items || []).map((item) => ({
        id: crypto.randomUUID(),
        category: item.category || '',
        name: item.name || '',
        estimated_amount: Number(item.estimated_amount) || 0,
        actual_amount: 0,
        task_id: existingTasks.some((t) => t.id === item.task_id) ? item.task_id : null,
        notes: item.notes || '',
      }))
    )
  }

  function acceptSuggestion(suggestion) {
    const next = [...rows, suggestion]
    setRows(next)
    persist(next)
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
  }

  function dismissSuggestion(id) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  const totalEstimated = sum(rows, 'estimated_amount')
  const totalActual = sum(rows, 'actual_amount')
  const totalVariance = totalActual - totalEstimated
  const totalVariancePct = totalEstimated > 0 ? (totalVariance / totalEstimated) * 100 : 0
  const health = healthStatus(totalEstimated, totalActual)

  const byCategory = Object.values(
    rows.reduce((acc, r) => {
      const key = (r.category || '').trim() || 'Uncategorized'
      if (!acc[key]) acc[key] = { key, estimated: 0, actual: 0 }
      acc[key].estimated += Number(r.estimated_amount) || 0
      acc[key].actual += Number(r.actual_amount) || 0
      return acc
    }, {})
  ).sort((a, b) => b.estimated - a.estimated)

  const byTask = Object.values(
    rows.reduce((acc, r) => {
      const key = r.task_id || 'unassigned'
      if (!acc[key]) {
        const task = r.task_id ? taskById.get(r.task_id) : null
        acc[key] = {
          key,
          label: r.task_id ? task?.title || '(deleted task)' : 'Unassigned',
          estimated: 0,
          actual: 0,
        }
      }
      acc[key].estimated += Number(r.estimated_amount) || 0
      acc[key].actual += Number(r.actual_amount) || 0
      return acc
    }, {})
  ).sort((a, b) => {
    if (a.key === 'unassigned') return 1
    if (b.key === 'unassigned') return -1
    return b.estimated - a.estimated
  })

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Budget Tracker</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" disabled={!!exporting} onClick={handleExportPdf}>
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
          <button type="button" className="btn-secondary" disabled={!!exporting} onClick={handleExportDocx}>
            {exporting === 'docx' ? 'Exporting...' : 'Export Word'}
          </button>
          <button type="button" className="btn-secondary" disabled={!!exporting} onClick={handleExportExcel}>
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={suggestLoading}
            onClick={handleSuggest}
          >
            {suggestLoading ? 'Thinking...' : 'Suggest Additional Line Items'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="toggle-group budget-view-toggle">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            className={view === v.key ? 'selected' : ''}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === 'summary' && (
        <div className="budget-summary-cards">
          <div className="budget-summary-card">
            <span className="budget-summary-label">Total Budget</span>
            <span className="budget-summary-value">{formatCurrency(totalEstimated)}</span>
          </div>
          <div className="budget-summary-card">
            <span className="budget-summary-label">Total Actual</span>
            <span className="budget-summary-value">{formatCurrency(totalActual)}</span>
          </div>
          <div className="budget-summary-card">
            <span className="budget-summary-label">Variance</span>
            <span className="budget-summary-value">
              {totalVariance >= 0 ? '+' : ''}
              {formatCurrency(totalVariance)}
              {totalEstimated > 0 && (
                <span className="budget-summary-pct"> ({totalVariancePct >= 0 ? '+' : ''}{totalVariancePct.toFixed(1)}%)</span>
              )}
            </span>
          </div>
          {health && (
            <div className={`budget-health-badge budget-health-${health.key}`}>{health.label}</div>
          )}
          {rows.length === 0 && <p className="charter-status">No line items yet</p>}
        </div>
      )}

      {view === 'category' && (
        <div className="risk-table-wrap">
          <table className="risk-log-table budget-rollup-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Budget</th>
                <th>Actual</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.map((c) => {
                const variance = c.actual - c.estimated
                return (
                  <tr key={c.key}>
                    <td>{c.key}</td>
                    <td>{formatCurrency(c.estimated)}</td>
                    <td>{formatCurrency(c.actual)}</td>
                    <td className={variance > 0 ? 'budget-variance-over' : 'budget-variance-under'}>
                      {variance >= 0 ? '+' : ''}
                      {formatCurrency(variance)}
                    </td>
                  </tr>
                )
              })}
              {byCategory.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    No line items yet
                  </td>
                </tr>
              )}
              {byCategory.length > 0 && (
                <tr className="budget-totals-row">
                  <td>Total</td>
                  <td>{formatCurrency(totalEstimated)}</td>
                  <td>{formatCurrency(totalActual)}</td>
                  <td className={totalVariance > 0 ? 'budget-variance-over' : 'budget-variance-under'}>
                    {totalVariance >= 0 ? '+' : ''}
                    {formatCurrency(totalVariance)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === 'task' && (
        <div className="risk-table-wrap">
          <table className="risk-log-table budget-rollup-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Budget</th>
                <th>Actual</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {byTask.map((t) => {
                const variance = t.actual - t.estimated
                return (
                  <tr key={t.key}>
                    <td>{t.label}</td>
                    <td>{formatCurrency(t.estimated)}</td>
                    <td>{formatCurrency(t.actual)}</td>
                    <td className={variance > 0 ? 'budget-variance-over' : 'budget-variance-under'}>
                      {variance >= 0 ? '+' : ''}
                      {formatCurrency(variance)}
                    </td>
                  </tr>
                )
              })}
              {byTask.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    No line items yet
                  </td>
                </tr>
              )}
              {byTask.length > 0 && (
                <tr className="budget-totals-row">
                  <td>Total</td>
                  <td>{formatCurrency(totalEstimated)}</td>
                  <td>{formatCurrency(totalActual)}</td>
                  <td className={totalVariance > 0 ? 'budget-variance-over' : 'budget-variance-under'}>
                    {totalVariance >= 0 ? '+' : ''}
                    {formatCurrency(totalVariance)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <h4 className="budget-line-items-heading">Line Items</h4>

      <div className="risk-table-wrap">
        <table className="risk-log-table task-gen-table budget-line-items-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Linked Task</th>
              <th>Estimated</th>
              <th>Actual Spent</th>
              <th>Notes</th>
              <th aria-hidden="true"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.category}
                    onChange={(e) => updateCell(row.id, 'category', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.name}
                    onChange={(e) => updateCell(row.id, 'name', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    value={row.task_id || ''}
                    onChange={(e) => handleFieldChange(row.id, 'task_id', e.target.value || null)}
                  >
                    <option value="">None</option>
                    {existingTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="risk-cell-input"
                    value={row.estimated_amount}
                    onChange={(e) => updateCell(row.id, 'estimated_amount', Math.max(0, Number(e.target.value) || 0))}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="risk-cell-input"
                    value={row.actual_amount}
                    onChange={(e) => updateCell(row.id, 'actual_amount', Math.max(0, Number(e.target.value) || 0))}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.notes}
                    onChange={(e) => updateCell(row.id, 'notes', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="risk-delete-btn"
                    aria-label="Delete line item"
                    onClick={() => deleteRow(row.id)}
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  No line items yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <button type="button" className="btn-secondary risk-add-btn" onClick={addRow}>
        + Add Line Item
      </button>

      {suggestions != null && (
        <div className="risk-suggestions">
          {suggestions.length === 0 ? (
            <p className="charter-status">
              No additional line items identified beyond what's already budgeted.
            </p>
          ) : (
            <>
              <p className="risk-suggestions-label">
                AI suggestions &mdash; not required, review and accept or dismiss each
              </p>
              {suggestions.map((s) => (
                <div className="risk-suggestion-card" key={s.id}>
                  <div className="risk-suggestion-body">
                    <p className="risk-suggestion-title">{s.name}</p>
                    <p className="risk-suggestion-meta">
                      Category: {s.category} &middot; Estimated: {formatCurrency(s.estimated_amount)}
                      {s.task_id ? ` · Linked: ${taskById.get(s.task_id)?.title || ''}` : ''}
                    </p>
                    {s.notes && <p className="risk-suggestion-mitigation">{s.notes}</p>}
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

export default BudgetView
