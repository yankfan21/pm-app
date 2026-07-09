import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { assignTaskToSprint } from './sprintAssignment'

const BOARD_COLUMNS = [
  { key: 'todo', label: 'To Do', colorClass: 'pending' },
  { key: 'in_progress', label: 'In Progress', colorClass: 'partial' },
  { key: 'done', label: 'Done', colorClass: 'done' },
]

function todayLocalDateString() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatSprintLabel(sprint) {
  if (sprint.start_date && sprint.end_date) {
    return `${sprint.name} (${sprint.start_date} – ${sprint.end_date})`
  }
  return sprint.name
}

function SprintBoardView({ project, tasks, setTasks, sprints, setSprints, canEdit, expanded, onToggle }) {
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const autoSelectedRef = useRef(false)

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [goal, setGoal] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const isHybrid = project.methodology === 'hybrid'

  useEffect(() => {
    if (autoSelectedRef.current || sprints.length === 0) return
    autoSelectedRef.current = true

    const todayStr = todayLocalDateString()
    const current = sprints.find(
      (s) => s.start_date && s.end_date && s.start_date <= todayStr && todayStr <= s.end_date
    )
    if (current) setSelectedSprintId(current.id)
  }, [sprints])

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null
  const sprintTasks = selectedSprint ? tasks.filter((t) => t.sprint_id === selectedSprint.id) : []
  const pointsCommitted = sprintTasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  const pointsCompleted = sprintTasks
    .filter((t) => t.board_status === 'done')
    .reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  // Same eligibility rule as Backlog's "Assign to sprint..." dropdown: ready
  // and not already sitting in some other sprint.
  const unassignedReadyItems = tasks.filter((t) => t.backlog_status === 'ready' && t.sprint_id == null)

  async function handleCreateSprint(e) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return

    setCreating(true)
    setError(null)

    const { data, error } = await supabase
      .from('sprints')
      .insert({
        project_id: project.id,
        name: trimmed,
        start_date: startDate || null,
        end_date: endDate || null,
        goal: goal.trim() || null,
      })
      .select()
      .single()

    setCreating(false)

    if (error) {
      setError(error.message)
      return
    }

    setSprints((prev) => [...prev, data])
    setSelectedSprintId(data.id)
    setName('')
    setStartDate('')
    setEndDate('')
    setGoal('')
  }

  async function updateBoardStatus(task, boardStatus) {
    setError(null)
    // Only the transition into Done also closes out backlog_status - moving
    // between To Do and In Progress is board-only and shouldn't touch it.
    const fields =
      boardStatus === 'done'
        ? { board_status: boardStatus, backlog_status: 'done' }
        : { board_status: boardStatus }

    const { data, error } = await supabase
      .from('tasks')
      .update(fields)
      .eq('id', task.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data : t)))
  }

  async function handleRemoveFromSprint(task) {
    const confirmed = window.confirm(
      `Remove "${task.title}" from this sprint? This discards its board progress (currently ${
        BOARD_COLUMNS.find((c) => c.key === (task.board_status ?? 'todo'))?.label
      }) and puts it back in the backlog as Ready.`
    )
    if (!confirmed) return

    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .update({ sprint_id: null, board_status: null, backlog_status: 'ready' })
      .eq('id', task.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data : t)))
  }

  async function handleAddFromBacklog(taskId) {
    if (!taskId || !selectedSprint) return
    setError(null)
    const { data, error } = await assignTaskToSprint(taskId, selectedSprint.id)

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? data : t)))
  }

  return (
    <div className="sprint-board">
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
            <span className={`status-dot ${sprints.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Sprint Board
          </span>
          <span className={`doc-status-badge ${sprints.length > 0 ? 'done' : 'pending'}`}>
            {sprints.length > 0 ? `${sprints.length} Sprint${sprints.length === 1 ? '' : 's'}` : 'Not started'}
          </span>
        </button>
      </h2>

      {expanded && (
        <>
          {error && <p className="error">{error}</p>}

          {canEdit && (
            <form onSubmit={handleCreateSprint} className="sprint-create-form">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sprint name..."
              />
              <label className="task-date-field">
                Start
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label className="task-date-field">
                End
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Sprint goal (optional)"
              />
              <button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Sprint'}
              </button>
            </form>
          )}

          {sprints.length === 0 && (
            <p className="charter-status">No sprints yet.</p>
          )}

          {sprints.length > 0 && (
            <>
              <label className="sprint-select-field">
                Sprint
                <select
                  value={selectedSprintId ?? ''}
                  onChange={(e) => setSelectedSprintId(e.target.value || null)}
                >
                  <option value="">Select a sprint...</option>
                  {sprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatSprintLabel(s)}
                    </option>
                  ))}
                </select>
              </label>

              {!selectedSprint && (
                <p className="charter-status">
                  No current sprint for today&rsquo;s date - pick one above.
                </p>
              )}

              {selectedSprint && (
                <>
                  {selectedSprint.goal && (
                    <p className="project-goal">{selectedSprint.goal}</p>
                  )}

                  <div className="sprint-summary">
                    <span>{pointsCommitted} pts committed</span>
                    <span>{pointsCompleted} pts completed</span>
                  </div>

                  {canEdit && (
                    <label className="sprint-select-field">
                      Add from Backlog
                      <select value="" onChange={(e) => handleAddFromBacklog(e.target.value)}>
                        <option value="">
                          {unassignedReadyItems.length > 0
                            ? 'Select a ready item...'
                            : 'No ready items available'}
                        </option>
                        {unassignedReadyItems.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.title}
                            {t.story_points != null ? ` (${t.story_points} pts)` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <div className="kanban-board">
                    {BOARD_COLUMNS.map((col) => {
                      const cards = sprintTasks.filter(
                        (t) => (t.board_status ?? 'todo') === col.key
                      )
                      return (
                        <div key={col.key} className="kanban-column">
                          <div className="kanban-column-header">
                            <span className={`status-dot ${col.colorClass}`} aria-hidden="true" />
                            {col.label}
                            <span className="kanban-column-count">{cards.length}</span>
                          </div>

                          <ul className="kanban-card-list">
                            {cards.map((task) => (
                              <li key={task.id} className="kanban-card">
                                <div className="backlog-item-title-row">
                                  <span className="backlog-item-title">{task.title}</span>
                                  {task.story_points != null && (
                                    <span className="story-points-badge">{task.story_points} pts</span>
                                  )}
                                  {isHybrid && task.epic_name && (
                                    <span className="epic-tag">{task.epic_name}</span>
                                  )}
                                </div>

                                <div className="kanban-card-actions">
                                  <select
                                    className={`board-status-select ${col.colorClass}`}
                                    value={task.board_status ?? 'todo'}
                                    disabled={!canEdit}
                                    onChange={(e) => updateBoardStatus(task, e.target.value)}
                                  >
                                    {BOARD_COLUMNS.map((c) => (
                                      <option key={c.key} value={c.key}>
                                        {c.label}
                                      </option>
                                    ))}
                                  </select>

                                  {canEdit && (
                                    <button
                                      type="button"
                                      className="kanban-card-remove"
                                      onClick={() => handleRemoveFromSprint(task)}
                                    >
                                      Remove from sprint
                                    </button>
                                  )}
                                </div>
                              </li>
                            ))}
                            {cards.length === 0 && <li className="empty">No items</li>}
                          </ul>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default SprintBoardView
