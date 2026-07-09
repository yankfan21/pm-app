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
