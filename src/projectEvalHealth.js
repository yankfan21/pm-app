// Single source of truth for health_status -> label/color, and for
// formatting the numeric metrics object project-eval now persists
// alongside it. Color is always derived from health_status - there is no
// separate threshold system for the metric numbers themselves.
export const HEALTH_LABELS = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  off_track: 'Off Track',
}

export const HEALTH_COLOR_CLASS = {
  on_track: 'done',
  at_risk: 'partial',
  off_track: 'critical',
}

function formatDayMonth(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// The velocity half of the metric text. Four distinct states, and the old
// single line collapsed the last three into silence:
//   - legacy snapshot (no velocity_sprint_* keys at all, written before
//     velocity moved onto the most-recent-COMPLETED sprint): keep the old
//     wording, since that figure's sprint was never recorded
//   - a completed sprint with points: percentage, named, dated
//   - a completed sprint with no story points: named, no percentage to give
//   - nothing qualifies: say so, rather than dropping the metric entirely
//     and leaving the card looking like velocity was never computed
function velocityPart(metrics, longer) {
  if (!('velocity_sprint_name' in metrics)) {
    if (metrics.velocity_ratio == null) return null
    const pct = Math.round(metrics.velocity_ratio * 100)
    return longer ? `${pct}% of committed sprint points completed` : `${pct}% velocity`
  }

  const name = metrics.velocity_sprint_name
  if (!name) {
    return longer ? 'No completed sprint yet to measure velocity from' : 'No completed sprint'
  }

  const when = metrics.velocity_sprint_completed_at
    ? `, completed ${formatDayMonth(metrics.velocity_sprint_completed_at)}`
    : ''

  if (metrics.velocity_ratio == null) {
    return longer ? `${name}${when} — no story-point estimates to measure velocity against` : `${name}, no points`
  }

  const pct = Math.round(metrics.velocity_ratio * 100)
  return longer ? `${pct}% of committed points completed in ${name}${when}` : `${pct}% velocity (${name})`
}

// Compact by default (dashboard card space is tight); pass longer: true
// for the fuller wording used on the Project Evaluation card itself.
export function formatEvalMetric(metrics, { longer = false } = {}) {
  if (!metrics) return null
  const parts = []

  if (metrics.milestone_pct_complete != null) {
    const pct = Math.round(metrics.milestone_pct_complete * 100)
    parts.push(longer ? `${pct}% of linked milestone work complete` : `${pct}% milestones`)
  }
  if (metrics.task_pct_complete != null) {
    const pct = Math.round(metrics.task_pct_complete * 100)
    parts.push(longer ? `${pct}% of tasks complete` : `${pct}% tasks`)
  }
  // Keyed off the velocity_ratio key existing at all, not its value - a
  // Waterfall metrics object has no velocity keys and must not pick up
  // velocity copy, while an Agile one with nothing qualifying has the key
  // present and explicitly null.
  if ('velocity_ratio' in metrics) {
    const velocity = velocityPart(metrics, longer)
    if (velocity) parts.push(velocity)
  }

  return parts.length > 0 ? parts.join(longer ? '; ' : ' | ') : null
}
