// Project timeline: solid up to Today, dotted after, a diamond per milestone
// (filled once its date has passed, outline while upcoming) and a ring at the
// target go-live. Dates only: milestones carry no done/late state, so none is
// implied. Renders nothing without a start and an end to place Today between.
function toDay(value) {
  if (!value) return null
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

function CourseLine({ start, end, milestones = [], now = Date.now() }) {
  const startMs = toDay(start)
  const endMs = toDay(end)
  if (startMs == null || endMs == null || endMs <= startMs) return null

  const span = endMs - startMs
  const pct = (ms) => Math.min(100, Math.max(0, ((ms - startMs) / span) * 100))
  const today = toDay(new Date(now).toISOString())
  const todayPct = pct(today)
  const overdue = today > endMs

  const marks = milestones
    .map((m) => ({ id: m.id, name: m.name, ms: toDay(m.end_date || m.start_date) }))
    .filter((m) => m.ms != null)

  return (
    <div
      className={`course-line${overdue ? ' overdue' : ''}`}
      role="img"
      aria-label={overdue ? 'Past the target go-live date' : `${Math.round(todayPct)}% of the way to go-live`}
    >
      <span className="course-line-solid" style={{ width: `${todayPct}%` }} />
      <span className="course-line-dots" style={{ left: `${todayPct}%` }} />
      {marks.map((m) => (
        <span
          key={m.id}
          className={`course-line-ms${m.ms <= today ? ' passed' : ''}`}
          style={{ left: `${pct(m.ms)}%` }}
          title={m.name}
        />
      ))}
      <span className="course-line-today" style={{ left: `${todayPct}%` }} />
      <span className="course-line-golive" />
    </div>
  )
}

export default CourseLine
