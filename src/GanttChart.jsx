import { Fragment } from 'react'

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

  const todayMs = parseDay(new Date().toISOString().slice(0, 10))
  const todayPct =
    bars.length > 0 && todayMs >= rangeStart && todayMs <= rangeEnd
      ? ((todayMs - rangeStart) / totalSpan) * 100
      : null

  // Grid rows are 1-indexed: row 1 is the date-range header, rows 2..N+1 are bars.
  const totalRows = bars.length + 1

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
          <div
            className="gantt-chart"
            style={{ gridTemplateRows: `repeat(${totalRows}, auto)` }}
          >
            <div
              className="gantt-row-label gantt-row-header"
              style={{ gridRow: 1, gridColumn: 1 }}
              aria-hidden="true"
            />
            <div
              className="gantt-row-track gantt-range-track gantt-row-header"
              style={{ gridRow: 1, gridColumn: 2 }}
            >
              <span>{new Date(rangeStart).toISOString().slice(0, 10)}</span>
              <span>{new Date(rangeEndRaw).toISOString().slice(0, 10)}</span>
            </div>

            {bars.map(({ task, startMs, dueMs }, i) => {
              const gridRow = i + 2
              const leftPct = ((startMs - rangeStart) / totalSpan) * 100
              const widthPct = Math.max(((dueMs - startMs) / totalSpan) * 100, 1.5)
              return (
                <Fragment key={task.id}>
                  <div
                    className="gantt-row-label"
                    style={{ gridRow, gridColumn: 1 }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                  <div className="gantt-row-track" style={{ gridRow, gridColumn: 2 }}>
                    <div
                      className={`gantt-bar ${task.completed ? 'completed' : ''}`}
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                      title={`${task.start_date || 'TBD'} → ${task.due_date || 'TBD'}`}
                    />
                  </div>
                </Fragment>
              )
            })}

            {todayPct != null && (
              <div
                className="gantt-today-col"
                style={{ gridRow: `1 / ${totalRows + 1}`, gridColumn: 2 }}
              >
                <div className="gantt-today-marker" style={{ left: `${todayPct}%` }}>
                  <span className="gantt-today-label">Today</span>
                </div>
              </div>
            )}
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
