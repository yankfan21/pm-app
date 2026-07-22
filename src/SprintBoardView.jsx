import { useState } from 'react'
import { supabase } from './supabaseClient'
import { assignTaskToSprint } from './sprintAssignment'
import { formatSprintLabel } from './useSprintSelection'
import { computeSprintPoints } from './sprintStats'
import AssigneePicker from './components/AssigneePicker'

const BOARD_COLUMNS = [
  { key: 'todo', label: 'To Do', colorClass: 'pending' },
  { key: 'in_progress', label: 'In Progress', colorClass: 'partial' },
  { key: 'done', label: 'Done', colorClass: 'done' },
]

function SprintBoardView({
  project,
  tasks,
  setTasks,
  sprints,
  setSprints,
  milestones,
  collaborators,
  canEdit,
  expanded,
  selectedSprintId,
  setSelectedSprintId,
}) {

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [goal, setGoal] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const [showPullForward, setShowPullForward] = useState(false)
  const [pullTargets, setPullTargets] = useState({})
  const [pullingTaskId, setPullingTaskId] = useState(null)
  const [newSprintNameInline, setNewSprintNameInline] = useState('')
  const [creatingInlineSprint, setCreatingInlineSprint] = useState(false)

  const isHybrid = project.methodology === 'hybrid'

  function epicLabel(task) {
    if (task.milestone_id) {
      return milestones.find((m) => m.id === task.milestone_id)?.name ?? 'Unknown epic'
    }
    return task.epic_name || null
  }

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null
  const { sprintTasks, committed: pointsCommitted, completed: pointsCompleted } = computeSprintPoints(
    tasks,
    selectedSprint?.id
  )
  // Same eligibility rule as Backlog's "Assign to sprint..." dropdown: ready
  // and not already sitting in some other sprint.
  const unassignedReadyItems = tasks.filter((t) => t.backlog_status === 'ready' && t.sprint_id == null)
  const unfinishedItems = sprintTasks.filter((t) => (t.board_status ?? 'todo') !== 'done')
  const otherSprints = sprints.filter((s) => s.id !== selectedSprint?.id)

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

  async function updateAssignee(task, fields) {
    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .update(fields)
      .eq('id', task.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
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

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
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

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
  }

  async function handleAddFromBacklog(taskId) {
    if (!taskId || !selectedSprint) return
    setError(null)
    const { data, error } = await assignTaskToSprint(taskId, selectedSprint.id)

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === taskId ? data[0] : t)))
  }

  // "Pull to sprint" - fresh start in the target sprint: board_status
  // resets to todo, but backlog_status stays 'in_sprint' (it's still
  // assigned to a sprint, just a different one) and everything else
  // (story_points/title/epic_name) is untouched.
  async function handlePullToSprint(task) {
    const targetSprintId = pullTargets[task.id]
    if (!targetSprintId) return

    setPullingTaskId(task.id)
    setError(null)

    const { data, error } = await supabase
      .from('tasks')
      .update({ sprint_id: targetSprintId, board_status: 'todo' })
      .eq('id', task.id)
      .select()

    setPullingTaskId(null)

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this task.')
      return
    }

    setTasks((prev) => prev.map((t) => (t.id === task.id ? data[0] : t)))
    setPullTargets((prev) => {
      const next = { ...prev }
      delete next[task.id]
      return next
    })
  }

  async function handleCreateInlineSprint(e) {
    e.preventDefault()
    const trimmed = newSprintNameInline.trim()
    if (!trimmed) return

    setCreatingInlineSprint(true)
    setError(null)

    const { data, error } = await supabase
      .from('sprints')
      .insert({ project_id: project.id, name: trimmed })
      .select()
      .single()

    setCreatingInlineSprint(false)

    if (error) {
      setError(error.message)
      return
    }

    setSprints((prev) => [...prev, data])
    setNewSprintNameInline('')
  }

  return (
    <div className="sprint-board detail-zone">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Sprint Board</span>
        <span className={`doc-status-badge ${sprints.length > 0 ? 'done' : 'pending'}`}>
          {sprints.length > 0 ? `${sprints.length} Sprint${sprints.length === 1 ? '' : 's'}` : 'Not started'}
        </span>
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

                  {canEdit && (
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={unfinishedItems.length === 0}
                      onClick={() => setShowPullForward((prev) => !prev)}
                    >
                      Pull Unfinished Forward
                    </button>
                  )}

                  {showPullForward && canEdit && (
                    <div className="pull-forward-panel">
                      {unfinishedItems.length === 0 ? (
                        <p className="charter-status">Nothing unfinished in this sprint.</p>
                      ) : (
                        <>
                          <p className="charter-status">
                            Pick an action for each unfinished item below - nothing moves until you
                            confirm each one.
                          </p>

                          <ul className="pull-forward-list">
                            {unfinishedItems.map((task) => (
                              <li key={task.id} className="kanban-card">
                                <div className="backlog-item-title-row">
                                  <span className="backlog-item-title">{task.title}</span>
                                  {task.story_points != null && (
                                    <span className="story-points-badge">{task.story_points} pts</span>
                                  )}
                                  {isHybrid && epicLabel(task) && (
                                    <span className="epic-tag">{epicLabel(task)}</span>
                                  )}
                                </div>

                                <div className="pull-forward-actions">
                                  {otherSprints.length > 0 && (
                                    <>
                                      <select
                                        value={pullTargets[task.id] || ''}
                                        onChange={(e) =>
                                          setPullTargets((prev) => ({ ...prev, [task.id]: e.target.value }))
                                        }
                                      >
                                        <option value="">Pull to sprint...</option>
                                        {otherSprints.map((s) => (
                                          <option key={s.id} value={s.id}>
                                            {formatSprintLabel(s)}
                                          </option>
                                        ))}
                                      </select>
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={!pullTargets[task.id] || pullingTaskId === task.id}
                                        onClick={() => handlePullToSprint(task)}
                                      >
                                        {pullingTaskId === task.id ? 'Pulling...' : 'Pull'}
                                      </button>
                                    </>
                                  )}

                                  <button
                                    type="button"
                                    className="kanban-card-remove"
                                    onClick={() => handleRemoveFromSprint(task)}
                                  >
                                    Return to Backlog
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>

                          {otherSprints.length === 0 && (
                            <form className="pull-forward-create-sprint" onSubmit={handleCreateInlineSprint}>
                              <span className="charter-status">
                                No other sprints exist yet - create one to pull items into:
                              </span>
                              <input
                                type="text"
                                value={newSprintNameInline}
                                onChange={(e) => setNewSprintNameInline(e.target.value)}
                                placeholder="New sprint name..."
                              />
                              <button type="submit" disabled={creatingInlineSprint}>
                                {creatingInlineSprint ? 'Creating...' : 'Create Sprint'}
                              </button>
                            </form>
                          )}
                        </>
                      )}
                    </div>
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
                                  {isHybrid && epicLabel(task) && (
                                    <span className="epic-tag">{epicLabel(task)}</span>
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
                                      <option
                                        key={c.key}
                                        value={c.key}
                                        className={`board-status-option ${c.colorClass}`}
                                      >
                                        {c.label}
                                      </option>
                                    ))}
                                  </select>

                                  <AssigneePicker
                                    collaborators={collaborators}
                                    assigneeUserId={task.assignee_user_id}
                                    assigneeName={task.assignee_name}
                                    disabled={!canEdit}
                                    onChange={(next) => updateAssignee(task, next)}
                                  />

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
