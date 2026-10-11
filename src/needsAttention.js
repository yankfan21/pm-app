// Time-based facts only, derived from existing task, milestone and status
// update data: overdue tasks, a milestone date passed with open tasks, a
// status update overdue by the project's own cadence. Deliberately no risk
// scoring - this is not a risk log.

const DAY = 86400000

const CADENCE_DAYS = { Daily: 1, Weekly: 7, Biweekly: 14, Monthly: 31 }

function daysBetween(fromIso, today) {
  return Math.floor((today - new Date(fromIso).getTime()) / DAY)
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// projects: active projects. data: { tasks, milestones, planItems, updates }
// (flat row arrays). Returns items sorted most-overdue first.
export function computeAttentionItems(projects, { tasks, milestones, planItems, updates }, today = Date.now()) {
  const items = []
  const todayStr = new Date(today).toISOString().slice(0, 10)
  const open = (t) => t.status !== 'completed' && t.task_type !== 'milestone_marker'

  for (const project of projects) {
    const pTasks = tasks.filter((t) => t.project_id === project.id && open(t))

    const overdue = pTasks.filter((t) => t.due_date && t.due_date < todayStr)
    if (overdue.length > 0) {
      const oldest = overdue.reduce((a, b) => (a.due_date <= b.due_date ? a : b))
      const days = daysBetween(oldest.due_date, today)
      items.push({
        key: `task-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        text:
          overdue.length === 1
            ? `"${oldest.title}" is ${plural(days, 'day')} past due`
            : `${plural(overdue.length, 'task')} past due, the oldest by ${plural(days, 'day')}`,
        daysLate: days,
      })
    }

    for (const m of milestones.filter((x) => x.project_id === project.id)) {
      if (!m.end_date || m.end_date >= todayStr) continue
      const left = pTasks.filter((t) => t.milestone_id === m.id)
      if (left.length === 0) continue
      const days = daysBetween(m.end_date, today)
      items.push({
        key: `ms-${m.id}`,
        projectId: project.id,
        projectName: project.name,
        text: `"${m.name}" passed ${plural(days, 'day')} ago with ${plural(left.length, 'task')} still open`,
        daysLate: days,
      })
    }

    const plan = planItems.find((i) => i.project_id === project.id && i.type === 'Status Update')
    const every = plan && CADENCE_DAYS[plan.frequency]
    if (every) {
      const mine = updates.filter((u) => u.project_id === project.id)
      const last = mine.length ? mine.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).created_at : plan.created_at
      const days = daysBetween(last, today)
      if (days > every) {
        items.push({
          key: `su-${project.id}`,
          projectId: project.id,
          projectName: project.name,
          text: `Status update is due (${plan.frequency.toLowerCase()}); the last was ${plural(days, 'day')} ago`,
          daysLate: days - every,
        })
      }
    }
  }

  return items.sort((a, b) => b.daysLate - a.daysLate)
}
