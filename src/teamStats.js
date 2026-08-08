// Per-assignee grouping and load stats, lifted verbatim out of TeamView.jsx
// so the Team routes (ExecutionTeamWaterfallRoute / ExecutionTeamAgileRoute)
// and Overview's Team Hotspots panel compute the same numbers from one
// definition instead of two.
//
// Lifting the functions was chosen over rendering a scoped-down <TeamView>
// on Overview: TeamView owns its own .detail-zone wrapper plus an <h2>
// section header with a hover-lift, and Overview needs this content as a
// panel *inside* the Overview .detail-zone. Reusing the component there
// would nest a detail-zone in a detail-zone - doubled border, doubled
// padding, and two competing hover transforms on the same pointer event.
// Extracting the logic keeps the single source of truth (the actual goal)
// without dragging the chrome along with it.

// Collaborator id first, free-text name second, unassigned last - matches
// the mutually-exclusive assignee_user_id / assignee_name pair enforced at
// the DB level (tasks_assignee_single_check, see AssigneePicker.jsx).
export function groupKeyFor(task) {
  if (task.assignee_user_id) return `user:${task.assignee_user_id}`
  if (task.assignee_name) return `name:${task.assignee_name}`
  return 'unassigned'
}

function rangesOverlap(a, b) {
  return a.start_date <= b.due_date && b.start_date <= a.due_date
}

// Waterfall/Hybrid stats: task count, an "overdue/delayed" count (either
// PM-marked status='delayed', or computed overdue - due date passed and not
// completed, same overdue definition project-eval/index.ts's taskStats()
// uses), and an overlap count - how many of that person's currently-
// incomplete, fully-dated tasks share a date range with at least one other
// such task of theirs. Counts *tasks involved in* an overlap, not pairs.
export function computeWaterfallStats(groupTasks, todayStr) {
  const taskCount = groupTasks.length
  const overdueOrDelayedCount = groupTasks.filter(
    (t) => t.status === 'delayed' || (!t.completed && t.due_date && t.due_date < todayStr)
  ).length

  const ranged = groupTasks.filter((t) => !t.completed && t.start_date && t.due_date)
  const overlapCount = ranged.filter((t, i) =>
    ranged.some((other, j) => j !== i && rangesOverlap(t, other))
  ).length

  return { taskCount, overdueOrDelayedCount, overlapCount }
}

// Agile stats: task count + summed story points, over whichever task subset
// the caller already scoped (the active sprint, or backlog-wide - see
// TeamView.jsx).
export function computeAgileStats(groupTasks) {
  const taskCount = groupTasks.length
  const totalPoints = groupTasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  return { taskCount, totalPoints }
}

// Groups an already-scoped task array by assignee, attaches the stats for
// the given variant, and sorts heaviest-first. `resolveLabel` is passed in
// rather than imported so this module stays free of the components/ tree -
// every caller already has resolveAssigneeLabel from AssigneePicker.jsx.
export function buildAssigneeGroups(tasks, { variant, todayStr, resolveLabel }) {
  const map = new Map()
  tasks.forEach((task) => {
    const key = groupKeyFor(task)
    if (!map.has(key)) {
      map.set(key, { key, label: resolveLabel(task) || 'Unassigned', tasks: [] })
    }
    map.get(key).tasks.push(task)
  })

  const withStats = [...map.values()].map((g) => ({
    ...g,
    stats: variant === 'agile' ? computeAgileStats(g.tasks) : computeWaterfallStats(g.tasks, todayStr),
  }))

  withStats.sort((a, b) => {
    // Unassigned always sits last regardless of load, so it doesn't crowd
    // out real people at the top of a "who's overloaded" view.
    if (a.key === 'unassigned') return 1
    if (b.key === 'unassigned') return -1
    const primary =
      variant === 'agile' ? b.stats.totalPoints - a.stats.totalPoints : b.stats.taskCount - a.stats.taskCount
    return primary !== 0 ? primary : a.label.localeCompare(b.label)
  })

  return withStats
}
