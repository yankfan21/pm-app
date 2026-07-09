import { useState } from 'react'
import { supabase } from './supabaseClient'
import { guessColumnMapping, parseSpreadsheetFile } from './spreadsheetImport'
import { STORY_POINT_OPTIONS } from './storyPoints'

const BACKLOG_STATUS_OPTIONS = ['backlog', 'ready', 'in_sprint', 'done']

const FIELD_HEADER_HINTS = {
  title: ['title', 'item', 'name'],
  description: ['description', 'desc', 'notes'],
  story_points: ['story points', 'points', 'estimate', 'size'],
  epic_name: ['epic', 'milestone', 'phase'],
  backlog_status: ['status', 'backlog status', 'state'],
}

function cellAt(raw, mapping, key) {
  const colIndex = mapping[key]
  return colIndex == null ? '' : (raw[colIndex] ?? '').toString().trim()
}

// Rounds to the nearest valid Fibonacci value rather than silently accepting
// or silently dropping an out-of-scale number - the row gets flagged either
// way so the PM sees exactly what changed before committing.
function resolveStoryPoints(raw) {
  const trimmed = (raw || '').trim()
  if (!trimmed) return { value: null, issue: null }

  const num = Number(trimmed)
  if (isNaN(num)) return { value: null, issue: `Story points "${trimmed}" isn't a number - left blank` }
  if (STORY_POINT_OPTIONS.includes(num)) return { value: num, issue: null }

  const nearest = STORY_POINT_OPTIONS.reduce((a, b) => (Math.abs(b - num) < Math.abs(a - num) ? b : a))
  return { value: nearest, issue: `Story points ${num} isn't a valid Fibonacci value - rounded to ${nearest}` }
}

function resolveBacklogStatus(raw) {
  const trimmed = (raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!trimmed) return { value: 'backlog', issue: null }
  if (BACKLOG_STATUS_OPTIONS.includes(trimmed)) return { value: trimmed, issue: null }
  return { value: 'backlog', issue: `Backlog status "${raw}" not recognized - defaulted to Backlog` }
}

function buildProposedRows(rawRows, mapping, isHybrid) {
  return rawRows.map((raw, i) => {
    const title = cellAt(raw, mapping, 'title')
    const { value: storyPoints, issue: pointsIssue } = resolveStoryPoints(cellAt(raw, mapping, 'story_points'))
    const { value: backlogStatus, issue: statusIssue } = resolveBacklogStatus(
      cellAt(raw, mapping, 'backlog_status')
    )

    const issues = []
    if (!title) issues.push('Missing title')
    if (pointsIssue) issues.push(pointsIssue)
    if (statusIssue) issues.push(statusIssue)

    return {
      temp_id: `r${i}`,
      title,
      description: cellAt(raw, mapping, 'description'),
      story_points: storyPoints,
      epic_name: isHybrid ? cellAt(raw, mapping, 'epic_name') : '',
      backlog_status: backlogStatus,
      issues,
      selected: true,
    }
  })
}

// Excel/CSV import for the Agile/Hybrid Backlog - same upload -> map ->
// review -> commit flow as TaskImportFlow, mapping to backlog fields
// instead. Committed rows are ordinary tasks rows with backlog_status,
// backlog_rank appended after the current max, story_points, and epic_name
// - the same shape BacklogGenFlow already produces.
function BacklogImportFlow({ project, existingBacklogItems, onCommitted, onDone, onCancel }) {
  const [phase, setPhase] = useState('upload')
  const [error, setError] = useState(null)
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [proposed, setProposed] = useState([])
  const [savedCount, setSavedCount] = useState(0)

  const isHybrid = project.methodology === 'hybrid'

  const fields = [
    { key: 'title', label: 'Title', required: true },
    { key: 'description', label: 'Description' },
    { key: 'story_points', label: 'Story Points' },
    ...(isHybrid ? [{ key: 'epic_name', label: 'Epic' }] : []),
    { key: 'backlog_status', label: 'Backlog Status' },
  ]

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
    setProposed(buildProposedRows(rawRows, mapping, isHybrid))
    setPhase('review')
  }

  function updateRow(tempId, field, value) {
    setProposed((prev) => prev.map((r) => (r.temp_id === tempId ? { ...r, [field]: value } : r)))
  }

  function deleteRow(tempId) {
    setProposed((prev) => prev.filter((r) => r.temp_id !== tempId))
  }

  function toggleAll(checked) {
    setProposed((prev) => prev.map((r) => ({ ...r, selected: checked })))
  }

  const selectedRows = proposed.filter((r) => r.selected)
  const selectedCount = selectedRows.length
  const hasInvalidSelected = selectedRows.some((r) => !r.title.trim())

  async function handleCommit() {
    if (selectedRows.length === 0 || hasInvalidSelected) return

    setPhase('saving')
    setSavedCount(0)
    setError(null)

    let nextRank =
      existingBacklogItems && existingBacklogItems.length > 0
        ? Math.max(...existingBacklogItems.map((t) => t.backlog_rank ?? 0)) + 1
        : 0

    const inserted = []
    const insertedTempIds = new Set()

    for (const row of selectedRows) {
      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: row.title.trim(),
          description: row.description.trim() || null,
          story_points: row.story_points,
          epic_name: isHybrid ? row.epic_name.trim() || null : null,
          backlog_rank: nextRank,
          backlog_status: row.backlog_status,
        })
        .select()
        .single()

      if (insertError) {
        if (inserted.length > 0) {
          onCommitted(inserted)
          setProposed((prev) => prev.filter((r) => !insertedTempIds.has(r.temp_id)))
        }
        setError(
          `${insertError.message}${inserted.length > 0 ? ` (${inserted.length} item${inserted.length === 1 ? '' : 's'} were already added before this failure - review the rest below)` : ''}`
        )
        setPhase('review')
        return
      }

      insertedTempIds.add(row.temp_id)
      inserted.push(data)
      nextRank += 1
      setSavedCount(inserted.length)
    }

    onCommitted(inserted)
    onDone()
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Import Backlog from Excel</h3>
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
              Upload a .xlsx or .csv file with a header row. You&rsquo;ll map its columns to
              backlog fields next.
            </p>
            <input type="file" accept=".xlsx,.csv" onChange={handleFileSelect} />
          </>
        )}

        {phase === 'mapping' && (
          <>
            <p className="charter-status">
              Map each spreadsheet column to a backlog field. Title is required; leave the rest as
              &ldquo;None&rdquo; to skip.
            </p>

            <div className="import-mapping-list">
              {fields.map(({ key, label, required }) => (
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
                    <th>Points</th>
                    {isHybrid && <th>Epic</th>}
                    <th>Status</th>
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
                        <select
                          value={row.story_points ?? ''}
                          onChange={(e) =>
                            updateRow(row.temp_id, 'story_points', e.target.value ? Number(e.target.value) : null)
                          }
                        >
                          <option value="">-</option>
                          {STORY_POINT_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                      {isHybrid && (
                        <td>
                          <input
                            type="text"
                            className="risk-cell-input"
                            value={row.epic_name}
                            onChange={(e) => updateRow(row.temp_id, 'epic_name', e.target.value)}
                          />
                        </td>
                      )}
                      <td>
                        <select
                          value={row.backlog_status}
                          onChange={(e) => updateRow(row.temp_id, 'backlog_status', e.target.value)}
                        >
                          {BACKLOG_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
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
                      <td colSpan={isHybrid ? 8 : 7} className="empty">
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
                Adding items... ({savedCount} of {selectedCount})
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
                  : `Add ${selectedCount} Selected Item${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BacklogImportFlow
