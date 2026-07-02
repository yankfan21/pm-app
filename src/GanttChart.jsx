import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { computeGanttLayout } from './ganttLayout'

function GanttChart({ project, tasks }) {
  const chartRef = useRef(null)
  const barRefs = useRef({})
  const [depLines, setDepLines] = useState([])
  const [error, setError] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const { bars, unscheduled, rangeStart, rangeEndRaw, totalSpan, todayInRange, todayMs } =
    computeGanttLayout(tasks)
  const todayPct = todayInRange ? ((todayMs - rangeStart) / totalSpan) * 100 : null

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

  async function handleExportExcel() {
    setError(null)
    try {
      // Lazy-loaded: exceljs is heavy and would otherwise bloat every page
      // load even for users who never export.
      const { exportGanttExcel } = await import('./ganttExport')
      await exportGanttExcel(project, tasks)
    } catch (err) {
      setError('Failed to export Excel: ' + err.message)
    }
  }

  async function handleExportPdf() {
    setError(null)
    setExportingPdf(true)
    try {
      // Lazy-loaded: jspdf is heavy and would otherwise bloat every page
      // load even for users who never export. Drawn natively rather than
      // screenshotting the DOM, so it isn't at the mercy of the live
      // page's theme/CSS (that's what caused the dark-mode text bug).
      const { exportGanttPdf } = await import('./ganttExport')
      await exportGanttPdf(project, tasks)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
    setExportingPdf(false)
  }

  return (
    <div className="gantt">
      <div className="section-header">
        <h2 className="charter-heading">Gantt Chart</h2>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={handleExportExcel}>
            Export Excel
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={bars.length === 0 || exportingPdf}
            onClick={handleExportPdf}
          >
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

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
