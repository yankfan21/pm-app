import { useState } from 'react'
import { supabase } from './supabaseClient'
import { formatSprintLabel } from './useSprintSelection'
import { computeSprintPoints } from './sprintStats'
import LoadingButton from './LoadingButton'

function byRecentSprintFirst(a, b) {
  if (!a.sprint.start_date && !b.sprint.start_date) return 0
  if (!a.sprint.start_date) return 1
  if (!b.sprint.start_date) return -1
  return b.sprint.start_date.localeCompare(a.sprint.start_date)
}

const LIST_SECTIONS = [
  { key: 'went_well', label: 'What Went Well' },
  { key: 'didnt_go_well', label: "What Didn't Go Well" },
  { key: 'action_items', label: 'Action Items' },
]

function newEntry(text) {
  return { id: crypto.randomUUID(), text }
}

// One of the three (nearly identical) list sections - went_well,
// didnt_go_well, and action_items all share this same add/edit/delete
// shape, consistent with Risk Log's editable-list styling (risk-cell-input,
// risk-delete-btn) rather than inventing a new widget.
function RetroListSection({ label, entries, canEdit, newValue, onNewValueChange, onAdd, onTextChange, onTextBlur, onDelete }) {
  return (
    <div className="charter-doc-section">
      <h4 className="charter-doc-heading">{label}</h4>

      <ul className="retro-entry-list">
        {entries.map((entry) => (
          <li key={entry.id} className="retro-entry-row">
            <textarea
              className="risk-cell-input"
              value={entry.text}
              readOnly={!canEdit}
              rows={2}
              onChange={(e) => onTextChange(entry.id, e.target.value)}
              onBlur={onTextBlur}
            />
            {canEdit && (
              <button
                type="button"
                className="risk-delete-btn"
                aria-label={`Delete ${label} entry`}
                onClick={() => onDelete(entry.id)}
              >
                &times;
              </button>
            )}
          </li>
        ))}
        {entries.length === 0 && <li className="empty">Nothing logged yet</li>}
      </ul>

      {canEdit && (
        <form
          className="retro-add-form"
          onSubmit={(e) => {
            e.preventDefault()
            onAdd()
          }}
        >
          <input
            type="text"
            value={newValue}
            onChange={(e) => onNewValueChange(e.target.value)}
            placeholder={`Add to ${label.toLowerCase()}...`}
          />
          <button type="submit">Add</button>
        </form>
      )}
    </div>
  )
}

// AI assistance for Sprint Retro is deliberately NOT free-form generation
// like Task Gen/Backlog Gen - retro-facts-gen only surfaces observable
// facts about this sprint's actual data (velocity, items stuck In
// Progress, incomplete shared epics) phrased as candidates, split into
// went_well/didnt_go_well. Action items are never AI-suggested - those
// need PM judgment. Same bulk accept/edit/reject review table as Task
// Gen/Backlog Gen (not silent insert), just with a Category column
// instead of duration/points.
function SprintRetroView({ project, sprints, retros, setRetros, tasks, canEdit, expanded, onToggle }) {
  // null = browsing the list of existing retros; a sprint id = viewing/
  // editing that sprint's retro. No auto-select-current-sprint here (unlike
  // Sprint Board) - the list is the primary landing view now, not a single
  // dropdown-selected sprint.
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const [startSprintId, setStartSprintId] = useState('')
  const [creatingRetro, setCreatingRetro] = useState(false)
  const [error, setError] = useState(null)

  const [newWentWell, setNewWentWell] = useState('')
  const [newDidntGoWell, setNewDidntGoWell] = useState('')
  const [newActionItem, setNewActionItem] = useState('')

  const [candidates, setCandidates] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [savingCandidates, setSavingCandidates] = useState(false)

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null
  const retro = retros.find((r) => r.sprint_id === selectedSprintId) || null
  const { sprintTasks, committed: pointsCommitted, completed: pointsCompleted } = computeSprintPoints(
    tasks,
    selectedSprint?.id
  )
  const effectiveCanEdit = canEdit && !!retro && !retro.is_locked

  const retroRows = retros
    .map((r) => ({ retro: r, sprint: sprints.find((s) => s.id === r.sprint_id) }))
    .filter((row) => row.sprint)
    .sort(byRecentSprintFirst)
  const sprintsWithoutRetro = sprints.filter((s) => !retros.some((r) => r.sprint_id === s.id))

  async function handleStartRetro() {
    if (!startSprintId) return

    setCreatingRetro(true)
    setError(null)

    const { data, error } = await supabase
      .from('sprint_retros')
      .insert({ sprint_id: startSprintId })
      .select()
      .single()

    setCreatingRetro(false)

    if (error) {
      setError(error.message)
      return
    }

    setRetros((prev) => [...prev, data])
    setSelectedSprintId(startSprintId)
    setStartSprintId('')
  }

  async function persist(fields) {
    setError(null)
    const { data, error } = await supabase
      .from('sprint_retros')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', retro.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setRetros((prev) => prev.map((r) => (r.id === data.id ? data : r)))
  }

  function updateEntryText(listKey, id, text) {
    setRetros((prev) =>
      prev.map((r) =>
        r.id === retro.id ? { ...r, [listKey]: r[listKey].map((e) => (e.id === id ? { ...e, text } : e)) } : r
      )
    )
  }

  function saveList(listKey) {
    persist({ [listKey]: retro[listKey] })
  }

  function addEntry(listKey, text, clearInput) {
    const trimmed = text.trim()
    if (!trimmed) return
    const next = [...retro[listKey], newEntry(trimmed)]
    persist({ [listKey]: next })
    clearInput()
  }

  function deleteEntry(listKey, id) {
    const next = retro[listKey].filter((e) => e.id !== id)
    persist({ [listKey]: next })
  }

  async function handleLockRetro() {
    const confirmed = window.confirm(
      "Lock this retro? Locking makes it read-only - you won't be able to add, edit, or delete entries afterward."
    )
    if (!confirmed) return
    await persist({ is_locked: true })
  }

  async function handleSuggest() {
    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('retro-facts-gen', {
      body: {
        project,
        sprint: selectedSprint,
        sprintTasks: sprintTasks.map((t) => ({
          title: t.title,
          story_points: t.story_points,
          board_status: t.board_status,
          epic_name: t.epic_name,
        })),
        existingWentWell: (retro.went_well || []).map((e) => e.text),
        existingDidntGoWell: (retro.didnt_go_well || []).map((e) => e.text),
      },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    const items = (data.candidates || []).map((c, i) => ({
      temp_id: c.temp_id || `c${i}`,
      text: c.text || '',
      category: c.category === 'didnt_go_well' ? 'didnt_go_well' : 'went_well',
      selected: true,
    }))

    setCandidates(items)
  }

  function updateCandidate(tempId, field, value) {
    setCandidates((prev) => prev.map((c) => (c.temp_id === tempId ? { ...c, [field]: value } : c)))
  }

  function deleteCandidate(tempId) {
    setCandidates((prev) => prev.filter((c) => c.temp_id !== tempId))
  }

  function toggleAllCandidates(checked) {
    setCandidates((prev) => prev.map((c) => ({ ...c, selected: checked })))
  }

  const selectedCandidates = (candidates || []).filter((c) => c.selected)
  const hasInvalidSelectedCandidate = selectedCandidates.some((c) => !c.text.trim())

  async function handleCommitCandidates() {
    if (selectedCandidates.length === 0 || hasInvalidSelectedCandidate) return

    setSavingCandidates(true)
    setError(null)

    const newWentWellEntries = selectedCandidates
      .filter((c) => c.category === 'went_well')
      .map((c) => newEntry(c.text.trim()))
    const newDidntGoWellEntries = selectedCandidates
      .filter((c) => c.category === 'didnt_go_well')
      .map((c) => newEntry(c.text.trim()))

    const { data, error } = await supabase
      .from('sprint_retros')
      .update({
        went_well: [...retro.went_well, ...newWentWellEntries],
        didnt_go_well: [...retro.didnt_go_well, ...newDidntGoWellEntries],
        updated_at: new Date().toISOString(),
      })
      .eq('id', retro.id)
      .select()
      .single()

    setSavingCandidates(false)

    if (error) {
      setError(error.message)
      return
    }

    setRetros((prev) => prev.map((r) => (r.id === data.id ? data : r)))
    setCandidates(null)
  }

  return (
    <div className="sprint-retro">
      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle toggle-header-with-badge"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="toggle-header-main">
            <span className={`chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            <span className={`status-dot ${retros.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Sprint Retro
          </span>
          <span className={`doc-status-badge ${retros.length > 0 ? 'done' : 'pending'}`}>
            {retros.length > 0 ? `${retros.length} Retro${retros.length === 1 ? '' : 's'}` : 'Not started'}
          </span>
        </button>
      </h2>

      {expanded && (
        <>
          {error && <p className="error">{error}</p>}

          {sprints.length === 0 && <p className="charter-status">No sprints yet - create one on the Sprint Board first.</p>}

          {sprints.length > 0 && selectedSprintId == null && (
            <>
              <ul className="doc-checklist">
                {retroRows.map(({ retro: r, sprint: s }) => (
                  <li key={r.id} className="doc-checklist-item">
                    <button
                      type="button"
                      className="doc-checklist-row"
                      onClick={() => setSelectedSprintId(s.id)}
                    >
                      <span className="doc-checklist-label">
                        <span className={`status-dot ${r.is_locked ? 'done' : 'pending'}`} aria-hidden="true" />
                        {formatSprintLabel(s)}
                      </span>
                      <span className={`doc-status-badge ${r.is_locked ? 'done' : 'pending'}`}>
                        {r.is_locked ? 'Locked' : 'In Progress'}
                      </span>
                    </button>
                  </li>
                ))}
                {retroRows.length === 0 && <li className="empty">No retros started yet</li>}
              </ul>

              {sprintsWithoutRetro.length > 0 && canEdit && (
                <div className="retro-start-section">
                  <label className="sprint-select-field">
                    Start a retro for
                    <select value={startSprintId} onChange={(e) => setStartSprintId(e.target.value)}>
                      <option value="">Select a sprint...</option>
                      {sprintsWithoutRetro.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatSprintLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!startSprintId || creatingRetro}
                    onClick={handleStartRetro}
                  >
                    {creatingRetro ? 'Starting...' : 'Start Retro'}
                  </button>
                </div>
              )}
            </>
          )}

          {selectedSprint && retro && (
                <>
                  <button
                    type="button"
                    className="btn-secondary back-link"
                    onClick={() => setSelectedSprintId(null)}
                  >
                    &larr; Back to Retros
                  </button>

                  <div className="section-header">
                    <h3 className="charter-heading">Sprint: {selectedSprint.name}</h3>
                    <div className="charter-actions">
                      {effectiveCanEdit && (
                        <LoadingButton
                          className="btn-secondary"
                          loading={suggestLoading}
                          loadingLabel="Thinking..."
                          onClick={handleSuggest}
                        >
                          Suggest from Sprint Data
                        </LoadingButton>
                      )}
                      {canEdit && !retro.is_locked && (
                        <button type="button" className="btn-secondary" onClick={handleLockRetro}>
                          Lock Retro
                        </button>
                      )}
                    </div>
                  </div>

                  {retro.is_locked && (
                    <p className="charter-status">This retro is locked and read-only.</p>
                  )}

                  <div className="sprint-summary">
                    <span>{pointsCommitted} pts committed</span>
                    <span>{pointsCompleted} pts completed</span>
                  </div>

                  {candidates != null && (
                    <div className="task-gen-review">
                      <p className="charter-status">
                        Review the candidates below - edit anything, uncheck or delete what you don't
                        want, then add the rest.
                      </p>

                      <div className="risk-table-wrap">
                        <table className="risk-log-table task-gen-table">
                          <thead>
                            <tr>
                              <th>
                                <input
                                  type="checkbox"
                                  checked={candidates.length > 0 && candidates.every((c) => c.selected)}
                                  onChange={(e) => toggleAllCandidates(e.target.checked)}
                                  aria-label="Select all"
                                />
                              </th>
                              <th>Candidate</th>
                              <th>Category</th>
                              <th aria-hidden="true"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {candidates.map((c) => (
                              <tr key={c.temp_id} className={c.selected ? '' : 'task-gen-row-excluded'}>
                                <td>
                                  <input
                                    type="checkbox"
                                    checked={c.selected}
                                    onChange={(e) => updateCandidate(c.temp_id, 'selected', e.target.checked)}
                                    aria-label={`Include ${c.text || 'this candidate'}`}
                                  />
                                </td>
                                <td>
                                  <textarea
                                    className="risk-cell-input"
                                    value={c.text}
                                    rows={2}
                                    onChange={(e) => updateCandidate(c.temp_id, 'text', e.target.value)}
                                  />
                                </td>
                                <td>
                                  <select
                                    value={c.category}
                                    onChange={(e) => updateCandidate(c.temp_id, 'category', e.target.value)}
                                  >
                                    <option value="went_well">Went Well</option>
                                    <option value="didnt_go_well">Didn&rsquo;t Go Well</option>
                                  </select>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="risk-delete-btn"
                                    aria-label="Remove candidate"
                                    onClick={() => deleteCandidate(c.temp_id)}
                                  >
                                    &times;
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {candidates.length === 0 && (
                              <tr>
                                <td colSpan={4} className="empty">
                                  Nothing notable found in this sprint's data
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {hasInvalidSelectedCandidate && (
                        <p className="error">Give every selected candidate some text before adding.</p>
                      )}

                      <div className="modal-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setCandidates(null)}
                          disabled={savingCandidates}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={selectedCandidates.length === 0 || hasInvalidSelectedCandidate || savingCandidates}
                          onClick={handleCommitCandidates}
                        >
                          {savingCandidates
                            ? 'Adding...'
                            : `Add ${selectedCandidates.length} Selected Candidate${selectedCandidates.length === 1 ? '' : 's'}`}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="retro-sections">
                    {LIST_SECTIONS.map(({ key, label }) => (
                      <RetroListSection
                        key={key}
                        label={label}
                        entries={retro[key] || []}
                        canEdit={effectiveCanEdit}
                        newValue={key === 'went_well' ? newWentWell : key === 'didnt_go_well' ? newDidntGoWell : newActionItem}
                        onNewValueChange={
                          key === 'went_well' ? setNewWentWell : key === 'didnt_go_well' ? setNewDidntGoWell : setNewActionItem
                        }
                        onAdd={() =>
                          addEntry(
                            key,
                            key === 'went_well' ? newWentWell : key === 'didnt_go_well' ? newDidntGoWell : newActionItem,
                            key === 'went_well' ? () => setNewWentWell('') : key === 'didnt_go_well' ? () => setNewDidntGoWell('') : () => setNewActionItem('')
                          )
                        }
                        onTextChange={(id, text) => updateEntryText(key, id, text)}
                        onTextBlur={() => saveList(key)}
                        onDelete={(id) => deleteEntry(key, id)}
                      />
                    ))}
                  </div>
                </>
          )}
        </>
      )}
    </div>
  )
}

export default SprintRetroView
