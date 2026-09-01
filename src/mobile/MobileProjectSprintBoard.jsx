import { useEffect, useState } from 'react'
import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { visibleSides } from '../projectSections'
import { useSprintSelection, formatSprintLabel } from '../useSprintSelection'
import { computeSprintPoints, isSprintOverdue } from '../sprintStats'

// Sprint Board view, Agile/Hybrid only (/m/projects/:projectId/sprint-board).
// The tab bar hides this route for pure Waterfall projects, but a stale/
// deep-linked URL could still land here directly - redirect to Overview in
// that case, same as desktop's MethodologySection guard.
//
// Column move is tap-to-target rather than drag-and-drop (doesn't work well
// on touch, see Phase 2 Chunk 1 scope) - each card shows the two columns
// it isn't currently in as tap targets, mirroring desktop
// SprintBoardView.jsx's board_status update (moving into 'done' also
// closes out backlog_status, same as desktop).
const BOARD_COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
]

function MobileProjectSprintBoard() {
  const { project, canEdit } = useOutletContext()
  const { projectId } = useParams()

  const [tasks, setTasks] = useState([])
  const [sprints, setSprints] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [movingId, setMovingId] = useState(null)
  const [selectedSprintId, setSelectedSprintId] = useSprintSelection(sprints)
  const [searchParams, setSearchParams] = useSearchParams()
  const sprintFilter = searchParams.get('sprintFilter')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [tasksRes, sprintsRes] = await Promise.all([
        supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
        supabase.from('sprints').select('*').eq('project_id', projectId).order('start_date', { ascending: true }),
      ])

      if (cancelled) return

      if (tasksRes.error) {
        setError(tasksRes.error.message)
        setLoading(false)
        return
      }
      if (sprintsRes.error) {
        setError(sprintsRes.error.message)
        setLoading(false)
        return
      }

      setTasks(tasksRes.data)
      setSprints(sprintsRes.data)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  // ?sprintFilter=overdue - deep-link target for Overview's "Overdue
  // Sprints" badge (MobileProjectMetrics.jsx). One-shot jump, not a
  // persistent filter view - auto-selects the earliest overdue sprint via
  // the local selectedSprintId state above, then clears the param so
  // switching sprints manually afterward doesn't re-trigger it. Mirrors
  // desktop ProjectSectionRoutes.jsx's ExecutionSprintBoardRoute, just
  // local to this component instead of outlet-context/layout-level.
  useEffect(() => {
    if (sprintFilter !== 'overdue' || sprints.length === 0) return

    const todayStr = new Date().toISOString().slice(0, 10)
    const earliestOverdue = [...sprints]
      .filter((s) => isSprintOverdue(s, tasks, todayStr))
      .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))[0]

    if (earliestOverdue) setSelectedSprintId(earliestOverdue.id)

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('sprintFilter')
        return next
      },
      { replace: true }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sprintFilter, sprints, tasks])

  if (!visibleSides(project.methodology).agile) {
    return <Navigate to=".." replace />
  }

  async function moveTask(task, boardStatus) {
    if (!canEdit || movingId) return
    setMovingId(task.id)
    setError(null)

    const fields =
      boardStatus === 'done'
        ? { board_status: boardStatus, backlog_status: 'done' }
        : { board_status: boardStatus }

    const { data, error } = await supabase.from('tasks').update(fields).eq('id', task.id).select()

    setMovingId(null)

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

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null
  const { sprintTasks, committed, completed } = computeSprintPoints(tasks, selectedSprint?.id)

  return (
    <div>
      <h1 className="mobile-screen-title">Sprint Board</h1>

      {loading && <p className="mobile-screen-stub">Loading...</p>}
      {error && <p className="mobile-error">{error}</p>}

      {!loading && sprints.length === 0 && (
        <p className="mobile-screen-stub">No sprints yet.</p>
      )}

      {!loading && sprints.length > 0 && (
        <>
          <label className="mobile-select-field">
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
            <p className="mobile-screen-stub">No current sprint for today&rsquo;s date - pick one above.</p>
          )}

          {selectedSprint && (
            <>
              {selectedSprint.goal && <p className="mobile-task-description">{selectedSprint.goal}</p>}

              <div className="mobile-sprint-summary">
                <span>{committed} pts committed</span>
                <span>{completed} pts completed</span>
              </div>

              {BOARD_COLUMNS.map((col) => {
                const cards = sprintTasks.filter((t) => (t.board_status ?? 'todo') === col.key)
                return (
                  <div key={col.key} className="mobile-board-column">
                    <div className="mobile-board-column-header">
                      {col.label}
                      <span className="mobile-board-column-count">{cards.length}</span>
                    </div>

                    {cards.length === 0 && <p className="mobile-screen-stub">No items</p>}

                    <ul className="mobile-board-card-list">
                      {cards.map((task) => (
                        <li key={task.id} className="mobile-board-card">
                          <div className="mobile-board-card-title-row">
                            <span className="mobile-board-card-title-text">{task.title}</span>
                            {task.story_points != null && (
                              <span className="mobile-points-badge">{task.story_points} pts</span>
                            )}
                          </div>

                          {canEdit && (
                            <div className="mobile-board-card-targets">
                              {BOARD_COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                                <button
                                  key={c.key}
                                  type="button"
                                  disabled={movingId === task.id}
                                  onClick={() => moveTask(task, c.key)}
                                >
                                  Move to {c.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}

export default MobileProjectSprintBoard
