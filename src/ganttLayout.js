// Shared task-to-timeline computation used by both the live chart
// (GanttChart.jsx) and the PDF export (ganttExport.js) so the two never
// drift out of sync with each other.

export const DAY_MS = 24 * 60 * 60 * 1000

export function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime()
}

// "What day is it right now" has to be read via local getters, not
// toISOString() (which reports the UTC calendar date). Those two disagree
// whenever the viewer is far enough from UTC that the date has already
// rolled over in one but not the other - e.g. anyone west of UTC in the
// evening sees toISOString() report tomorrow, since UTC has already
// crossed midnight while it's still "today" locally.
function todayLocalDateString() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// A task needs at least one date to appear on the timeline - if only one of
// start/due is set, it's plotted as a single-day bar on that date.
//
// `project` is optional (defaults to treating it as active) - the Today
// marker is only relevant to work that's still ongoing, so it's included in
// the visible range for active projects, but left out for archived ones.
// Forcing it into an archived project's range would stretch the chart to
// span the gap between whenever the (already-finished) work happened and
// today, compressing the actual task bars into an unreadable sliver.
export function computeGanttLayout(tasks, project) {
  const isArchived = project?.status === 'Archived'

  const scheduled = tasks.filter((t) => t.start_date || t.due_date)
  const unscheduled = tasks.filter((t) => !t.start_date && !t.due_date)

  const bars = scheduled.map((task) => {
    const start = task.start_date || task.due_date
    const due = task.due_date || task.start_date
    return { task, startMs: parseDay(start), dueMs: parseDay(due) }
  })

  const todayMs = parseDay(todayLocalDateString())

  const taskRangeStart = bars.length ? Math.min(...bars.map((b) => b.startMs)) : 0
  const taskRangeEndRaw = bars.length ? Math.max(...bars.map((b) => b.dueMs)) : 0

  // For active projects, the visible range always widens to include today
  // (whenever there's a chart to show at all) so the Today marker is a
  // reliable, always-present reference point - not just something that
  // shows up if it happens to fall within whatever the task dates already
  // span. A project that hasn't started yet, or one that's long since
  // wrapped up, still gets a marker showing where "now" sits relative to
  // its plan. Archived projects skip this widening - see comment above.
  const includeToday = bars.length > 0 && !isArchived
  const rangeStart = bars.length ? Math.min(taskRangeStart, includeToday ? todayMs : taskRangeStart) : 0
  const rangeEndRaw = bars.length ? Math.max(taskRangeEndRaw, includeToday ? todayMs : taskRangeEndRaw) : 0
  // Guard against a zero-width range when every bar (and today) falls on
  // the same day.
  const rangeEnd = rangeEndRaw > rangeStart ? rangeEndRaw : rangeStart + DAY_MS
  const totalSpan = rangeEnd - rangeStart

  const todayInRange = bars.length > 0 && todayMs >= rangeStart && todayMs <= rangeEnd

  return { bars, unscheduled, rangeStart, rangeEnd, rangeEndRaw, totalSpan, todayMs, todayInRange }
}
