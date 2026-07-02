import { Fragment, useLayoutEffect, useRef, useState } from 'react'

const DAY_MS = 24 * 60 * 60 * 1000

function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime()
}

// A task needs at least one date to appear on the timeline - if only one of
// start/due is set, it's plotted as a single-day bar on that date.
function GanttChart({ tasks }) {
  const chartRef = useRef(null)
  const barRefs = useRef({})
  const [depLines, setDepLines] = useState([])

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

  // Dependency lines are drawn from measured bar positions (not percentages)
  // because rows have gaps between them - a percentage-of-total-height
  // formula doesn't linearly map to "row center" once gaps are involved.
  // Re-measure whenever the bars change or the window resizes (the chart's
  // own horizontal scroll doesn't need a re-measure: the SVG overlay scrolls
  // together with the bars, so their relative offsets stay constant).
  useLayoutEffect(() => {
    function measure() {
      const container = chartRef.current
      if (!container) return

      const containerRect = container.getBoundingClientRect()
      const lines = []

      bars.forEach(({ task }) => {
        if (!task.depends_on) return
        const fromEl = barRefs.current[task.depends_on]
        const toEl = barRefs.current[task.id]
        if (!fromEl || !toEl) return

        const fromRect = fromEl.getBoundingClientRect()
        const toRect = toEl.getBoundingClientRect()

        lines.push({
          id: task.id,
          x1: fromRect.right - containerRect.left,
          y1: fromRect.top - containerRect.top + fromRect.height / 2,
          x2: toRect.left - containerRect.left,
          y2: toRect.top - containerRect.top + toRect.height / 2,
        })
      })

      setDepLines(lines)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks])

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
            ref={chartRef}
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
                      ref={(el) => {
                        barRefs.current[task.id] = el
                      }}
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

            {depLines.length > 0 && (
              <svg className="gantt-dep-overlay">
                <defs>
                  <marker
                    id="gantt-dep-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" className="gantt-dep-arrowhead" />
                  </marker>
                </defs>
                {depLines.map((line) => (
                  <line
                    key={line.id}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className="gantt-dep-line"
                    markerEnd="url(#gantt-dep-arrow)"
                  />
                ))}
              </svg>
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
