// Time-based facts only, derived from existing project, task, milestone and status
// update data: a passed go-live date, overdue tasks, a milestone date passed with open tasks, a
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

    if (project.deadline && project.deadline < todayStr) {
      const days = daysBetween(project.deadline, today)
      items.push({
        key: `golive-${project.id}`,
        projectId: project.id,
        projectName: project.name,
        text: `Target go-live passed ${plural(days, 'day')} ago (${project.deadline})`,
        daysLate: days,
      })
    }

    const plan = planItems.find((i) => i.project_id === project.id && i.type === 'Status Update')
    const every = plan && CADENCE_DAYS[plan.frequency]
    if (every) {
      const mine = updates.filter((u) => u.project_id === project.id)
      const neverSent = mine.length === 0
      // With no update on record the clock starts when the plan row was made.
      const last = neverSent ? plan.created_at : mine.reduce((a, b) => (a.created_at >= b.created_at ? a : b)).created_at
      const days = daysBetween(last, today)
      if (days > every) {
        items.push({
          key: `su-${project.id}`,
          projectId: project.id,
          projectName: project.name,
          text: neverSent
            ? `No status update sent yet; the ${plan.frequency.toLowerCase()} plan was set up ${plural(days, 'day')} ago`
            : `Status update is due (${plan.frequency.toLowerCase()}); the last was ${plural(days, 'day')} ago`,
          daysLate: days - every,
        })
      }
    }
  }

  return items.sort((a, b) => b.daysLate - a.daysLate)
}

// Demo projects only count while they are all the user has.
export function attentionProjects(projects) {
  return projects.some((p) => !p.is_demo) ? projects.filter((p) => !p.is_demo) : projects
}

// The single fact behind the dashboard AI note. First choice: the milestone
// that slipped furthest (date passed, tasks still open). Failing that, the
// top item of the attention list, so the note still has something true to
// say. Rule-based; the note only words it and never changes anything.
// Shape: { key, project, sentence, openTasks }.
export function computeAiNoteFact(projects, data, today = Date.now()) {
  const { tasks, milestones } = data
  const todayStr = new Date(today).toISOString().slice(0, 10)
  let best = null
  for (const project of projects) {
    for (const m of milestones.filter((x) => x.project_id === project.id)) {
      if (!m.end_date || m.end_date >= todayStr) continue
      const left = tasks.filter(
        (t) => t.project_id === project.id && t.milestone_id === m.id && t.status !== 'completed' && t.task_type !== 'milestone_marker'
      )
      if (left.length === 0) continue
      const days = daysBetween(m.end_date, today)
      if (!best || days > best.days) best = { key: m.id, project, milestone: m, openTasks: left, days }
    }
  }
  if (best) {
    const { project, milestone, openTasks, days } = best
    return {
      key: `ms-${milestone.id}`,
      project,
      openTasks,
      sentence:
        `On ${project.name}, the ${milestone.name} milestone slipped by ${plural(days, 'day')} and ` +
        `${plural(openTasks.length, 'task')} tied to it ${openTasks.length === 1 ? 'is' : 'are'} still open.` +
        (project.deadline ? ` The go-live is ${project.deadline}.` : ''),
    }
  }

  const [top] = computeAttentionItems(projects, data, today)
  if (!top) return null
  const project = projects.find((p) => p.id === top.projectId)
  // Dismissals of these come back weekly: the facts are ongoing, not one event.
  const week = Math.floor(today / (7 * DAY))
  return { key: `${top.key}:${week}`, project, openTasks: [], sentence: `${top.projectName}: ${top.text}.` }
}
