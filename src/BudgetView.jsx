import { useState } from 'react'
import { supabase } from './supabaseClient'
import LoadingButton from './LoadingButton'

const VIEWS = [
  { key: 'summary', label: 'Summary' },
  { key: 'category', label: 'By Category' },
]

function newRow() {
  return {
    id: crypto.randomUUID(),
    category: '',
    name: '',
    capex_opex_class: null,
    gl_account: '',
    attachment_id: null,
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

function BudgetView({ project, charter, brief, tasks, budget, canEdit, onUpdate }) {
  const [rows, setRows] = useState(() => withIds(budget.line_items))
  const [attachments, setAttachments] = useState(() => budget.attachments || [])
  const [error, setError] = useState(null)
  const [view, setView] = useState('summary')
  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [exporting, setExporting] = useState(null)

  async function persist(nextRows, nextAttachments = attachments) {
    setError(null)

    const { data, error } = await supabase
      .from('budget_trackers')
      .update({ line_items: nextRows, attachments: nextAttachments, updated_at: new Date().toISOString() })
      .eq('id', budget.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this budget.')
      return
    }

    onUpdate(data[0])
  }

  // Uploads a new PDF to the private budget-attachments bucket at
  // {project_id}/{attachment_id}.pdf, appends it to this tracker's
  // attachments array, and links the given row to it - all in one persist
  // call. Returns an error message string on failure, null on success (the
  // calling cell reads this rather than throwing, same convention as
  // persist()'s own error state).
  async function handleNewAttachment(rowId, file) {
    const newId = crypto.randomUUID()
    const storagePath = `${project.id}/${newId}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('budget-attachments')
      .upload(storagePath, file, { contentType: 'application/pdf' })

    if (uploadError) return uploadError.message

    const attachment = {
      id: newId,
      filename: file.name,
      storage_path: storagePath,
      uploaded_at: new Date().toISOString(),
      size_bytes: file.size,
    }
    const nextAttachments = [...attachments, attachment]
    const nextRows = rows.map((r) => (r.id === rowId ? { ...r, attachment_id: newId } : r))

    setAttachments(nextAttachments)
    setRows(nextRows)
    await persist(nextRows, nextAttachments)
    return null
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
      exportBudgetPdf(project, rows)
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
      await exportBudgetDocx(project, rows)
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
      await exportBudgetExcel(project, rows)
    } catch (err) {
      setError('Failed to export Excel: ' + err.message)
    }
    setExporting(null)
  }

  async function handleSuggest() {
    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('budget', {
      body: { action: 'suggest', project, charter, brief, line_items: rows },
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
        capex_opex_class: null,
        gl_account: '',
        attachment_id: null,
        estimated_amount: Number(item.estimated_amount) || 0,
        actual_amount: 0,
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

  return (
    <div className="charter">
      <div className="section-header">
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
          {canEdit && (
            <LoadingButton
              className="btn-secondary"
              loading={suggestLoading}
              loadingLabel="Thinking..."
              onClick={handleSuggest}
            >
              Suggest Additional Line Items
            </LoadingButton>
          )}
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

      <h4 className="budget-line-items-heading">Line Items</h4>

      <div className="risk-table-wrap">
        <table className="risk-log-table task-gen-table budget-line-items-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Item</th>
              <th>Capex/Opex</th>
              <th>GL Account</th>
              <th>Estimated</th>
              <th>Actual Spent</th>
              <th>Notes</th>
              <th>Attachment</th>
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
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'category', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.name}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'name', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <select
                    value={row.capex_opex_class || ''}
                    disabled={!canEdit}
                    onChange={(e) => handleFieldChange(row.id, 'capex_opex_class', e.target.value || null)}
                  >
                    <option value=""></option>
                    <option value="capex">Capex</option>
                    <option value="opex">Opex</option>
                  </select>
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.gl_account}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'gl_account', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="risk-cell-input"
                    value={row.estimated_amount}
                    readOnly={!canEdit}
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
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'actual_amount', Math.max(0, Number(e.target.value) || 0))}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="risk-cell-input"
                    value={row.notes}
                    readOnly={!canEdit}
                    onChange={(e) => updateCell(row.id, 'notes', e.target.value)}
                    onBlur={handleTextBlur}
                  />
                </td>
                <td>
                  <BudgetAttachmentCell
                    row={row}
                    attachments={attachments}
                    canEdit={canEdit}
                    onLink={(attachmentId) => handleFieldChange(row.id, 'attachment_id', attachmentId)}
                    onUnlink={() => handleFieldChange(row.id, 'attachment_id', null)}
                    onNewAttachment={(file) => handleNewAttachment(row.id, file)}
                  />
                </td>
                <td>
                  {canEdit && (
                    <button
                      type="button"
                      className="risk-delete-btn"
                      aria-label="Delete line item"
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
                <td colSpan={9} className="empty">
                  No line items yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <button type="button" className="btn-secondary risk-add-btn" onClick={addRow}>
          + Add Line Item
        </button>
      )}

      {suggestions != null && canEdit && (
        <div className="risk-suggestions">
          {suggestions.length === 0 ? (
            <p className="charter-status">
              No additional line items identified beyond what's already budgeted.
            </p>
          ) : (
            <>
              <p className="risk-suggestions-label">
                Suggestions &mdash; not required, review and accept or dismiss each
              </p>
              {suggestions.map((s) => (
                <div className="risk-suggestion-card" key={s.id}>
                  <div className="risk-suggestion-body">
                    <p className="risk-suggestion-title">{s.name}</p>
                    <p className="risk-suggestion-meta">
                      Category: {s.category} &middot; Estimated: {formatCurrency(s.estimated_amount)}
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

// Per-line-item attachment control. No attachment linked: a button opens a
// small picker with two paths - upload a new PDF, or attach one already
// uploaded elsewhere on this tracker (the multi-line-same-invoice case).
// Attachment linked: a filename chip that opens a signed URL (the bucket is
// private, so no public URL exists) plus an unlink control. Unlinking only
// clears this row's attachment_id - the file and the attachments[] entry
// stay, since other lines may reference the same invoice.
function BudgetAttachmentCell({ row, attachments, canEdit, onLink, onUnlink, onNewAttachment }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [opening, setOpening] = useState(false)

  const linked = row.attachment_id ? attachments.find((a) => a.id === row.attachment_id) : null

  async function handleOpen() {
    if (!linked) return
    setOpening(true)
    setLocalError(null)
    const { data, error } = await supabase.storage
      .from('budget-attachments')
      .createSignedUrl(linked.storage_path, 60)
    setOpening(false)

    if (error || !data?.signedUrl) {
      setLocalError('Could not open file: ' + (error?.message || 'unknown error'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setLocalError(null)

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setLocalError('Only PDF files are allowed.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setLocalError('File is too large — 5MB max.')
      return
    }

    setUploading(true)
    const uploadError = await onNewAttachment(file)
    setUploading(false)

    if (uploadError) {
      setLocalError(uploadError)
      return
    }
    setPickerOpen(false)
  }

  function handleAttachExisting(e) {
    const attachmentId = e.target.value
    if (!attachmentId) return
    onLink(attachmentId)
    setPickerOpen(false)
  }

  if (linked) {
    return (
      <div className="budget-attachment-cell">
        <button
          type="button"
          className="budget-attachment-chip"
          onClick={handleOpen}
          disabled={opening}
          title={linked.filename}
        >
          {opening ? 'Opening...' : linked.filename}
        </button>
        {canEdit && (
          <button
            type="button"
            className="budget-attachment-unlink"
            aria-label="Remove attachment from this line"
            onClick={onUnlink}
          >
            &times;
          </button>
        )}
        {localError && <p className="error budget-attachment-error">{localError}</p>}
      </div>
    )
  }

  if (!canEdit) return <span className="budget-attachment-empty">&mdash;</span>

  return (
    <div className="budget-attachment-cell">
      {!pickerOpen && (
        <button
          type="button"
          className="btn-secondary budget-attachment-attach-btn"
          onClick={() => setPickerOpen(true)}
        >
          Attach invoice/PO
        </button>
      )}
      {pickerOpen && (
        <div className="budget-attachment-picker">
          <label className="budget-attachment-upload-label">
            Upload new PDF
            <input type="file" accept=".pdf,application/pdf" onChange={handleFileSelect} disabled={uploading} />
          </label>
          {attachments.length > 0 && (
            <select defaultValue="" disabled={uploading} onChange={handleAttachExisting}>
              <option value="" disabled>
                Attach existing...
              </option>
              {attachments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="btn-secondary"
            disabled={uploading}
            onClick={() => {
              setPickerOpen(false)
              setLocalError(null)
            }}
          >
            Cancel
          </button>
          {uploading && <span className="charter-status">Uploading...</span>}
          {localError && <p className="error budget-attachment-error">{localError}</p>}
        </div>
      )}
    </div>
  )
}

export default BudgetView
