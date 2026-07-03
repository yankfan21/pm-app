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
export function computeGanttLayout(tasks) {
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

  const todayMs = parseDay(todayLocalDateString())
  const todayInRange = bars.length > 0 && todayMs >= rangeStart && todayMs <= rangeEnd

  return { bars, unscheduled, rangeStart, rangeEnd, rangeEndRaw, totalSpan, todayMs, todayInRange }
}
