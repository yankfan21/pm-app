import { useMemo, useState } from 'react'

// Generic multi-predecessor dependency picker (Phase 3 - see CLAUDE.md
// "Known follow-ups"). Meant to be dropped into ProjectDetail.jsx's task
// form, TaskGenFlow.jsx, and TaskImportFlow.jsx in place of whatever
// single-select "Depends on" UI each currently has, but is not wired into
// any of them yet - this is the standalone component for review first.
//
// Callers normalize both real DB tasks and "virtual" in-batch tasks (rows
// in a TaskGenFlow/TaskImportFlow batch that don't have a DB id yet) into
// the same flat `tasks` list before passing it in, distinguished by the
// `isVirtual` flag rather than by id shape - so a batch row's temp_id and a
// real task's uuid are interchangeable as far as this component is
// concerned. `dependencies` should use that same id-space for edges
// internal to the batch.
//
// The ancestor/cycle check below is a client-side UX nicety layered on top
// of the DB's prevent_task_dependency_cycles trigger
// (task_dependency_cycle_guard.sql) - it grays out choices that would
// close a cycle, but the trigger is still the source of truth (and is the
// only thing that can see cross-batch/already-committed edges a virtual
// task's caller might not have loaded).

function isTaskDone(task) {
  return task.status === 'completed' || task.completed === true
}

// Ancestors of `currentTaskId` = tasks that already (directly or
// transitively) depend on it. Selecting any of them as a new dependency
// of currentTaskId would close a cycle, so the caller must exclude them.
function computeAncestors(currentTaskId, dependencies) {
  const dependents = new Map() // depends_on_id -> [task_id, ...] that depend on it
  for (const edge of dependencies) {
    if (!dependents.has(edge.depends_on_id)) dependents.set(edge.depends_on_id, [])
    dependents.get(edge.depends_on_id).push(edge.task_id)
  }

  const ancestors = new Set()
  const queue = [currentTaskId]
  while (queue.length > 0) {
    const node = queue.pop()
    for (const dependent of dependents.get(node) || []) {
      if (!ancestors.has(dependent)) {
        ancestors.add(dependent)
        queue.push(dependent)
      }
    }
  }
  return ancestors
}

// Props:
// - tasks: array of { id, title, completed?, status?, isVirtual? } - every
//   selectable task in scope (a project's tasks, or a TaskGenFlow/
//   TaskImportFlow batch, or a mix of both). `id` may be a real uuid or a
//   virtual/temp id - this component treats them identically.
// - dependencies: array of { task_id, depends_on_id } - the full edge set
//   over that same id-space, used only to compute the ancestor/cycle guard.
// - currentTaskId: id of the task being edited. Pass null/undefined for a
//   brand-new task with no id yet and no ancestor exclusion is applied
//   (nothing can already depend on a task that doesn't exist yet).
// - selectedIds: array of ids currently selected as dependencies of
//   currentTaskId (controlled).
// - onChange(nextSelectedIds): fired on every add/remove.
// - disabled: read-only mode (e.g. !canEdit) - hides the search/toggle,
//   still renders chips.
// - placeholder: search input placeholder, so copy can differ per call site.
// - showCompletedDefault: initial state of the "show completed" toggle.
export default function DependencyPicker({
  tasks,
  dependencies,
  currentTaskId = null,
  selectedIds,
  onChange,
  disabled = false,
  placeholder = 'Search tasks…',
  showCompletedDefault = false,
}) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(showCompletedDefault)

  const ancestorIds = useMemo(
    () => (currentTaskId ? computeAncestors(currentTaskId, dependencies) : new Set()),
    [currentTaskId, dependencies]
  )

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedTasks = useMemo(
    () => selectedIds.map((id) => tasks.find((t) => t.id === id)).filter(Boolean),
    [selectedIds, tasks]
  )

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tasks.filter((task) => {
      if (task.id === currentTaskId) return false
      if (selectedSet.has(task.id)) return false
      if (!showCompleted && isTaskDone(task)) return false
      if (q && !task.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [tasks, currentTaskId, selectedSet, showCompleted, query])

  function addDependency(id) {
    if (selectedSet.has(id) || ancestorIds.has(id)) return
    onChange([...selectedIds, id])
  }

  function removeDependency(id) {
    onChange(selectedIds.filter((existingId) => existingId !== id))
  }

  return (
    <div className="dependency-picker">
      {selectedTasks.length > 0 && (
        <ul className="dependency-picker-chips">
          {selectedTasks.map((task) => (
            <li key={task.id} className="dependency-picker-chip">
              <span>{task.title}</span>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove dependency on ${task.title}`}
                  onClick={() => removeDependency(task.id)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="dependency-picker-input-wrap">
          <input
            type="text"
            className="dependency-picker-search"
            placeholder={placeholder}
            value={query}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setIsOpen(false)}
            onChange={(e) => setQuery(e.target.value)}
          />

          <label className="dependency-picker-show-completed">
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            Show completed
          </label>

          {isOpen && (
            <ul className="dependency-picker-results">
              {candidates.length === 0 && <li className="dependency-picker-empty">No matching tasks</li>}
              {candidates.map((task) => {
                const blocked = ancestorIds.has(task.id)
                return (
                  <li key={task.id}>
                    <button
                      type="button"
                      className={`dependency-picker-option${blocked ? ' blocked' : ''}`}
                      disabled={blocked}
                      title={blocked ? 'Selecting this would create a circular dependency' : undefined}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => addDependency(task.id)}
                    >
                      {task.title}
                      {task.isVirtual && <span className="dependency-picker-virtual-tag">new</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
