import { useMemo } from 'react'
import { resolveAssigneeLabel } from './components/AssigneePicker'
import { todayLocalDateString } from './useSprintSelection'
import { buildAssigneeGroups } from './teamStats'

// Tasks grouped by assignee, with per-person load stats - variant controls
// both which subset of tasks counts (Agile scopes to the active sprint,
// Waterfall/Hybrid doesn't) and which stats apply, per the spec this was
// built from. Read-only, no editing here (that lives on the Backlog/Sprint
// Board/Task list rows themselves).
function TeamView({ title, variant, tasks, collaborators, project, sprints, selectedSprintId, expanded }) {
  const activeSprint = variant === 'agile' ? sprints?.find((s) => s.id === selectedSprintId) || null : null

  const todayStr = todayLocalDateString()

  // Grouping/stats/sorting all live in teamStats.js now (shared with
  // Overview's Team Hotspots panel) - what stays here is this view's own
  // active-sprint scoping, which Overview deliberately doesn't apply.
  const sortedGroups = useMemo(() => {
    const scoped = variant === 'agile' && activeSprint ? tasks.filter((t) => t.sprint_id === activeSprint.id) : tasks

    return buildAssigneeGroups(scoped, {
      variant,
      todayStr,
      resolveLabel: (task) => resolveAssigneeLabel(task, collaborators, project),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, collaborators, project, variant, activeSprint?.id, todayStr])

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
