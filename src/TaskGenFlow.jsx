import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import { addDaysLocal, todayLocalDateString } from './ganttLayout'

// AI starter-task generation, available once a Charter exists. Follows the
// same Q&A-then-review pattern as the document Flows, but the review step is
// a bulk editable table (not one-by-one accept/decline) since task lists are
// naturally multi-item and PMs need to see the whole proposed set - including
// its dependency structure - at once before committing.
//
// Nothing is written to the tasks table until the PM clicks the commit
// button in the review table; re-running this later only ever proposes new
// tasks; it never re-surfaces or touches tasks already accepted (existingTasks
// is passed to the edge function purely as "don't duplicate/here's what's
// already there" context, never as something the AI edits).
function TaskGenFlow({ project, charter, brief, riskLog, existingTasks, onCommitted, onDone, onCancel }) {
  const [phase, setPhase] = useState('loading-questions')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState(null)
  const [proposed, setProposed] = useState([])
  const [savedCount, setSavedCount] = useState(0)

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('task-gen', {
      body: { action: 'questions', project, charter, brief, riskLog, existingTasks },
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

    const { data, error } = await supabase.functions.invoke('task-gen', {
      body: { action: 'generate', project, charter, brief, riskLog, existingTasks, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const tasks = (data.tasks || []).map((t, i) => ({
      temp_id: t.temp_id || `t${i}`,
      title: t.title || '',
      duration_days: Math.max(1, Number(t.duration_days) || 1),
      depends_on: t.depends_on || null,
      selected: true,
    }))

    setProposed(tasks)
    setPhase('review')
  }

  function updateRow(tempId, field, value) {
    setProposed((prev) => prev.map((r) => (r.temp_id === tempId ? { ...r, [field]: value } : r)))
  }

  function deleteRow(tempId) {
    setProposed((prev) =>
      prev
        .filter((r) => r.temp_id !== tempId)
        .map((r) => (r.depends_on === tempId ? { ...r, depends_on: null } : r))
    )
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

    const existingById = new Map((existingTasks || []).map((t) => [t.id, t]))
    const selectedByTempId = new Map(selectedRows.map((r) => [r.temp_id, r]))

    // Order selected rows so any in-batch dependency is inserted before its
    // dependent (each task depends on at most one other, so this is a
    // simple readiness queue rather than full Kahn's algorithm bookkeeping).
    // A cycle shouldn't occur from a well-formed proposal, but if editing
    // produced one, break it by dropping the offending in-batch edge rather
    // than hanging.
    const order = []
    const remaining = new Map(selectedRows.map((r) => [r.temp_id, r]))
    const blocked = new Map(
      selectedRows.map((r) => [r.temp_id, !!(r.depends_on && selectedByTempId.has(r.depends_on))])
    )
    while (remaining.size > 0) {
      const next = [...remaining.values()].find((r) => !blocked.get(r.temp_id))
      if (!next) {
        remaining.forEach((r) =>
          order.push({ ...r, depends_on: existingById.has(r.depends_on) ? r.depends_on : null })
        )
        break
      }
      order.push(next)
      remaining.delete(next.temp_id)
      remaining.forEach((r) => {
        if (r.depends_on === next.temp_id) blocked.set(r.temp_id, false)
      })
    }

    const tempIdToReal = new Map()
    const realDueDate = new Map()
    const inserted = []

    for (const row of order) {
      let dependsOnRealId = null
      let anchorDueDate = null

      if (row.depends_on) {
        if (existingById.has(row.depends_on)) {
          dependsOnRealId = row.depends_on
          anchorDueDate = existingById.get(row.depends_on).due_date
        } else if (tempIdToReal.has(row.depends_on)) {
          dependsOnRealId = tempIdToReal.get(row.depends_on)
          anchorDueDate = realDueDate.get(dependsOnRealId)
        }
        // Otherwise the dependency target was unchecked or deleted - this
        // task just becomes unblocked rather than erroring.
      }

      const startDate = anchorDueDate ? addDaysLocal(anchorDueDate, 1) : todayLocalDateString()
      const dueDate = addDaysLocal(startDate, Math.max(1, row.duration_days) - 1)

      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          project_id: project.id,
          title: row.title.trim(),
          start_date: startDate,
          due_date: dueDate,
          depends_on: dependsOnRealId,
        })
        .select()
        .single()

      if (insertError) {
        if (inserted.length > 0) {
          onCommitted(inserted)
          setProposed((prev) => prev.filter((r) => !tempIdToReal.has(r.temp_id)))
        }
        setError(
          `${insertError.message}${inserted.length > 0 ? ` (${inserted.length} task${inserted.length === 1 ? '' : 's'} were already added before this failure - review the rest below)` : ''}`
        )
        setPhase('review')
        return
      }

      tempIdToReal.set(row.temp_id, data.id)
      realDueDate.set(data.id, data.due_date)
      inserted.push(data)
      setSavedCount(inserted.length)
    }

    onCommitted(inserted)
    onDone()
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Tasks from Charter</h3>
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
              Nothing genuinely missing &mdash; ready to propose tasks from what's known.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleGenerate}>
                Propose Tasks
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && questions.length === 0 && (
          <p className="charter-status">Thinking through a task list...</p>
        )}

        {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleGenerate}
            submitLabel="Propose Tasks"
            loadingLabel="Thinking through tasks..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onCancel}
          />
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="task-gen-review">
            <p className="charter-status">
              Review the proposed tasks below - edit anything, uncheck or delete what you don't
              want, then add the rest.
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
                    <th>Task</th>
                    <th>Duration (days)</th>
                    <th>Depends on</th>
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
                          aria-label={`Include ${row.title || 'this task'}`}
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
                          type="number"
                          min="1"
                          className="risk-cell-input"
                          value={row.duration_days}
                          onChange={(e) =>
                            updateRow(row.temp_id, 'duration_days', Math.max(1, Number(e.target.value) || 1))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={row.depends_on || ''}
                          onChange={(e) => updateRow(row.temp_id, 'depends_on', e.target.value || null)}
                        >
                          <option value="">None</option>
                          {proposed
                            .filter((o) => o.temp_id !== row.temp_id)
                            .map((o) => (
                              <option key={o.temp_id} value={o.temp_id}>
                                {o.title || '(untitled)'}
                              </option>
                            ))}
                          {(existingTasks || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="risk-delete-btn"
                          aria-label="Remove task"
                          onClick={() => deleteRow(row.temp_id)}
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proposed.length === 0 && (
                    <tr>
                      <td colSpan={5} className="empty">
                        No tasks proposed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasInvalidSelected && (
              <p className="error">Give every selected task a name before adding.</p>
            )}
            {error && <p className="error">{error}</p>}
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

export default TaskGenFlow
