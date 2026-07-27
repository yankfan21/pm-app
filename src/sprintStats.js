// Shared by SprintBoardView's velocity summary and SprintRetroView's retro
// snapshot, so both read the same number rather than each recomputing it.
export function computeSprintPoints(tasks, sprintId) {
  const sprintTasks = tasks.filter((t) => t.sprint_id === sprintId)
  const committed = sprintTasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  const completed = sprintTasks
    .filter((t) => t.board_status === 'done')
    .reduce((sum, t) => sum + (t.story_points ?? 0), 0)

  return { sprintTasks, committed, completed }
}

// Mirrors phaseUtils.js's isPhaseOverdue exactly, applied to sprints instead
// of phases: end date has passed while at least one linked task/backlog
// item is still incomplete (board_status !== 'done'). Used by
// KeyMetricsDashboard.jsx (Project Hotspots' Overdue Sprints count) and
// ProjectSectionRoutes.jsx's ExecutionSprintBoardRoute (the
// ?sprintFilter=overdue deep-link's auto-select).
export function isSprintOverdue(sprint, tasks, todayStr) {
  if (!sprint.end_date || todayStr <= sprint.end_date) return false
  const linked = tasks.filter((t) => t.sprint_id === sprint.id)
  return linked.some((t) => (t.board_status ?? 'todo') !== 'done')
}
