import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import TaskGenFlow from './TaskGenFlow'
import TaskImportFlow from './TaskImportFlow'
import DependencyPicker from './components/DependencyPicker'
import AssigneePicker, { resolveAssigneeLabel } from './components/AssigneePicker'
import { MethodologySection } from './ProjectSectionRoutes'
import { getEasternTodayStr, isTaskDelayed } from './taskUtils'

// Waterfall/Hybrid "Tasks and Milestones" - Phase 2 extraction out of
// ProjectOverviewRoute.jsx (which was its Phase 1 interim home; see
// projectSections.js). Routed at /projects/:projectId/planning/tasks, so
// unlike its old accordion-panel incarnation the section itself no longer
// has a page-level show/hide toggle - arriving at the route already means
// "show it", same as every other section under Planning/Execution. Only the
// two sub-flow triggers ("Generate .../Import from Excel") keep their own
// local open/closed state, since those are genuinely optional, one-at-a-
// time wizards, not the section's own visibility.
const TASK_STATUS_OPTIONS = [
  { key: 'not_started', label: 'Not Started', colorClass: 'pending' },
  { key: 'in_progress', label: 'In Progress', colorClass: 'partial' },
  { key: 'completed', label: 'Completed', colorClass: 'done' },
  { key: 'delayed', label: 'Delayed', colorClass: 'critical' },
]

// 'All' plus every TASK_STATUS_OPTIONS key - same idea as IssueLogView.jsx's
// VALID_FILTER_VALUES, but no 'OpenGroup'-style combined bucket needed here
// since Delayed Tasks (the Project Hotspots deep-link target, see
// KeyMetricsDashboard.jsx) already maps 1:1 onto the 'delayed' status.
const VALID_TASK_FILTER_VALUES = ['All', ...TASK_STATUS_OPTIONS.map((s) => s.key)]

// Exactly the columns trg_recalc_phase_auto_dates (phases_schema.sql)
// listens on - see updateTaskField's refreshPhases call below.
const PHASE_AUTO_DATE_FIELDS = ['phase_id', 'start_date', 'due_date']

function PlanningTasksRoute() {
  const {
    project,
    canEdit,
    tasks,
    setTasks,
    taskDependencies,
    setTaskDependencies,
    phases,
    refreshPhases,
    collaborators,
    docs,
    setError,
  } = useOutletContext()

  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [isMilestone, setIsMilestone] = useState(false)
  const [dependsOn, setDependsOn] = useState([])
  const [phaseId, setPhaseId] = useState('')
  const [assignee, setAssignee] = useState({ assignee_user_id: null, assignee_name: null })

  const [showAiGen, setShowAiGen] = useState(false)
  const [showImport, setShowImport] = useState(false)

  const [searchParams, setSearchParams] = useSearchParams()
  const taskId = searchParams.get('taskId')
  const [flashTaskId, setFlashTaskId] = useState(null)
  const taskRowRefs = useRef({})

  // ?taskFilter= - deep-link target for the Project Hotspots "Delayed
  // Tasks" badge (KeyMetricsDashboard.jsx's DelayedTaskCard), following
  // IssueLogView.jsx's ?issueFilter= pattern. Derived straight from
  // searchParams each render rather than mirrored into local state - unlike
  // IssueLogView (whose filter prop comes from a parent route one level up,
  // DocumentsRoute.jsx), this route owns its own searchParams directly, so
  // there's no prop/state re-sync needed. Coexists with taskId: a badge
  // click sets taskFilter only, an existing single-item Hotspot link (High
  // Risk/Overdue Phase's siblings before this redesign) sets taskId only,
  // and both can be present at once without conflict.
  const rawTaskFilter = searchParams.get('taskFilter')
  const taskFilter = VALID_TASK_FILTER_VALUES.includes(rawTaskFilter) ? rawTaskFilter : 'All'
  // Computed once per render, not memoized - cheap (a single Intl format
  // call) and this component already re-renders on every task edit anyway.
  const todayEasternStr = getEasternTodayStr()

  function setTaskFilter(next) {
    setSearchParams((prev) => {
      const nextParams = new URLSearchParams(prev)
      if (next === 'All') nextParams.delete('taskFilter')
      else nextParams.set('taskFilter', next)
      return nextParams
    })
  }

  // Per-group collapse state, keyed by group id ('none' or `phase:<id>`) -
  // an override map rather than a Set of collapsed ids so a group whose
  // default (see taskGroups below) is "collapsed" can still be explicitly
  // re-expanded, and vice versa, without needing to know every group id up
  // front (phases can still be loading on first render).
  const [collapseOverrides, setCollapseOverrides] = useState({})

  function isGroupCollapsed(key, defaultCollapsed) {
    return collapseOverrides[key] ?? defaultCollapsed
  }

  function toggleGroup(key, currentlyCollapsed) {
    setCollapseOverrides((prev) => ({ ...prev, [key]: !currentlyCollapsed }))
  }

  // Arrival from a Project Hotspots card (KeyMetricsDashboard.jsx's
  // hotspotLinkTo) - scroll the target task's row into view and flash it.
  // No group-expand step needed: a collapsed group still renders every task
  // as a compact row (see taskGroups below), it's just less detailed, so
  // the target row already exists in the DOM either way. Strips taskId from
  // the URL once the flash finishes, same as RiskLogView's riskId handling.
  useEffect(() => {
    if (!taskId) return
    setFlashTaskId(taskId)
    taskRowRefs.current[taskId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const timer = setTimeout(() => {
      setFlashTaskId(null)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('taskId')
          return next
        },
        { replace: true }
      )
    }, 2000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    if (isMilestone && !dueDate) {
      setError('A milestone marker needs a due date.')
      return
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: trimmed,
        project_id: project.id,
        start_date: isMilestone ? null : startDate || null,
        due_date: dueDate || null,
        task_type: isMilestone ? 'milestone_marker' : 'task',
        phase_id: project.methodology !== 'agile' ? phaseId || null : null,
        assignee_user_id: assignee.assignee_user_id,
        assignee_name: assignee.assignee_name,
      })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    if (dependsOn.length > 0) {
      const { data: depRows, error: depError } = await supabase
        .from('task_dependencies')
        .insert(dependsOn.map((id) => ({ task_id: data.id, depends_on_id: id })))
        .select()

      if (depError) setError(depError.message)
      else setTaskDependencies((prev) => [...prev, ...depRows])
    }

    setTasks((prev) => [...prev, data])
    setTitle('')
    setStartDate('')
    setDueDate('')
    setIsMilestone(false)
    setDependsOn([])
    setPhaseId('')
    setAssignee({ assignee_user_id: null, assignee_name: null })
  }

  async function toggleComplete(task) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed: !task.completed })
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

  async function updateTaskField(task, field, value) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ [field]: value || null })
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

    // phase_id/start_date/due_date are exactly the columns
    // recalc_phase_auto_dates (phases_schema.sql) recomputes
    // auto_start_date/auto_end_date from - refetch phases so
    // effective_end_date (and Overdue Phase detection downstream, see
    // KeyMetricsDashboard.jsx/PhaseDetailView.jsx) reflects that
    // server-side recalc without needing a hard refresh. Every other field
    // (title, status, assignee, ...) doesn't move a phase's dates, so it's
    // deliberately left out of this refetch.
    if (PHASE_AUTO_DATE_FIELDS.includes(field)) refreshPhases?.()
  }

  async function updateTaskDependencies(task, nextSelectedIds) {
    const currentIds = taskDependencies
      .filter((d) => d.task_id === task.id)
      .map((d) => d.depends_on_id)
    const toAdd = nextSelectedIds.filter((id) => !currentIds.includes(id))
    const toRemove = currentIds.filter((id) => !nextSelectedIds.includes(id))

    if (toRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from('task_dependencies')
        .delete()
        .eq('task_id', task.id)
        .in('depends_on_id', toRemove)

      if (deleteError) {
        setError(deleteError.message)
        return
      }
    }

    let inserted = []
    if (toAdd.length > 0) {
      const { data, error } = await supabase
        .from('task_dependencies')
        .insert(toAdd.map((id) => ({ task_id: task.id, depends_on_id: id })))
        .select()

      if (error) {
        setError(error.message)
        return
      }
      inserted = data
    }

    setTaskDependencies((prev) => [
      ...prev.filter((d) => d.task_id !== task.id || !toRemove.includes(d.depends_on_id)),
      ...inserted,
    ])
  }

  async function setTaskMilestone(task, nextIsMilestone) {
    if (nextIsMilestone && !task.due_date && !task.start_date) {
      setError('Set a start or due date on this task before marking it as a milestone marker.')
      return
    }

    setError(null)
    const { data, error } = await supabase
      .from('tasks')
      .update({
        task_type: nextIsMilestone ? 'milestone_marker' : 'task',
        ...(nextIsMilestone
          ? { start_date: null, ...(task.due_date ? {} : { due_date: task.start_date }) }
          : {}),
      })
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

  async function updateTaskAssignee(task, next) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ assignee_user_id: next.assignee_user_id, assignee_name: next.assignee_name })
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

  async function deleteTask(task) {
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)

    if (error) {
      setError(error.message)
      return
    }

    setTasks((prev) => prev.filter((t) => t.id !== task.id))
  }

  // 'delayed' goes through the same combined manual-flag/auto-trigger check
  // as the Project Hotspots badge (KeyMetricsDashboard.jsx's useCriticalIssues,
  // both via taskUtils.js's isTaskDelayed) - every other filter value is
  // still a plain literal status match.
  function passesTaskFilter(task) {
    if (taskFilter === 'All') return true
    if (taskFilter === 'delayed') return isTaskDelayed(task, todayEasternStr)
    return (task.status ?? 'not_started') === taskFilter
  }

  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number)
  const taskGroups = [
    {
      key: 'none',
      label: 'No Phase',
      items: tasks.filter((t) => !t.phase_id && passesTaskFilter(t)),
      defaultCollapsed: false,
    },
    ...sortedPhases.map((phase) => ({
      key: `phase:${phase.id}`,
      label: `${phase.phase_number}. ${phase.phase_name}`,
      items: tasks.filter((t) => t.phase_id === phase.id && passesTaskFilter(t)),
      defaultCollapsed: true,
    })),
  ]
  const taskFilterLabel = TASK_STATUS_OPTIONS.find((s) => s.key === taskFilter)?.label ?? taskFilter

  function statusFor(task) {
    return (
      TASK_STATUS_OPTIONS.find((s) => s.key === (task.status ?? 'not_started')) || TASK_STATUS_OPTIONS[0]
    )
  }

  function renderCompactTaskRow(task) {
    const status = statusFor(task)
    return (
      <li
        key={task.id}
        ref={(el) => {
          taskRowRefs.current[task.id] = el
        }}
        className={`group-compact-row ${flashTaskId === task.id ? 'hotspot-row-highlight' : ''}`}
      >
        <span className="group-compact-title">{task.title}</span>
        <span className="group-compact-meta">{resolveAssigneeLabel(task, collaborators, project) || 'Unassigned'}</span>
        <span className="group-compact-meta">{task.due_date || '—'}</span>
        <span className={`doc-status-badge ${status.colorClass}`}>{status.label}</span>
      </li>
    )
  }

  function renderFullTaskRow(task) {
    return (
      <li
        key={task.id}
        ref={(el) => {
          taskRowRefs.current[task.id] = el
        }}
        className={`${task.completed ? 'completed' : ''} ${flashTaskId === task.id ? 'hotspot-row-highlight' : ''}`}
      >
        <div className="task-row-main">
          <label>
            <input
              type="checkbox"
              checked={task.completed}
              disabled={!canEdit}
              onChange={() => toggleComplete(task)}
            />
            <span>{task.title}</span>
          </label>
          <div className="task-row-controls">
            {resolveAssigneeLabel(task, collaborators, project) && (
              <span className="task-assignee-badge">
                {resolveAssigneeLabel(task, collaborators, project)}
              </span>
            )}
            <select
              className={`task-status-select ${statusFor(task).colorClass}`}
              value={task.status ?? 'not_started'}
              disabled={!canEdit}
              onChange={(e) => updateTaskField(task, 'status', e.target.value)}
            >
              {TASK_STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key} className={`task-status-option ${s.colorClass}`}>
                  {s.label}
                </option>
              ))}
            </select>
            {canEdit && (
              <button
                type="button"
                className="delete"
                onClick={() => deleteTask(task)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="task-dates">
          <label className="task-milestone-toggle" title="A zero-duration diamond event on the Gantt chart (e.g. Design sign-off, Go-live) — unrelated to Epics, the Backlog's grouping concept.">
            <input
              type="checkbox"
              checked={task.task_type === 'milestone_marker'}
              disabled={!canEdit}
              onChange={(e) => setTaskMilestone(task, e.target.checked)}
            />
            Milestone marker
          </label>
          {task.task_type !== 'milestone_marker' && (
            <label className="task-date-field">
              Start
              <input
                type="date"
                value={task.start_date || ''}
                disabled={!canEdit}
                onChange={(e) => updateTaskField(task, 'start_date', e.target.value)}
              />
            </label>
          )}
          <label className="task-date-field">
            Due
            <input
              type="date"
              value={task.due_date || ''}
              disabled={!canEdit}
              onChange={(e) => updateTaskField(task, 'due_date', e.target.value)}
            />
          </label>
          <label className="task-select-field">
            Depends on
            <DependencyPicker
              tasks={tasks}
              dependencies={taskDependencies}
              currentTaskId={task.id}
              selectedIds={taskDependencies
                .filter((d) => d.task_id === task.id)
                .map((d) => d.depends_on_id)}
              onChange={(nextSelectedIds) => updateTaskDependencies(task, nextSelectedIds)}
              disabled={!canEdit}
              placeholder="Search tasks…"
            />
          </label>
          <label className="task-select-field">
            Phase
            <select
              value={task.phase_id || ''}
              disabled={!canEdit}
              onChange={(e) => updateTaskField(task, 'phase_id', e.target.value)}
            >
              <option value="">None</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phase_number}. {p.phase_name}
                </option>
              ))}
            </select>
          </label>
          <label className="task-select-field">
            Assignee
            <AssigneePicker
              collaborators={collaborators}
              assigneeUserId={task.assignee_user_id}
              assigneeName={task.assignee_name}
              ownerUserId={project.owner_id}
              ownerEmail={project.owner_email}
              disabled={!canEdit}
              onChange={(next) => updateTaskAssignee(task, next)}
            />
          </label>
        </div>
      </li>
    )
  }

  return (
    <MethodologySection side="waterfall">
      <div className="detail-zone">
        <h2 className="tasks-heading section-heading-static">
          <span className="toggle-header-main">Tasks and Milestones</span>
          <span className={`doc-status-badge ${tasks.length > 0 ? 'done' : 'pending'}`}>
            {tasks.length > 0 ? `${tasks.length} Task${tasks.length === 1 ? '' : 's'}` : 'Not started'}
          </span>
        </h2>

        {docs.charter && canEdit && (
          <button type="button" className="btn-secondary ai-task-gen-trigger" onClick={() => setShowAiGen((v) => !v)}>
            {tasks.length > 0 ? 'Generate More Tasks from Charter' : 'Generate Starter Tasks from Charter'}
          </button>
        )}

        {canEdit && (
          <button type="button" className="btn-secondary ai-task-gen-trigger" onClick={() => setShowImport((v) => !v)}>
            Import from Excel
          </button>
        )}

        {docs.charter && canEdit && project.methodology === 'hybrid' && (
          <p className="charter-status">
            Waterfall tasks and Backlog items are separate, non-overlapping actions - generating
            one doesn&rsquo;t touch the other, whether or not you&rsquo;ve already run Task Gen or
            Backlog Gen.
          </p>
        )}

        {showAiGen && canEdit && (
          <TaskGenFlow
            project={project}
            charter={docs.charter}
            brief={docs.requirements_brief}
            riskLog={docs.risk_log}
            existingTasks={tasks.map((t) => ({ id: t.id, title: t.title, due_date: t.due_date }))}
            collaborators={collaborators}
            onCommitted={(insertedTasks, insertedDeps) => {
              setTasks((prev) => [...prev, ...insertedTasks])
              if (insertedDeps?.length) setTaskDependencies((prev) => [...prev, ...insertedDeps])
            }}
            onDone={() => setShowAiGen(false)}
            onCancel={() => setShowAiGen(false)}
          />
        )}

        {showImport && canEdit && (
          <TaskImportFlow
            project={project}
            existingTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
            collaborators={collaborators}
            onCommitted={(insertedTasks, insertedDeps) => {
              setTasks((prev) => [...prev, ...insertedTasks])
              if (insertedDeps?.length) setTaskDependencies((prev) => [...prev, ...insertedDeps])
            }}
            onDone={() => setShowImport(false)}
            onCancel={() => setShowImport(false)}
          />
        )}

        {canEdit && (
          <form onSubmit={handleSubmit} className="task-form">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a task..."
            />
            <label className="task-milestone-toggle" title="A zero-duration diamond event on the Gantt chart (e.g. Design sign-off, Go-live) — unrelated to Epics, the Backlog's grouping concept.">
              <input
                type="checkbox"
                checked={isMilestone}
                onChange={(e) => setIsMilestone(e.target.checked)}
              />
              Milestone marker
            </label>
            {!isMilestone && (
              <label className="task-date-field">
                Start
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
            )}
            <label className="task-date-field">
              Due
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                required={isMilestone}
              />
            </label>
            <label className="task-select-field">
              Depends on
              <DependencyPicker
                tasks={tasks}
                dependencies={taskDependencies}
                currentTaskId={null}
                selectedIds={dependsOn}
                onChange={setDependsOn}
                placeholder="Search tasks…"
              />
            </label>
            <label className="task-select-field">
              Phase
              <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">None</option>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.phase_number}. {p.phase_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="task-select-field">
              Assignee
              <AssigneePicker
                collaborators={collaborators}
                assigneeUserId={assignee.assignee_user_id}
                assigneeName={assignee.assignee_name}
                ownerUserId={project.owner_id}
                ownerEmail={project.owner_email}
                onChange={setAssignee}
              />
            </label>
            <button type="submit">Add</button>
          </form>
        )}

        {tasks.length === 0 && <p className="empty">No tasks yet</p>}

        {tasks.length > 0 && (
          <div className="filter-tabs risk-log-severity-filter">
            {['All', ...TASK_STATUS_OPTIONS.map((s) => s.key)].map((key) => (
              <button
                key={key}
                type="button"
                className={`filter-tab ${taskFilter === key ? 'selected' : ''}`}
                onClick={() => setTaskFilter(key)}
              >
                {key === 'All' ? 'All' : TASK_STATUS_OPTIONS.find((s) => s.key === key).label}
              </button>
            ))}
          </div>
        )}

        {tasks.length > 0 &&
          taskGroups.map((group) => {
            const collapsed = isGroupCollapsed(group.key, group.defaultCollapsed)
            return (
              <div className="task-group" key={group.key}>
                <button
                  type="button"
                  className="collapsible-toggle group-header-row"
                  aria-expanded={!collapsed}
                  onClick={() => toggleGroup(group.key, collapsed)}
                >
                  <span className={`chevron ${collapsed ? 'collapsed' : ''}`} aria-hidden="true">
                    ▾
                  </span>
                  <span className="group-header-label">{group.label}</span>
                  <span className="doc-status-badge pending group-header-count">
                    {group.items.length} Task{group.items.length === 1 ? '' : 's'}
                  </span>
                </button>

                {collapsed ? (
                  <ul className="task-list group-compact-list">
                    {group.items.map((task) => renderCompactTaskRow(task))}
                    {group.items.length === 0 && (
                      <li className="empty">
                        {taskFilter === 'All' ? 'No tasks in this group' : `No ${taskFilterLabel} tasks in this group`}
                      </li>
                    )}
                  </ul>
                ) : (
                  <ul className="task-list">
                    {group.items.map((task) => renderFullTaskRow(task))}
                    {group.items.length === 0 && (
                      <li className="empty">
                        {taskFilter === 'All' ? 'No tasks in this group' : `No ${taskFilterLabel} tasks in this group`}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )
          })}
      </div>
    </MethodologySection>
  )
}

export default PlanningTasksRoute
