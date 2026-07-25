import { useEffect, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Task list/status/mark-done (/m/projects/:projectId/tasks) - own fetch,
// scoped to the active project (the projectId already in the URL via
// MobileProjectLayout). Milestone markers (task_type = 'milestone_marker',
// see gantt_milestones_and_delayed_status.sql) come back in the same
// `tasks` query and get a diamond badge rather than a separate fetch/list -
// desktop only ever creates them on Waterfall/Hybrid projects, so an Agile
// project naturally has none to show.
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'not_started', label: 'Not Started' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'delayed', label: 'Delayed' },
]

function statusLabel(status) {
  return STATUS_FILTERS.find((s) => s.key === (status ?? 'not_started'))?.label ?? 'Not Started'
}

function MobileProjectTasks() {
  const { canEdit } = useOutletContext()
  const { projectId } = useParams()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all')
  const [markingId, setMarkingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadTasks() {
      setLoading(true)
      setError(null)

      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      setTasks(data)
      setLoading(false)
    }

    loadTasks()
    return () => {
      cancelled = true
    }
  }, [projectId])

  async function markDone(task, e) {
    e.preventDefault()
    e.stopPropagation()
    if (!canEdit || markingId) return

    const nowDone = (task.status ?? 'not_started') !== 'completed'
    setMarkingId(task.id)
    setError(null)

    const { data, error } = await supabase
      .from('tasks')
      .update({
        status: nowDone ? 'completed' : 'not_started',
        completed: nowDone,
      })
      .eq('id', task.id)
      .select()

    setMarkingId(null)

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

  const visibleTasks = filter === 'all' ? tasks : tasks.filter((t) => (t.status ?? 'not_started') === filter)

  return (
    <div>
      <h1 className="mobile-screen-title">Tasks</h1>

      <Link to={`/m/projects/${projectId}/more/risks`} className="mobile-more-list-item">
        Log a Risk
      </Link>

      <div className="mobile-filter-row">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`mobile-filter-chip ${filter === s.key ? 'selected' : ''}`}
            onClick={() => setFilter(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="mobile-screen-stub">Loading tasks...</p>}
      {error && <p className="mobile-error">{error}</p>}

      {!loading && !error && visibleTasks.length === 0 && (
        <p className="mobile-screen-stub">No tasks{filter !== 'all' ? ` (${statusLabel(filter)})` : ''}.</p>
      )}

      {!loading && !error && visibleTasks.length > 0 && (
        <ul className="mobile-task-list">
          {visibleTasks.map((task) => {
            const done = (task.status ?? 'not_started') === 'completed'
            return (
              <li key={task.id} className="mobile-task-row">
                <button
                  type="button"
                  className={`mobile-task-mark-done ${done ? 'done' : ''}`}
                  disabled={!canEdit || markingId === task.id}
                  onClick={(e) => markDone(task, e)}
                  aria-label={done ? 'Mark not started' : 'Mark done'}
                >
                  {done ? '✓' : ''}
                </button>
                <Link to={`${task.id}`} className="mobile-task-row-body" state={{ from: 'tasks' }}>
                  <span className="mobile-task-row-title">
                    {task.task_type === 'milestone_marker' && (
                      <span className="mobile-milestone-badge" aria-hidden="true">◆</span>
                    )}
                    {task.title}
                  </span>
                  <span className="mobile-task-row-meta">
                    <span className={`mobile-status-badge status-${task.status ?? 'not_started'}`}>
                      {statusLabel(task.status)}
                    </span>
                    {task.due_date && <span>{task.due_date}</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default MobileProjectTasks
