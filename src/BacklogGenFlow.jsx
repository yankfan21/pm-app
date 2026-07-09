import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import { STORY_POINT_OPTIONS } from './storyPoints'

// AI starter-backlog generation, available once a Charter exists on an
// Agile or Hybrid project - the Backlog counterpart to TaskGenFlow's
// Charter-informed task generation. Same Q&A-then-review pattern (same
// edge-function call shape, same QaStepper reuse, same bulk editable-table
// review instead of one-by-one accept/decline), just proposing backlog
// items (title/description/story points/epic) instead of tasks
// (title/duration/dependency).
//
// Nothing is written to the tasks table until the PM clicks the commit
// button in the review table; existingBacklogItems is passed to the edge
// function purely as "don't duplicate/here's what's already there"
// context, never as something the AI edits.
function BacklogGenFlow({ project, charter, brief, riskLog, existingBacklogItems, onCommitted, onDone, onCancel }) {
  const [phase, setPhase] = useState('loading-questions')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState(null)
  const [proposed, setProposed] = useState([])
  const [savedCount, setSavedCount] = useState(0)

  const isHybrid = project.methodology === 'hybrid'

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('backlog-gen', {
      body: { action: 'questions', project, charter, brief, riskLog, existingBacklogItems },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    setQuestions(data.questions || [])
    setPhase('answering')
  }

  async function handleGenerate() {
    setPhase('generating')
    setError(null)

    const answerList = questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({ question: q.text, answer: answers[q.id] }))

    const { data, error } = await supabase.functions.invoke('backlog-gen', {
      body: { action: 'generate', project, charter, brief, riskLog, existingBacklogItems, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const items = (data.items || []).map((it, i) => ({
      temp_id: it.temp_id || `b${i}`,
      title: it.title || '',
      description: it.description || '',
      story_points: STORY_POINT_OPTIONS.includes(Number(it.story_points)) ? Number(it.story_points) : '',
      epic_name: isHybrid ? it.epic_name || '' : '',
      selected: true,
    }))

    setProposed(items)
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
          story_points: row.story_points || null,
          epic_name: isHybrid ? row.epic_name.trim() || null : null,
          backlog_rank: nextRank,
          backlog_status: 'backlog',
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
        <h3 className="charter-heading">Generate Backlog from Charter</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'loading-questions' && (
          <p className="charter-status">Checking what's already known...</p>
        )}

        {phase === 'error' && (
          <>
            <p className="error">{error}</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Close
              </button>
              <button type="button" className="btn-primary" onClick={loadQuestions}>
                Retry
              </button>
            </div>
          </>
        )}

        {phase === 'answering' && questions.length === 0 && (
          <>
            <p className="charter-status">
              Nothing genuinely missing &mdash; ready to propose backlog items from what's known.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleGenerate}>
                Propose Backlog Items
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && questions.length === 0 && (
          <p className="charter-status">Thinking through a backlog...</p>
        )}

        {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleGenerate}
            submitLabel="Propose Backlog Items"
            loadingLabel="Thinking through a backlog..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onCancel}
          />
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="task-gen-review">
            <p className="charter-status">
              Review the proposed backlog items below - edit anything, uncheck or delete what you
              don't want, then add the rest.
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
                    <th aria-hidden="true"></th>
                  </tr>
                </thead>
                <tbody>
                  {proposed.map((row) => (
                    <tr key={row.temp_id} className={row.selected ? '' : 'task-gen-row-excluded'}>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.selected}
                          onChange={(e) => updateRow(row.temp_id, 'selected', e.target.checked)}
                          aria-label={`Include ${row.title || 'this item'}`}
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
                          value={row.story_points}
                          onChange={(e) =>
                            updateRow(row.temp_id, 'story_points', e.target.value ? Number(e.target.value) : '')
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
                        <button
                          type="button"
                          className="risk-delete-btn"
                          aria-label="Remove item"
                          onClick={() => deleteRow(row.temp_id)}
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proposed.length === 0 && (
                    <tr>
                      <td colSpan={isHybrid ? 6 : 5} className="empty">
                        No backlog items proposed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasInvalidSelected && (
              <p className="error">Give every selected item a title before adding.</p>
            )}
            {error && <p className="error">{error}</p>}
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

export default BacklogGenFlow
