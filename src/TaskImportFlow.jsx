import { useState } from 'react'
import { supabase } from './supabaseClient'
import DependencyPicker from './components/DependencyPicker'
import { guessColumnMapping, parseDateCell, parseSpreadsheetFile } from './spreadsheetImport'

const TASK_FIELDS = [
  { key: 'title', label: 'Title', required: true },
  { key: 'description', label: 'Description' },
  { key: 'start_date', label: 'Start Date' },
  { key: 'due_date', label: 'Due Date' },
  { key: 'depends_on', label: 'Depends On' },
]

const FIELD_HEADER_HINTS = {
  title: ['title', 'task', 'name'],
  description: ['description', 'desc', 'notes'],
  start_date: ['start date', 'start', 'begin'],
  due_date: ['due date', 'due', 'end date', 'deadline'],
  depends_on: ['depends on', 'dependency', 'dependencies', 'predecessor'],
}

function cellAt(raw, mapping, key) {
  const colIndex = mapping[key]
  return colIndex == null ? '' : (raw[colIndex] ?? '').toString().trim()
}

// Builds the review-table rows from the raw parsed spreadsheet + the
// confirmed column mapping. Depends On is matched by TITLE (case-
// insensitive), against either another row in this same import batch or an
// existing task already on the project - spreadsheets have no concept of
// this app's task ids, so title is the only practical join key. Anything
// that can't be resolved gets flagged rather than silently dropped or
// failing the whole import.
function buildProposedRows(rawRows, mapping, existingTasks) {
  const existingByTitle = new Map(existingTasks.map((t) => [t.title.trim().toLowerCase(), t.id]))

  const draft = rawRows.map((raw, i) => {
    const title = cellAt(raw, mapping, 'title')
    const startRaw = cellAt(raw, mapping, 'start_date')
    const dueRaw = cellAt(raw, mapping, 'due_date')
    const dependsOnRaw = cellAt(raw, mapping, 'depends_on')

    const startParsed = parseDateCell(startRaw)
    const dueParsed = parseDateCell(dueRaw)

    const issues = []
    if (!title) issues.push('Missing title')
    if (startRaw && startParsed === undefined) issues.push('Unparseable start date - left blank')
    if (dueRaw && dueParsed === undefined) issues.push('Unparseable due date - left blank')

    return {
      temp_id: `r${i}`,
      title,
      description: cellAt(raw, mapping, 'description'),
      start_date: startParsed || '',
      due_date: dueParsed || '',
      dependsOnRaw,
      issues,
      selected: true,
    }
  })

  const byTitleInBatch = new Map(
    draft.filter((r) => r.title).map((r) => [r.title.trim().toLowerCase(), r.temp_id])
  )

  return draft.map((r) => {
    const { dependsOnRaw, issues, ...rest } = r
    // The spreadsheet cell only ever encodes one predecessor title - stored
    // as a single-entry array so the review table's DependencyPicker can
    // add more, same as TaskGenFlow's single-AI-proposed depends_on.
    let depends_on = []
    const rowIssues = [...issues]

    if (dependsOnRaw) {
      const key = dependsOnRaw.trim().toLowerCase()
      if (byTitleInBatch.has(key) && byTitleInBatch.get(key) !== r.temp_id) {
        depends_on = [byTitleInBatch.get(key)]
      } else if (existingByTitle.has(key)) {
        depends_on = [existingByTitle.get(key)]
      } else {
        rowIssues.push(`"Depends On" value "${dependsOnRaw}" doesn't match any task title`)
      }
    }

    return { ...rest, depends_on, issues: rowIssues }
  })
}

// Excel/CSV import for Waterfall (and Hybrid's Waterfall side) tasks -
// upload -> map spreadsheet columns to task fields -> the same bulk
// accept/edit/reject review table as Task Gen/Backlog Gen/Retro Facts Gen,
// not a silent bulk-insert -> commit. Reuses TaskGenFlow's dependency-
// ordering insert logic since Depends On here can also reference another
// row in the same batch.
function TaskImportFlow({ project, existingTasks, onCommitted, onDone, onCancel }) {
  const [phase, setPhase] = useState('upload')
  const [error, setError] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [proposed, setProposed] = useState([])
  const [savedCount, setSavedCount] = useState(0)

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    try {
      const { headers: parsedHeaders, rows } = await parseSpreadsheetFile(file)
      if (parsedHeaders.length === 0) {
        setError('No columns found - is the first row a header row?')
        return
      }
      setHeaders(parsedHeaders)
      setRawRows(rows)
      setMapping(guessColumnMapping(parsedHeaders, FIELD_HEADER_HINTS))
      setPhase('mapping')
    } catch (err) {
      setError(err.message)
    }
  }

  function updateMapping(field, value) {
    setMapping((prev) => ({ ...prev, [field]: value === '' ? undefined : Number(value) }))
  }

  function handleContinueToReview() {
    setProposed(buildProposedRows(rawRows, mapping, existingTasks))
    setPhase('review')
  }

  function updateRow(tempId, field, value) {
    setProposed((prev) => prev.map((r) => (r.temp_id === tempId ? { ...r, [field]: value } : r)))
  }

  function deleteRow(tempId) {
    setProposed((prev) =>
      prev
        .filter((r) => r.temp_id !== tempId)
        .map((r) => ({ ...r, depends_on: (r.depends_on || []).filter((id) => id !== tempId) }))
    )
  }

  function toggleAll(checked) {
    setProposed((prev) => prev.map((r) => ({ ...r, selected: checked })))
  }

  const selectedRows = proposed.filter((r) => r.selected)
  const selectedCount = selectedRows.length
  const hasInvalidSelected = selectedRows.some((r) => !r.title.trim())

  // DependencyPicker's combined id-space for the review table - see
  // TaskGenFlow's identical computation for why only in-batch edges are
  // needed for the cycle guard.
  const pickerTasks = [
    ...proposed.map((r) => ({ id: r.temp_id, title: r.title || '(untitled)', isVirtual: true })),
    ...existingTasks,
  ]
  const pickerDependencies = proposed.flatMap((r) =>
    (r.depends_on || []).map((depends_on_id) => ({ task_id: r.temp_id, depends_on_id }))
  )

  async function handleCommit() {
    if (selectedRows.length === 0 || hasInvalidSelected) return

    setPhase('saving')
    setSavedCount(0)
    setError(null)

    const existingById = new Map(existingTasks.map((t) => [t.id, t]))
    const selectedByTempId = new Map(selectedRows.map((r) => [r.temp_id, r]))

    // Kahn's algorithm: order selected rows so every in-batch dependency is
    // inserted before its dependent - a row can now have multiple
    // predecessors. A cycle shouldn't occur from a well-formed import, but
    // if editing produced one, break it by dropping whatever in-batch edges
    // are left on the stuck rows rather than hanging.
    const order = []
    const remaining = new Map(selectedRows.map((r) => [r.temp_id, r]))
    const blockedBy = new Map(
      selectedRows.map((r) => [
        r.temp_id,
        new Set((r.depends_on || []).filter((id) => selectedByTempId.has(id))),
      ])
    )
    while (remaining.size > 0) {
      const next = [...remaining.values()].find((r) => blockedBy.get(r.temp_id).size === 0)
      if (!next) {
        remaining.forEach((r) =>
          order.push({ ...r, depends_on: (r.depends_on || []).filter((id) => existingById.has(id)) })
        )
        break
      }
      order.push(next)
      remaining.delete(next.temp_id)
      remaining.forEach((r) => blockedBy.get(r.temp_id).delete(next.temp_id))
    }

    const tempIdToReal = new Map()
    const insertedTempIds = new Set()
    const inserted = []
    const insertedDeps = []

    for (const row of order) {
      const dependsOnRealIds = []
      for (const depId of row.depends_on || []) {
        if (existingById.has(depId)) dependsOnRealIds.push(depId)
        else if (tempIdToReal.has(depId)) dependsOnRealIds.push(tempIdToReal.get(depId))
        // Otherwise the dependency target was unchecked or deleted - this
        // edge just gets dropped rather than erroring.
      }

      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: row.title.trim(),
          description: row.description.trim() || null,
          start_date: row.start_date || null,
          due_date: row.due_date || null,
        })
        .select()
        .single()

      if (insertError) {
        if (inserted.length > 0) {
          onCommitted(inserted, insertedDeps)
          setProposed((prev) => prev.filter((r) => !insertedTempIds.has(r.temp_id)))
        }
        setError(
          `${insertError.message}${inserted.length > 0 ? ` (${inserted.length} task${inserted.length === 1 ? '' : 's'} were already added before this failure - review the rest below)` : ''}`
        )
        setPhase('review')
        return
      }

      tempIdToReal.set(row.temp_id, data.id)
      insertedTempIds.add(row.temp_id)
      inserted.push(data)
      setSavedCount(inserted.length)

      if (dependsOnRealIds.length > 0) {
        const { data: depRows, error: depError } = await supabase
          .from('task_dependencies')
          .insert(dependsOnRealIds.map((depends_on_id) => ({ task_id: data.id, depends_on_id })))
          .select()

        // A dependency-link failure shouldn't abort the whole commit - the
        // task itself saved fine and is more valuable to keep than to roll
        // back over a missing connector line.
        if (!depError) insertedDeps.push(...depRows)
      }
    }

    onCommitted(inserted, insertedDeps)
    onDone()
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Import Tasks from Excel</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {error && <p className="error">{error}</p>}

        {phase === 'upload' && (
          <>
            <p className="charter-status">
              Upload a .xlsx or .csv file with a header row. You&rsquo;ll map its columns to task
              fields next.
            </p>
            <input type="file" accept=".xlsx,.csv" onChange={handleFileSelect} />
          </>
        )}

        {phase === 'mapping' && (
          <>
            <p className="charter-status">
              Map each spreadsheet column to a task field. Title is required; leave the rest as
              &ldquo;None&rdquo; to skip.
            </p>

            <div className="import-mapping-list">
              {TASK_FIELDS.map(({ key, label, required }) => (
                <label key={key} className="import-mapping-row">
                  {label}
                  {required ? ' *' : ''}
                  <select value={mapping[key] ?? ''} onChange={(e) => updateMapping(key, e.target.value)}>
                    <option value="">None</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setPhase('upload')}>
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={mapping.title == null}
                onClick={handleContinueToReview}
              >
                Continue to Review
              </button>
            </div>
          </>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="task-gen-review">
            <p className="charter-status">
              Review the parsed rows below - edit anything, uncheck or delete what you don't want,
              then add the rest. Rows with issues are flagged but won&rsquo;t block the rest of the
              import.
            </p>

            <div className="risk-table-wrap">
              <table className="risk-log-table task-gen-table">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={proposed.length > 0 && proposed.every((r) => r.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                        aria-label="Select all"
                      />
                    </th>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Start</th>
                    <th>Due</th>
                    <th>Depends on</th>
                    <th>Issues</th>
                    <th aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>
                  {proposed.map((row) => (
                    <tr
                      key={row.temp_id}
                      className={`${row.selected ? '' : 'task-gen-row-excluded'} ${row.issues.length > 0 ? 'import-row-issue' : ''}`}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(row.temp_id, 'selected', e.target.checked)}
                          aria-label={`Include ${row.title || 'this row'}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="risk-cell-input"
                          value={row.title}
                          onChange={(e) => updateRow(row.temp_id, 'title', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="risk-cell-input"
                          value={row.description}
                          onChange={(e) => updateRow(row.temp_id, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="risk-cell-input"
                          value={row.start_date}
                          onChange={(e) => updateRow(row.temp_id, 'start_date', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="risk-cell-input"
                          value={row.due_date}
                          onChange={(e) => updateRow(row.temp_id, 'due_date', e.target.value)}
                        />
                      </td>
                      <td>
                        <DependencyPicker
                          tasks={pickerTasks}
                          dependencies={pickerDependencies}
                          currentTaskId={row.temp_id}
                          selectedIds={row.depends_on || []}
                          onChange={(nextSelectedIds) => updateRow(row.temp_id, 'depends_on', nextSelectedIds)}
                          placeholder="Search tasks…"
                        />
                      </td>
                      <td className="import-issues-cell">
                        {row.issues.map((issue, i) => (
                          <span key={i} className="import-issue-tag">
                            {issue}
                          </span>
                        ))}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="risk-delete-btn"
                          aria-label="Remove row"
                          onClick={() => deleteRow(row.temp_id)}
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proposed.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty">
                        No rows parsed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasInvalidSelected && (
              <p className="error">Give every selected row a title before adding.</p>
            )}
            {phase === 'saving' && (
              <p className="charter-status">
                Adding tasks... ({savedCount} of {selectedCount})
              </p>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onCancel}
                disabled={phase === 'saving'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedCount === 0 || hasInvalidSelected || phase === 'saving'}
                onClick={handleCommit}
              >
                {phase === 'saving'
                  ? 'Adding...'
                  : `Add ${selectedCount} Selected Task${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TaskImportFlow
