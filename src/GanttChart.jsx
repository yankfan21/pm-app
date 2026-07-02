const DAY_MS = 24 * 60 * 60 * 1000

function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime()
}

// A task needs at least one date to appear on the timeline - if only one of
// start/due is set, it's plotted as a single-day bar on that date.
function GanttChart({ tasks }) {
  const scheduled = tasks.filter((t) => t.start_date || t.due_date)
  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date)

  const bars = scheduled.map((task) => {
    const start = task.start_date || task.due_date
    const due = task.due_date || task.start_date
    return { task, startMs: parseDay(start), dueMs: parseDay(due) }
  })

  const rangeStart = bars.length ? Math.min(...bars.map((b) => b.startMs)) : 0
  const rangeEndRaw = bars.length ? Math.max(...bars.map((b) => b.dueMs)) : 0
  // Guard against a zero-width range when every bar falls on the same day.
  const rangeEnd = rangeEndRaw > rangeStart ? rangeEndRaw : rangeStart + DAY_MS
  const totalSpan = rangeEnd - rangeStart

  return (
    <div className="gantt">
      <h2 className="tasks-heading">Gantt Chart</h2>

      {tasks.length === 0 && <p className="charter-status">No tasks yet.</p>}

      {tasks.length > 0 && bars.length === 0 && (
        <p className="charter-status">
          Add a start or due date to a task to see it on the timeline.
        </p>
      )}

      {bars.length > 0 && (
        <div className="gantt-wrap">
          <div className="gantt-chart">
            <div className="gantt-row gantt-row-header">
              <div className="gantt-row-label" aria-hidden="true" />
              <div className="gantt-row-track gantt-range-track">
                <span>{new Date(rangeStart).toISOString().slice(0, 10)}</span>
                <span>{new Date(rangeEndRaw).toISOString().slice(0, 10)}</span>
              </div>
            </div>

            {bars.map(({ task, startMs, dueMs }) => {
              const leftPct = ((startMs - rangeStart) / totalSpan) * 100
              const widthPct = Math.max(((dueMs - startMs) / totalSpan) * 100, 1.5)
              return (
                <div className="gantt-row" key={task.id}>
                  <div className="gantt-row-label" title={task.title}>
                    {task.title}
                  </div>
                  <div className="gantt-row-track">
                    <div
                      className={`gantt-bar ${task.completed ? 'completed' : ''}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`${task.start_date || 'TBD'} → ${task.due_date || 'TBD'}`}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="gantt-unscheduled">
          <p className="gantt-unscheduled-label">Unscheduled</p>
          <ul className="gantt-unscheduled-list">
            {unscheduled.map((task) => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                {task.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default GanttChart
