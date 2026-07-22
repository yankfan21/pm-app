import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from './supabaseClient'
import TaskGenFlow from './TaskGenFlow'
import TaskImportFlow from './TaskImportFlow'
import DependencyPicker from './components/DependencyPicker'
import AssigneePicker, { resolveAssigneeLabel } from './components/AssigneePicker'
import { MethodologySection } from './ProjectSectionRoutes'

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

function PlanningTasksRoute() {
  const {
    project,
    canEdit,
    tasks,
    setTasks,
    taskDependencies,
    setTaskDependencies,
    phases,
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

  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number)
  const taskGroups = [
    {
      key: 'none',
      label: 'No Phase',
      items: tasks.filter((t) => !t.phase_id),
      defaultCollapsed: false,
    },
    ...sortedPhases.map((phase) => ({
      key: `phase:${phase.id}`,
      label: `${phase.phase_number}. ${phase.phase_name}`,
      items: tasks.filter((t) => t.phase_id === phase.id),
      defaultCollapsed: true,
    })),
  ]

  function statusFor(task) {
    return (
      TASK_STATUS_OPTIONS.find((s) => s.key === (task.status ?? 'not_started')) || TASK_STATUS_OPTIONS[0]
    )
  }

  function renderCompactTaskRow(task) {
    const status = statusFor(task)
    return (
      <li key={task.id} className="group-compact-row">
        <span className="group-compact-title">{task.title}</span>
        <span className="group-compact-meta">{resolveAssigneeLabel(task, collaborators) || 'Unassigned'}</span>
        <span className="group-compact-meta">{task.due_date || '—'}</span>
        <span className={`doc-status-badge ${status.colorClass}`}>{status.label}</span>
      </li>
    )
  }

  function renderFullTaskRow(task) {
    return (
      <li key={task.id} className={task.completed ? 'completed' : ''}>
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
            {resolveAssigneeLabel(task, collaborators) && (
              <span className="task-assignee-badge">
                {resolveAssigneeLabel(task, collaborators)}
              </span>
            )}
            <select
              className={`task-status-select ${statusFor(task).colorClass}`}
              value={task.status ?? 'not_started'}
              disabled={!canEdit}
              onChange={(e) => updateTaskField(task, 'status', e.target.value)}
            >
              {TASK_STATUS_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>
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
                onChange={setAssignee}
              />
            </label>
            <button type="submit">Add</button>
          </form>
        )}

        {tasks.length === 0 && <p className="empty">No tasks yet</p>}

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
                    {group.items.length === 0 && <li className="empty">No tasks in this group</li>}
                  </ul>
                ) : (
                  <ul className="task-list">
                    {group.items.map((task) => renderFullTaskRow(task))}
                    {group.items.length === 0 && <li className="empty">No tasks in this group</li>}
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
