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
  if (metrics.velocity_ratio != null) {
    const pct = Math.round(metrics.velocity_ratio * 100)
    parts.push(longer ? `${pct}% of committed sprint points completed` : `${pct}% velocity`)
  }

  return parts.length > 0 ? parts.join(longer ? '; ' : ' | ') : null
}
