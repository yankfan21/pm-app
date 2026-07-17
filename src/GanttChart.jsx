import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { DAY_MS, computeGanttLayout } from './ganttLayout'

// Never coarser than weekly, finer for shorter ranges - capped so a long
// project doesn't end up with an unreadable wall of tick labels either.
function pickTickIntervalDays(totalDays) {
  const candidates = [1, 2, 3, 5, 7]
  return candidates.find((c) => totalDays / c <= 15) || 7
}

// A "MM-DD" label needs about this many pixels to itself before it starts
// touching its neighbor at the chart's 11px tick font size.
const TICK_LABEL_WIDTH_PX = 34

// Ticks start at the weekly-or-finer interval, then widen just enough (in
// whole days, not forced to a round multiple like 7/14/21 - rounding a
// barely-too-tight weekly interval up to the next multiple overshoots to
// double the spacing for almost no reason) to keep labels from overlapping
// at the *actual measured* track width. A percentage-of-range guess isn't
// reliable here since a fixed-width label doesn't scale with the range,
// only the available pixels do.
function computeDateTicks(rangeStart, rangeEndRaw, trackWidth) {
  const totalSpan = rangeEndRaw - rangeStart || DAY_MS
  const totalDays = Math.round(totalSpan / DAY_MS)
  const baseTickDays = pickTickIntervalDays(totalDays || 1)

  const pxPerDay = trackWidth / (totalDays || 1)
  const minStepDays = TICK_LABEL_WIDTH_PX / Math.max(pxPerDay, 0.01)
  const tickDays = Math.max(baseTickDays, Math.ceil(minStepDays))

  const ticks = []
  for (let d = 0; d <= totalDays; d += tickDays) ticks.push(rangeStart + d * DAY_MS)

  const last = ticks[ticks.length - 1]
  if (last !== rangeEndRaw) {
    const lastPx = ((last - rangeStart) / totalSpan) * trackWidth
    if (trackWidth - lastPx < TICK_LABEL_WIDTH_PX) {
      ticks[ticks.length - 1] = rangeEndRaw
    } else {
      ticks.push(rangeEndRaw)
    }
  }
  return ticks
}

function formatTick(ms) {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}`
}

function formatLongDate(ms) {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// Right-angle (horizontal-vertical-horizontal) connector between a
// predecessor bar's end and a successor bar's start, instead of a diagonal
// line straight between the two points. Elbows at the midpoint of the two
// x-coordinates when there's enough horizontal room; otherwise kicks out a
// fixed distance so the path still reads as three clean segments even when
// the successor starts at or before the predecessor's end.
function buildElbowPath(x1, y1, x2, y2) {
  const minKick = 14
  const dx = x2 - x1
  const midX = dx >= minKick * 2 ? x1 + dx / 2 : x1 + minKick
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

function GanttChart({ project, tasks, expanded, onToggle }) {
  const chartRef = useRef(null)
  const trackRef = useRef(null)
  const barRefs = useRef({})
  const [depLines, setDepLines] = useState([])
  // Conservative fallback for the first paint, before the real track width
  // is measured - deliberately on the narrow side so an early render never
  // shows crowded ticks (see the layout effect below).
  const [trackWidth, setTrackWidth] = useState(400)
  const [error, setError] = useState(null)
  const [exportingPdf, setExportingPdf] = useState(false)

  const { bars, unscheduled, rangeStart, rangeEndRaw, totalSpan, todayInRange, todayMs } =
    computeGanttLayout(tasks, project)
  const todayPct = todayInRange ? ((todayMs - rangeStart) / totalSpan) * 100 : null
  const dateTicks = bars.length > 0 ? computeDateTicks(rangeStart, rangeEndRaw, trackWidth) : []

  // Grid rows are 1-indexed: row 1 is the date-range header, rows 2..N+1 are bars.
  const totalRows = bars.length + 1

  // Dependency lines are drawn from measured bar positions (not percentages)
  // because rows have gaps between them - a percentage-of-total-height
  // formula doesn't linearly map to "row center" once gaps are involved.
  // Re-measure whenever the bars change, the window resizes, or the section
  // expands (refs are null while collapsed, since the chart isn't mounted;
  // expanding needs a fresh measurement rather than relying on stale state
  // from before it was hidden). The chart's own horizontal scroll doesn't
  // need a re-measure: the SVG overlay scrolls together with the bars, so
  // their relative offsets stay constant.
  useLayoutEffect(() => {
    function measure() {
      const container = chartRef.current
      if (!container) return

      if (trackRef.current) {
        setTrackWidth(trackRef.current.getBoundingClientRect().width)
      }

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
  }, [tasks, expanded])

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
      <h2 className="tasks-heading">
        <button
          type="button"
          className="collapsible-toggle toggle-header-with-badge"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span className="toggle-header-main">
            <span className={`chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
              ▾
            </span>
            <span className={`status-dot ${bars.length > 0 ? 'done' : 'pending'}`} aria-hidden="true" />
            Gantt Chart
          </span>
          <span className={`doc-status-badge ${bars.length > 0 ? 'done' : 'pending'}`}>
            {bars.length > 0 ? 'Generated' : 'Not started'}
          </span>
        </button>
      </h2>

      {expanded && (
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
      )}

      {expanded && error && <p className="error">{error}</p>}

      {expanded && tasks.length === 0 && <p className="charter-status">No tasks yet.</p>}

      {expanded && tasks.length > 0 && bars.length === 0 && (
        <p className="charter-status">
          Add a start or due date to a task to see it on the timeline.
        </p>
      )}

      {expanded && todayInRange && (
        <p className="gantt-today-note">Today — {formatLongDate(todayMs)}</p>
      )}

      {expanded && bars.length > 0 && (
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
              ref={trackRef}
              className="gantt-row-track gantt-range-track gantt-row-header"
              style={{ gridRow: 1, gridColumn: 2 }}
            >
              {dateTicks.map((tickMs) => (
                <span
                  key={tickMs}
                  className="gantt-tick-label"
                  style={{ left: `${((tickMs - rangeStart) / totalSpan) * 100}%` }}
                >
                  {formatTick(tickMs)}
                </span>
              ))}
            </div>

            <div
              className="gantt-gridlines"
              style={{ gridRow: `1 / ${totalRows + 1}`, gridColumn: 2 }}
              aria-hidden="true"
            >
              {dateTicks.map((tickMs) => (
                <div
                  key={tickMs}
                  className="gantt-gridline"
                  style={{ left: `${((tickMs - rangeStart) / totalSpan) * 100}%` }}
                />
              ))}
            </div>

            {bars.map(({ task, startMs, dueMs }, i) => {
              const gridRow = i + 2
              const leftPct = ((startMs - rangeStart) / totalSpan) * 100
              const widthPct = Math.max(((dueMs - startMs) / totalSpan) * 100, 1.5)
              const singleDate = !(task.start_date && task.due_date)
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
                      className={`gantt-bar ${singleDate ? 'single-date' : ''} ${task.completed ? 'completed' : ''}`}
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
                <div
                  className="gantt-today-marker"
                  style={{ left: `${todayPct}%` }}
                  title={`Today — ${formatLongDate(todayMs)}`}
                />
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
                  <path
                    key={line.id}
                    d={buildElbowPath(line.x1, line.y1, line.x2, line.y2)}
                    className="gantt-dep-line"
                    markerEnd="url(#gantt-dep-arrow)"
                  />
                ))}
              </svg>
            )}
          </div>
        </div>
      )}

      {expanded && bars.length > 0 && (
        <div className="gantt-legend">
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar" />
            Task (start–due)
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar single-date" />
            Single date only
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar completed" />
            Completed
          </span>
          <span className="gantt-legend-item">
            <svg className="gantt-legend-arrow" viewBox="0 0 20 12" width="20" height="12" aria-hidden="true">
              <path d="M0,3 H10 V9 H14" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
              <path d="M14,6 L20,9 L14,12 Z" fill="#94a3b8" />
            </svg>
            Dependency
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch today-line" />
            Today
          </span>
        </div>
      )}

      {expanded && unscheduled.length > 0 && (
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
