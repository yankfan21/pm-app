import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import Spinner from './Spinner'

// First-time Budget Tracker generation. Follows the same Q&A-then-review
// pattern as the document Flows, but the review step is a bulk editable
// table (not one-by-one accept/decline) - same reasoning as task
// generation: a proposed budget is naturally multi-item and the PM needs to
// see the whole set at once before committing.
//
// Unlike task generation, line items have no dependency graph, so the
// commit step doesn't insert anything itself - it just hands the
// reviewed/edited rows to onGenerated, which does the single
// budget_trackers insert (same contract as every other document Flow).
// Re-running this later only ever proposes new items (see BudgetView's
// "Suggest Additional Line Items"); this Flow only ever runs once, before
// any row exists.
function BudgetFlow({ project, charter, brief, tasks, onGenerated, onClose }) {
  const [phase, setPhase] = useState('loading-questions')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState(null)
  const [proposed, setProposed] = useState([])
  // Kept alongside `proposed` since onGenerated needs the same answer list
  // that produced the current proposal.
  const [lastAnswerList, setLastAnswerList] = useState([])

  const existingTasks = (tasks || []).map((t) => ({ id: t.id, title: t.title }))

  useEffect(() => {
    loadQuestions()
  }, [])

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('budget', {
      body: { action: 'questions', project, charter, brief },
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

    const { data, error } = await supabase.functions.invoke('budget', {
      body: { action: 'generate', project, charter, brief, existingTasks, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const items = (data.line_items || []).map((item, i) => ({
      temp_id: `li${i}`,
      category: item.category || '',
      name: item.name || '',
      estimated_amount: Number(item.estimated_amount) || 0,
      actual_amount: 0,
      task_id: existingTasks.some((t) => t.id === item.task_id) ? item.task_id : null,
      notes: item.notes || '',
      selected: true,
    }))

    setProposed(items)
    setLastAnswerList(answerList)
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
  const hasInvalidSelected = selectedRows.some((r) => !r.name.trim())

  async function handleCommit() {
    if (selectedRows.length === 0 || hasInvalidSelected) return

    setPhase('saving')
    setError(null)

    const rows = selectedRows.map(({ temp_id: _temp_id, selected: _selected, ...rest }) => ({
      id: crypto.randomUUID(),
      ...rest,
    }))

    const saveError = await onGenerated(rows, lastAnswerList)
    if (saveError) {
      setError(saveError)
      setPhase('review')
    }
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Budget Tracker</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'loading-questions' && (
          <p className="charter-status">
            <Spinner />
            Checking what's already known...
          </p>
        )}

        {phase === 'error' && (
          <>
            <p className="error">{error}</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
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
              Nothing genuinely missing &mdash; ready to propose a starting budget from what's known.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleGenerate}>
                Propose Budget
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && questions.length === 0 && (
          <p className="charter-status">
            <Spinner />
            Thinking through a starting budget...
          </p>
        )}

        {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleGenerate}
            submitLabel="Propose Budget"
            loadingLabel="Thinking through a budget..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onClose}
          />
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="task-gen-review">
            <p className="charter-status">
              Review the proposed line items below - edit anything, uncheck or delete what you
              don't want, then add the rest.
            </p>

            <div className="risk-table-wrap">
              <table className="risk-log-table task-gen-table budget-gen-table">
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
                    <th>Category</th>
                    <th>Item</th>
                    <th>Estimated Amount</th>
                    <th>Linked Task</th>
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
                          aria-label={`Include ${row.name || 'this line item'}`}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="risk-cell-input"
                          value={row.category}
                          onChange={(e) => updateRow(row.temp_id, 'category', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="risk-cell-input"
                          value={row.name}
                          onChange={(e) => updateRow(row.temp_id, 'name', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="risk-cell-input"
                          value={row.estimated_amount}
                          onChange={(e) =>
                            updateRow(row.temp_id, 'estimated_amount', Math.max(0, Number(e.target.value) || 0))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={row.task_id || ''}
                          onChange={(e) => updateRow(row.temp_id, 'task_id', e.target.value || null)}
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
                        <button
                          type="button"
                          className="risk-delete-btn"
                          aria-label="Remove line item"
                          onClick={() => deleteRow(row.temp_id)}
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                  {proposed.length === 0 && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No line items proposed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasInvalidSelected && (
              <p className="error">Give every selected line item a name before adding.</p>
            )}
            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
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
                  : `Add ${selectedCount} Selected Line Item${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BudgetFlow
