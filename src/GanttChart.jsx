import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { DAY_MS, buildElbowPoints, computeCriticalPath, computeGanttLayout, parseDay } from './ganttLayout'
import { resolveAssigneeLabel } from './components/AssigneePicker'

const UNPHASED_KEY = '__unphased'

const TASK_STATUS_FILTER_OPTIONS = [
  { key: 'not_started', label: 'Not Started' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'delayed', label: 'Delayed' },
]

// Pixels-per-day the track column renders at for each zoom level, widest
// (Day) to narrowest (Quarter). Replaces the track's normal 1fr sizing
// (auto-fit to the container) with a fixed pixel width once a zoom level is
// picked - gantt-wrap's existing overflow-x: auto (see App.css) is what
// turns that into horizontal scrolling at the finer levels instead of
// squeezing every bar into the viewport width. 'week' is the default since
// it's the closest fixed approximation to how the chart already read before
// zoom existed.
const ZOOM_LEVELS = [
  { key: 'day', label: 'Day', pxPerDay: 36 },
  { key: 'week', label: 'Week', pxPerDay: 12 },
  { key: 'month', label: 'Month', pxPerDay: 4 },
  { key: 'quarter', label: 'Quarter', pxPerDay: 1.3 },
]

// Stable key for a distinct assignee across both kinds (a real collaborator
// by user_id, or a free-text name) - used both to dedupe the filter's option
// list and to match tasks against the selected filter value. Two different
// tasks with the same free-text assignee_name are treated as the same
// assignee for filtering purposes (spreadsheets/AI-gen have no id to key a
// one-off name by), same simplification TaskImportFlow's email match makes.
function assigneeKey(task) {
  if (task.assignee_user_id) return `user:${task.assignee_user_id}`
  if (task.assignee_name) return `name:${task.assignee_name}`
  return null
}

// Flattens task bars into a list of rows - a header row per phase (sorted
// by phase_number) followed by that phase's task rows when it isn't
// collapsed, plus a trailing "Tasks Without a Phase" group for any bar whose task.phase_id
// doesn't match a phase on this project (null, or a stale id). When the
// project has no phases at all (not yet backfilled, or somehow deleted),
// this falls back to the flat, ungrouped list Gantt always rendered before
// phases existed - grouping is purely additive.
function buildPhaseRows(bars, phases, collapsed) {
  if (!phases || phases.length === 0) {
    return bars.map((bar) => ({ type: 'task', ...bar }))
  }

  const byPhaseId = new Map(phases.map((p) => [p.id, []]))
  const unphased = []

  bars.forEach((bar) => {
    const group = bar.task.phase_id && byPhaseId.get(bar.task.phase_id)
    if (group) group.push(bar)
    else unphased.push(bar)
  })

  const rows = []
  ;[...phases]
    .sort((a, b) => a.phase_number - b.phase_number)
    .forEach((phase) => {
      const phaseBars = byPhaseId.get(phase.id)
      rows.push({ type: 'phase-header', phase, key: phase.id, count: phaseBars.length })
      if (!collapsed[phase.id]) phaseBars.forEach((bar) => rows.push({ type: 'task', ...bar }))
    })

  if (unphased.length > 0) {
    rows.push({ type: 'phase-header', phase: null, key: UNPHASED_KEY, count: unphased.length })
    if (!collapsed[UNPHASED_KEY]) unphased.forEach((bar) => rows.push({ type: 'task', ...bar }))
  }

  return rows
}

// Left/width percentage for a phase's own range band, same math as a task
// bar - null when the phase has no effective date on either end yet (never
// scheduled and never given a Custom date).
function phaseRangePct(phase, rangeStart, totalSpan) {
  if (!phase || (!phase.effective_start_date && !phase.effective_end_date)) return null
  const start = phase.effective_start_date || phase.effective_end_date
  const end = phase.effective_end_date || phase.effective_start_date
  const startMs = parseDay(start)
  const dueMs = parseDay(end)
  return {
    leftPct: ((startMs - rangeStart) / totalSpan) * 100,
    widthPct: Math.max(((dueMs - startMs) / totalSpan) * 100, 1.5),
  }
}

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

// Thin SVG-path wrapper around the shared elbow geometry - see
// buildElbowPoints in ganttLayout.js (also used by the PDF export).
function buildElbowPath(x1, y1, x2, y2) {
  const midX = buildElbowPoints(x1, y1, x2, y2)[1][0]
  return `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`
}

function GanttChart({ project, tasks, taskDependencies, phases, milestones = [], collaborators = [], expanded, onToggle }) {
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
  // Off by default - an opt-in overlay, same pattern as collapsedPhases.
  const [showCriticalPath, setShowCriticalPath] = useState(false)
  // Every phase group starts expanded - collapsing is opt-in per phase, so
  // a fresh page load always shows the full picture first.
  const [collapsedPhases, setCollapsedPhases] = useState({})
  const [zoom, setZoom] = useState('week')
  // '' means "All" for every filter below - never null/undefined, so a
  // <select>'s controlled value always matches one of its own options.
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterTaskType, setFilterTaskType] = useState('')
  const [filterEpic, setFilterEpic] = useState('')

  function togglePhaseCollapse(key) {
    setCollapsedPhases((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Option lists are built from the full, unfiltered task set (not
  // filteredTasks below) so picking one filter never prunes another filter's
  // own choices out from under the PM - e.g. narrowing to "Delayed" doesn't
  // shrink the Assignee dropdown to only delayed tasks' assignees.
  const assigneeFilterOptions = []
  const seenAssigneeKeys = new Set()
  tasks.forEach((task) => {
    const key = assigneeKey(task)
    if (!key || seenAssigneeKeys.has(key)) return
    seenAssigneeKeys.add(key)
    assigneeFilterOptions.push({ key, label: resolveAssigneeLabel(task, collaborators) })
  })
  assigneeFilterOptions.sort((a, b) => a.label.localeCompare(b.label))

  const hasActiveFilters = !!(filterAssignee || filterStatus || filterTaskType || filterEpic)
  // Epics (tasks.milestone_id / the milestones table) are a Backlog concept
  // - Waterfall projects never set milestone_id on a task at all (see
  // BacklogView.jsx's isHybrid gate on the Epic create/select UI), so the
  // filter would just be an always-"All" dropdown with nothing to pick.
  // GanttChart is currently only ever mounted for non-agile projects (see
  // ProjectDetail.jsx), but this checks the real methodology values rather
  // than assuming that stays true, so it degrades correctly if that call
  // site ever changes.
  const showEpicFilter = project.methodology === 'agile' || project.methodology === 'hybrid'

  function taskMatchesFilters(task) {
    if (filterStatus && (task.status ?? 'not_started') !== filterStatus) return false
    if (filterTaskType && task.task_type !== filterTaskType) return false

    if (filterEpic === 'none') {
      if (task.milestone_id) return false
    } else if (filterEpic && task.milestone_id !== filterEpic) {
      return false
    }

    if (filterAssignee === 'unassigned') {
      if (assigneeKey(task)) return false
    } else if (filterAssignee && assigneeKey(task) !== filterAssignee) {
      return false
    }

    return true
  }

  const filteredTasks = hasActiveFilters ? tasks.filter(taskMatchesFilters) : tasks

  const { bars, unscheduled, rangeStart, rangeEndRaw, totalSpan, todayInRange, todayMs } =
    computeGanttLayout(filteredTasks, project, phases)

  const totalDays = Math.max(1, Math.round(totalSpan / DAY_MS))
  const zoomLevel = ZOOM_LEVELS.find((z) => z.key === zoom) || ZOOM_LEVELS[1]
  // Floored so a very short/empty range never collapses the track to a
  // sliver at the narrow zoom levels (e.g. a 2-day project at Quarter zoom).
  const trackPxWidth = Math.max(Math.round(totalDays * zoomLevel.pxPerDay), 240)

  // Only computed while the toggle is on - cheap either way at this scale,
  // but no reason to run it when nothing reads the result.
  const criticalPath = showCriticalPath ? computeCriticalPath(bars, taskDependencies) : null

  // Grouped rather than a scalar Map, since Phase 3's multi-select picker
  // means a task can have 2+ rows in task_dependencies.
  const dependsOnByTaskId = new Map()
  for (const d of taskDependencies || []) {
    const existing = dependsOnByTaskId.get(d.task_id)
    if (existing) existing.push(d.depends_on_id)
    else dependsOnByTaskId.set(d.task_id, [d.depends_on_id])
  }
  const todayPct = todayInRange ? ((todayMs - rangeStart) / totalSpan) * 100 : null
  const dateTicks = bars.length > 0 ? computeDateTicks(rangeStart, rangeEndRaw, trackWidth) : []
  const rows = bars.length > 0 ? buildPhaseRows(bars, phases, collapsedPhases) : []

  // Grid rows are 1-indexed: row 1 is the date-range header, rows 2..N+1 are
  // either a phase header or a task bar.
  const totalRows = rows.length + 1

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
        const dependsOnIds = dependsOnByTaskId.get(task.id)
        if (!dependsOnIds || dependsOnIds.length === 0) return
        const toEl = barRefs.current[task.id]
        if (!toEl) return
        const toRect = toEl.getBoundingClientRect()
        // 2+ predecessors: dash every line for this task, not just the
        // extras, so a multi-predecessor task reads as distinct at a glance.
        const dashed = dependsOnIds.length > 1

        dependsOnIds.forEach((dependsOnId) => {
          const fromEl = barRefs.current[dependsOnId]
          if (!fromEl) return
          const fromRect = fromEl.getBoundingClientRect()

          lines.push({
            id: `${dependsOnId}-${task.id}`,
            x1: fromRect.right - containerRect.left,
            y1: fromRect.top - containerRect.top + fromRect.height / 2,
            x2: toRect.left - containerRect.left,
            y2: toRect.top - containerRect.top + toRect.height / 2,
            dashed,
          })
        })
      })

      setDepLines(lines)
    }

    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, taskDependencies, expanded, collapsedPhases, zoom, filterAssignee, filterStatus, filterTaskType, filterEpic])

  async function handleExportExcel() {
    setError(null)
    try {
      // Lazy-loaded: exceljs is heavy and would otherwise bloat every page
      // load even for users who never export.
      const { exportGanttExcel } = await import('./ganttExport')
      await exportGanttExcel(project, tasks, dependsOnByTaskId)
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
      await exportGanttPdf(project, tasks, dependsOnByTaskId, taskDependencies)
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
          <label className="gantt-critical-toggle">
            <input
              type="checkbox"
              checked={showCriticalPath}
              disabled={bars.length === 0}
              onChange={(e) => setShowCriticalPath(e.target.checked)}
            />
            Show Critical Path
          </label>
          <div className="gantt-zoom-control" role="group" aria-label="Zoom level">
            {ZOOM_LEVELS.map((z) => (
              <button
                key={z.key}
                type="button"
                className={`gantt-zoom-btn ${zoom === z.key ? 'active' : ''}`}
                aria-pressed={zoom === z.key}
                onClick={() => setZoom(z.key)}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {expanded && tasks.length > 0 && (
        <div className="gantt-filters">
          <label className="task-select-field">
            Assignee
            <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {assigneeFilterOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="task-select-field">
            Status
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {TASK_STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="task-select-field">
            Type
            <select value={filterTaskType} onChange={(e) => setFilterTaskType(e.target.value)}>
              <option value="">All</option>
              <option value="task">Task</option>
              <option value="milestone_marker">Milestone</option>
            </select>
          </label>
          {showEpicFilter && (
            <label className="task-select-field">
              Epic
              <select value={filterEpic} onChange={(e) => setFilterEpic(e.target.value)}>
                <option value="">All</option>
                <option value="none">No Epic</option>
                {milestones.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-secondary gantt-filters-clear"
              onClick={() => {
                setFilterAssignee('')
                setFilterStatus('')
                setFilterTaskType('')
                setFilterEpic('')
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {expanded && error && <p className="error">{error}</p>}

      {expanded && tasks.length === 0 && <p className="charter-status">No tasks yet.</p>}

      {expanded && tasks.length > 0 && hasActiveFilters && filteredTasks.length === 0 && (
        <p className="charter-status">No tasks match the current filters.</p>
      )}

      {expanded && filteredTasks.length > 0 && bars.length === 0 && (
        <p className="charter-status">
          Add a start or due date to a task to see it on the timeline.
        </p>
      )}

      {expanded && todayInRange && (
        <p className="gantt-today-note">Today — {formatLongDate(todayMs)}</p>
      )}

      {expanded && criticalPath && !criticalPath.hasEdges && (
        <p className="charter-status">
          No task dependencies yet — critical path needs at least one dependency to compute a path.
        </p>
      )}

      {expanded && criticalPath && criticalPath.hasEdges && (
        <p className="gantt-critical-summary">
          Critical path: {criticalPath.taskCount} task{criticalPath.taskCount === 1 ? '' : 's'} · {criticalPath.totalDays} day{criticalPath.totalDays === 1 ? '' : 's'}
        </p>
      )}

      {expanded && bars.length > 0 && (
        <div className="gantt-wrap">
          <div
            className="gantt-chart"
            ref={chartRef}
            style={{
              gridTemplateRows: `repeat(${totalRows}, auto)`,
              gridTemplateColumns: `minmax(140px, 240px) ${trackPxWidth}px`,
            }}
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

            {rows.map((row, i) => {
              const gridRow = i + 2

              if (row.type === 'phase-header') {
                const { phase, key, count } = row
                const collapsed = !!collapsedPhases[key]
                const band = phaseRangePct(phase, rangeStart, totalSpan)
                return (
                  <Fragment key={key}>
                    <div
                      className="gantt-row-label gantt-phase-row-label"
                      style={{ gridRow, gridColumn: 1 }}
                    >
                      <button
                        type="button"
                        className="gantt-phase-toggle"
                        onClick={() => togglePhaseCollapse(key)}
                        aria-expanded={!collapsed}
                      >
                        <span className={`chevron ${collapsed ? 'collapsed' : ''}`} aria-hidden="true">
                          ▾
                        </span>
                        {phase ? `${phase.phase_name} Phase` : 'Tasks Without a Phase'}
                      </button>
                      <span className="gantt-phase-meta">
                        {count} task{count === 1 ? '' : 's'}
                        {phase && (
                          <>
                            {' · '}
                            <span className={`gantt-phase-mode-badge ${phase.is_custom_mode ? 'custom' : 'auto'}`}>
                              {phase.is_custom_mode ? 'Custom' : 'Auto'}
                            </span>
                            {' · '}
                            {phase.effective_start_date || 'TBD'} → {phase.effective_end_date || 'TBD'}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="gantt-row-track gantt-phase-track" style={{ gridRow, gridColumn: 2 }}>
                      {band && (
                        <div
                          className="gantt-phase-band"
                          style={{ left: `${band.leftPct}%`, width: `${band.widthPct}%` }}
                        />
                      )}
                    </div>
                  </Fragment>
                )
              }

              const { task, startMs, dueMs } = row
              const leftPct = ((startMs - rangeStart) / totalSpan) * 100
              const widthPct = Math.max(((dueMs - startMs) / totalSpan) * 100, 1.5)
              const singleDate = !(task.start_date && task.due_date)
              const isMilestone = task.task_type === 'milestone_marker'
              const isDelayed = task.status === 'delayed'
              const isCritical = !!criticalPath?.taskIds.has(task.id)
              const assigneeLabel = resolveAssigneeLabel(task, collaborators)
              const assigneeSuffix = assigneeLabel ? ` · ${assigneeLabel}` : ''
              return (
                <Fragment key={task.id}>
                  <div
                    className="gantt-row-label"
                    style={{ gridRow, gridColumn: 1 }}
                    title={task.title}
                  >
                    {task.title}
                    {assigneeLabel && <span className="gantt-row-assignee">{assigneeLabel}</span>}
                  </div>
                  <div className="gantt-row-track" style={{ gridRow, gridColumn: 2 }}>
                    {isMilestone ? (
                      <>
                        <div
                          ref={(el) => {
                            barRefs.current[task.id] = el
                          }}
                          className={`gantt-milestone ${isDelayed ? 'delayed' : ''} ${task.completed ? 'completed' : ''} ${isCritical ? 'critical-path' : ''}`}
                          style={{ left: `${leftPct}%` }}
                          title={`${task.title} — ${task.due_date || 'TBD'}${assigneeSuffix}`}
                        />
                        <span className="gantt-milestone-label" style={{ left: `${leftPct}%` }}>
                          {task.title}
                        </span>
                      </>
                    ) : (
                      <div
                        ref={(el) => {
                          barRefs.current[task.id] = el
                        }}
                        className={`gantt-bar ${singleDate ? 'single-date' : ''} ${isDelayed ? 'delayed' : ''} ${task.completed ? 'completed' : ''} ${isCritical ? 'critical-path' : ''}`}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        title={`${task.start_date || 'TBD'} → ${task.due_date || 'TBD'}${assigneeSuffix}`}
                      />
                    )}
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
                  <marker
                    id="gantt-dep-arrow-critical"
                    markerWidth="8"
                    markerHeight="8"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M0,0 L6,3 L0,6 Z" className="gantt-dep-arrowhead-critical" />
                  </marker>
                </defs>
                {depLines.map((line) => {
                  const isCriticalEdge = !!criticalPath?.edgeIds.has(line.id)
                  return (
                    <path
                      key={line.id}
                      d={buildElbowPath(line.x1, line.y1, line.x2, line.y2)}
                      className={[
                        'gantt-dep-line',
                        line.dashed ? 'gantt-dep-line-dashed' : '',
                        isCriticalEdge ? 'gantt-dep-line-critical' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      markerEnd={isCriticalEdge ? 'url(#gantt-dep-arrow-critical)' : 'url(#gantt-dep-arrow)'}
                    />
                  )
                })}
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
            <span className="gantt-legend-swatch diamond" />
            Milestone
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar delayed" />
            Delayed
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar completed" />
            Completed
          </span>
          <span className="gantt-legend-item">
            <span className="gantt-legend-swatch bar critical-path" />
            Critical path
          </span>
          <span className="gantt-legend-item">
            <svg className="gantt-legend-arrow" viewBox="0 0 20 12" width="20" height="12" aria-hidden="true">
              <path d="M0,3 H10 V9 H14" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
              <path d="M14,6 L20,9 L14,12 Z" fill="#94a3b8" />
            </svg>
            Dependency
          </span>
          <span className="gantt-legend-item">
            <svg className="gantt-legend-arrow" viewBox="0 0 20 12" width="20" height="12" aria-hidden="true">
              <path d="M0,3 H10 V9 H14" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="3 2" />
              <path d="M14,6 L20,9 L14,12 Z" fill="#94a3b8" />
            </svg>
            Multiple predecessors
          </span>
          <span className="gantt-legend-item">
            <svg className="gantt-legend-arrow" viewBox="0 0 20 12" width="20" height="12" aria-hidden="true">
              <path d="M0,3 H10 V9 H14" fill="none" stroke="#f97316" strokeWidth="2.5" />
              <path d="M14,6 L20,9 L14,12 Z" fill="#f97316" />
            </svg>
            Critical path dependency
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
