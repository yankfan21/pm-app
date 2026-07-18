// Shared task-to-timeline computation used by both the live chart
// (GanttChart.jsx) and the PDF export (ganttExport.js) so the two never
// drift out of sync with each other.

export const DAY_MS = 24 * 60 * 60 * 1000

export function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime()
}

// "What day is it right now" has to be read via local getters, not
// toISOString() (which reports the UTC calendar date). Those two disagree
// whenever the viewer is far enough from UTC that the date has already
// rolled over in one but not the other - e.g. anyone west of UTC in the
// evening sees toISOString() report tomorrow, since UTC has already
// crossed midnight while it's still "today" locally.
export function todayLocalDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Adds (or subtracts, for negative n) whole days to a "YYYY-MM-DD" date
// string, staying in local calendar time throughout (parse via the same
// T00:00:00-suffixed local-time constructor used everywhere else in this
// file) so it never drifts a day off across a UTC offset boundary the way
// pure ms-based arithmetic could.
export function addDaysLocal(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// A task needs at least one date to appear on the timeline - if only one of
// start/due is set, it's plotted as a single-day bar on that date.
//
// `project` is optional (defaults to treating it as active) - the Today
// marker is only relevant to work that's still ongoing, so it's included in
// the visible range for active projects, but left out for archived ones.
// Forcing it into an archived project's range would stretch the chart to
// span the gap between whenever the (already-finished) work happened and
// today, compressing the actual task bars into an unreadable sliver.
//
// `phases` is optional - when passed, each phase's effective_start_date/
// effective_end_date (auto or custom, whichever is active - see
// phases_schema.sql) widens the visible range the same way task dates do.
// Without this, a PM's Custom-mode buffer (e.g. Closing extended two weeks
// past its last task's due date) would render off the edge of the chart
// instead of showing the buffer they explicitly set. Phase dates never
// create a chart on their own, though - a project with phases but no dated
// tasks still shows the "add a date" empty state, same as before.
export function computeGanttLayout(tasks, project, phases = []) {
  const isArchived = project?.status === 'Archived'

  const scheduled = tasks.filter((t) => t.start_date || t.due_date)
  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date)

  const bars = scheduled.map((task) => {
    const start = task.start_date || task.due_date
    const due = task.due_date || task.start_date
    return { task, startMs: parseDay(start), dueMs: parseDay(due) }
  })

  const todayMs = parseDay(todayLocalDateString())

  const phaseMs = bars.length
    ? phases
        .flatMap((p) => [p.effective_start_date, p.effective_end_date])
        .filter(Boolean)
        .map(parseDay)
    : []

  const taskRangeStart = bars.length ? Math.min(...bars.map((b) => b.startMs), ...phaseMs) : 0
  const taskRangeEndRaw = bars.length ? Math.max(...bars.map((b) => b.dueMs), ...phaseMs) : 0

  // For active projects, the visible range always widens to include today
  // (whenever there's a chart to show at all) so the Today marker is a
  // reliable, always-present reference point - not just something that
  // shows up if it happens to fall within whatever the task dates already
  // span. A project that hasn't started yet, or one that's long since
  // wrapped up, still gets a marker showing where "now" sits relative to
  // its plan. Archived projects skip this widening - see comment above.
  const includeToday = bars.length > 0 && !isArchived
  const rangeStart = bars.length ? Math.min(taskRangeStart, includeToday ? todayMs : taskRangeStart) : 0
  const rangeEndRaw = bars.length ? Math.max(taskRangeEndRaw, includeToday ? todayMs : taskRangeEndRaw) : 0
  // Guard against a zero-width range when every bar (and today) falls on
  // the same day.
  const rangeEnd = rangeEndRaw > rangeStart ? rangeEndRaw : rangeStart + DAY_MS
  const totalSpan = rangeEnd - rangeStart

  const todayInRange = bars.length > 0 && todayMs >= rangeStart && todayMs <= rangeEnd

  return { bars, unscheduled, rangeStart, rangeEnd, rangeEndRaw, totalSpan, todayMs, todayInRange }
}

// Longest path through the task-dependency DAG, restricted to tasks that
// actually appear on the chart (computeGanttLayout's `bars` - a task with no
// date at all has no duration to contribute and never renders a bar, so it
// can't participate). Node weight is each task's own duration (dueMs -
// startMs), which is already 0 for milestone markers (due_date only, no
// start_date - see gantt_milestones_and_delayed_status.sql) and for
// single-date tasks (the bars computation above already collapses start=due
// when only one is set) - so both fall out as zero-duration nodes without
// any special-casing here.
//
// Standard DAG longest-path: Kahn's-algorithm topological sort, then a
// forward DP where each node's longest-path-ending-here is its own duration
// plus the max over its predecessors' longest-path-ending-there. The
// overall critical path is the max across all nodes, reconstructed by
// walking back the argmax predecessor pointers. This is a single path (the
// classic DAG longest-path result), not full CPM slack/float analysis - a
// project can have multiple tied-longest chains, and only one is reported.
//
// A cycle would leave some nodes permanently at nonzero in-degree - Kahn's
// algorithm just never dequeues them, so they're silently excluded from the
// topological order and therefore from the DP, rather than infinite-looping
// or crashing. Cycles are already prevented at the DB level
// (task_dependency_cycle_guard.sql); this is a non-crashing fallback, not
// the primary defense.
//
// Returns hasEdges: false when there are no dependency edges among
// chart-visible tasks at all, rather than degenerating to a trivial 1-node
// "path" (just the single longest-duration task) - a lone unconnected task
// isn't a meaningful critical path, so the caller shows a message instead
// of highlighting an arbitrary bar.
export function computeCriticalPath(bars, taskDependencies) {
  const duration = new Map()
  bars.forEach(({ task, startMs, dueMs }) => duration.set(task.id, dueMs - startMs))

  const preds = new Map()
  const succs = new Map()
  duration.forEach((_, id) => {
    preds.set(id, [])
    succs.set(id, [])
  })

  ;(taskDependencies || []).forEach((d) => {
    if (!duration.has(d.task_id) || !duration.has(d.depends_on_id)) return
    preds.get(d.task_id).push(d.depends_on_id)
    succs.get(d.depends_on_id).push(d.task_id)
  })

  const hasEdges = [...preds.values()].some((p) => p.length > 0)
  if (!hasEdges) {
    return { hasEdges: false, taskIds: new Set(), edgeIds: new Set(), totalDays: 0, taskCount: 0 }
  }

  const inDegree = new Map()
  duration.forEach((_, id) => inDegree.set(id, preds.get(id).length))

  const queue = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id)
  const topoOrder = []
  while (queue.length > 0) {
    const id = queue.shift()
    topoOrder.push(id)
    succs.get(id).forEach((succId) => {
      const next = inDegree.get(succId) - 1
      inDegree.set(succId, next)
      if (next === 0) queue.push(succId)
    })
  }

  const dist = new Map()
  const bestPred = new Map()
  topoOrder.forEach((id) => {
    let best = 0
    let bestId = null
    preds.get(id).forEach((predId) => {
      const predDist = dist.get(predId) ?? 0
      if (predDist > best) {
        best = predDist
        bestId = predId
      }
    })
    dist.set(id, duration.get(id) + best)
    bestPred.set(id, bestId)
  })

  let endId = null
  let endDist = -1
  topoOrder.forEach((id) => {
    if (dist.get(id) > endDist) {
      endDist = dist.get(id)
      endId = id
    }
  })

  const pathIds = []
  for (let cursor = endId; cursor != null; cursor = bestPred.get(cursor)) {
    pathIds.push(cursor)
  }
  pathIds.reverse()

  const edgeIds = new Set()
  for (let i = 0; i < pathIds.length - 1; i++) {
    edgeIds.add(`${pathIds[i]}-${pathIds[i + 1]}`)
  }

  return {
    hasEdges: true,
    taskIds: new Set(pathIds),
    edgeIds,
    totalDays: Math.round(endDist / DAY_MS),
    taskCount: pathIds.length,
  }
}
