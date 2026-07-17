import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import Spinner from './Spinner'

// AI starter-milestone generation, available once a Charter exists on a
// Waterfall or Hybrid project - the Milestones counterpart to
// TaskGenFlow/BacklogGenFlow's Charter-informed generation. Same
// Q&A-then-review pattern (same edge-function call shape, same QaStepper
// reuse, same bulk editable-table review instead of one-by-one
// accept/decline), just proposing milestones (name/description/date range)
// instead of tasks or backlog items.
//
// Nothing is written to the milestones table until the PM clicks the
// commit button in the review table; existingMilestones is passed to the
// edge function purely as "don't duplicate/here's what's already there"
// context, never as something the AI edits.
function MilestoneGenFlow({ project, charter, brief, riskLog, existingMilestones, onCommitted, onDone, onCancel }) {
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

    const { data, error } = await supabase.functions.invoke('milestone-gen', {
      body: { action: 'questions', project, charter, brief, riskLog, existingMilestones },
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

    const { data, error } = await supabase.functions.invoke('milestone-gen', {
      body: { action: 'generate', project, charter, brief, riskLog, existingMilestones, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const milestones = (data.milestones || []).map((m, i) => ({
      temp_id: m.temp_id || `m${i}`,
      name: m.name || '',
      description: m.description || '',
      start_date: m.start_date || '',
      end_date: m.end_date || '',
      selected: true,
    }))

    setProposed(milestones)
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
    setSavedCount(0)
    setError(null)

    const inserted = []
    const insertedTempIds = new Set()

    for (const row of selectedRows) {
      const { data, error: insertError } = await supabase
        .from('milestones')
        .insert({
          project_id: project.id,
          name: row.name.trim(),
          description: row.description.trim() || null,
          start_date: row.start_date || null,
          end_date: row.end_date || null,
        })
        .select()
        .single()

      if (insertError) {
        if (inserted.length > 0) {
          onCommitted(inserted)
          setProposed((prev) => prev.filter((r) => !insertedTempIds.has(r.temp_id)))
        }
        setError(
          `${insertError.message}${inserted.length > 0 ? ` (${inserted.length} milestone${inserted.length === 1 ? '' : 's'} were already added before this failure - review the rest below)` : ''}`
        )
        setPhase('review')
        return
      }

      insertedTempIds.add(row.temp_id)
      inserted.push(data)
      setSavedCount(inserted.length)
    }

    onCommitted(inserted)
    onDone()
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Milestones from Charter</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
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
              Nothing genuinely missing &mdash; ready to propose milestones from what's known.
            </p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleGenerate}>
                Propose Milestones
              </button>
            </div>
          </>
        )}

        {phase === 'generating' && questions.length === 0 && (
          <p className="charter-status">
            <Spinner />
            Thinking through milestones...
          </p>
        )}

        {(phase === 'answering' || phase === 'generating') && questions.length > 0 && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleGenerate}
            submitLabel="Propose Milestones"
            loadingLabel="Thinking through milestones..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onCancel}
          />
        )}

        {(phase === 'review' || phase === 'saving') && (
          <div className="task-gen-review">
            <p className="charter-status">
              Review the proposed milestones below - edit anything, uncheck or delete what you
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
                    <th>Name</th>
                    <th>Description</th>
                    <th>Start</th>
                    <th>End</th>
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
                          aria-label={`Include ${row.name || 'this milestone'}`}
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
                          value={row.end_date}
                          onChange={(e) => updateRow(row.temp_id, 'end_date', e.target.value)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="risk-delete-btn"
                          aria-label="Remove milestone"
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
                        No milestones proposed
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasInvalidSelected && (
              <p className="error">Give every selected milestone a name before adding.</p>
            )}
            {error && <p className="error">{error}</p>}
            {phase === 'saving' && (
              <p className="charter-status">
                <Spinner />
                Adding milestones... ({savedCount} of {selectedCount})
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
                  : `Add ${selectedCount} Selected Milestone${selectedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MilestoneGenFlow
