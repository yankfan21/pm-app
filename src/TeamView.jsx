import { useMemo } from 'react'
import { resolveAssigneeLabel } from './components/AssigneePicker'
import { todayLocalDateString } from './useSprintSelection'

function groupKeyFor(task) {
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
function computeWaterfallStats(groupTasks, todayStr) {
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
// ProjectDetail.jsx).
function computeAgileStats(groupTasks) {
  const taskCount = groupTasks.length
  const totalPoints = groupTasks.reduce((sum, t) => sum + (t.story_points ?? 0), 0)
  return { taskCount, totalPoints }
}

// Tasks grouped by assignee, with per-person load stats - variant controls
// both which subset of tasks counts (Agile scopes to the active sprint,
// Waterfall/Hybrid doesn't) and which stats apply, per the spec this was
// built from. Read-only, no editing here (that lives on the Backlog/Sprint
// Board/Task list rows themselves).
function TeamView({ title, variant, tasks, collaborators, sprints, selectedSprintId, expanded }) {
  const activeSprint = variant === 'agile' ? sprints?.find((s) => s.id === selectedSprintId) || null : null

  const groups = useMemo(() => {
    const scoped = variant === 'agile' && activeSprint ? tasks.filter((t) => t.sprint_id === activeSprint.id) : tasks

    const map = new Map()
    scoped.forEach((task) => {
      const key = groupKeyFor(task)
      if (!map.has(key)) {
        map.set(key, { key, label: resolveAssigneeLabel(task, collaborators) || 'Unassigned', tasks: [] })
      }
      map.get(key).tasks.push(task)
    })
    return [...map.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, collaborators, variant, activeSprint?.id])

  const todayStr = todayLocalDateString()

  const sortedGroups = useMemo(() => {
    const withStats = groups.map((g) => ({
      ...g,
      stats: variant === 'agile' ? computeAgileStats(g.tasks) : computeWaterfallStats(g.tasks, todayStr),
    }))

    withStats.sort((a, b) => {
      // Unassigned always sits last regardless of load, so it doesn't
      // crowd out real people at the top of a "who's overloaded" view.
      if (a.key === 'unassigned') return 1
      if (b.key === 'unassigned') return -1
      const primary =
        variant === 'agile' ? b.stats.totalPoints - a.stats.totalPoints : b.stats.taskCount - a.stats.taskCount
      return primary !== 0 ? primary : a.label.localeCompare(b.label)
    })
    return withStats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, variant])

  const itemNoun = variant === 'agile' ? 'backlog item' : 'task'

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">{title}</span>
        <span className={`doc-status-badge ${sortedGroups.length > 0 ? 'done' : 'pending'}`}>
          {sortedGroups.length > 0
            ? `${sortedGroups.length} Assignee${sortedGroups.length === 1 ? '' : 's'}`
            : 'No items'}
        </span>
      </h2>

      {expanded && (
        <div className="team-view-body">
          {variant === 'agile' && (
            <p className="charter-status">
              {activeSprint
                ? `Scoped to the active sprint, "${activeSprint.name}".`
                : 'No active sprint — showing backlog-wide totals.'}
            </p>
          )}

          <div className="risk-table-wrap">
            <table className="risk-log-table team-view-table">
              <thead>
                <tr>
                  <th>Assignee</th>
                  <th>{variant === 'agile' ? 'Backlog Items' : 'Tasks'}</th>
                  {variant === 'agile' ? (
                    <th>Story Points</th>
                  ) : (
                    <>
                      <th>Overdue/Delayed</th>
                      <th>Overlapping</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedGroups.map((g) => (
                  <tr key={g.key}>
                    <td>{g.label}</td>
                    <td>{g.stats.taskCount}</td>
                    {variant === 'agile' ? (
                      <td>{g.stats.totalPoints} pts</td>
                    ) : (
                      <>
                        <td>
                          <span
                            className={`status-dot ${g.stats.overdueOrDelayedCount > 0 ? 'critical' : 'done'}`}
                            aria-hidden="true"
                          />{' '}
                          {g.stats.overdueOrDelayedCount}
                        </td>
                        <td>
                          <span
                            className={`status-dot ${g.stats.overlapCount > 0 ? 'critical' : 'done'}`}
                            aria-hidden="true"
                          />{' '}
                          {g.stats.overlapCount}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {sortedGroups.length === 0 && (
                  <tr>
                    <td colSpan={variant === 'agile' ? 3 : 4} className="empty">
                      No {itemNoun}s assigned yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamView
