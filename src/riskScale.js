// Shared 5x5 Likelihood x Severity risk matrix - single source of truth for
// desktop (RiskLogView.jsx, KeyMetricsDashboard.jsx, riskLogExport.js) and
// mobile (MobileProjectRisks.jsx, MobileProjectMetrics.jsx). The Deno Edge
// Functions (risk-log/index.ts, project-eval/index.ts) can't import this -
// they're deployed separately from this Vite build - so they carry their
// own small duplicate of getRiskBand's threshold logic instead.

export const LIKELIHOOD_SCALE = [
  { value: 1, label: 'Rare' },
  { value: 2, label: 'Unlikely' },
  { value: 3, label: 'Possible' },
  { value: 4, label: 'Likely' },
  { value: 5, label: 'Almost Certain' },
]

export const SEVERITY_SCALE = [
  { value: 1, label: 'Negligible' },
  { value: 2, label: 'Minor' },
  { value: 3, label: 'Moderate' },
  { value: 4, label: 'Major' },
  { value: 5, label: 'Critical' },
]

export const RISK_BANDS = ['Low', 'Medium', 'High', 'Critical']

export function getRiskScore(likelihood, severity) {
  return likelihood && severity ? likelihood * severity : null
}

// 1-4 Low, 5-9 Medium, 10-14 High, 15-25 Critical. Returns null when either
// axis is unscored (mobile-created risks, pre-scoring migration rows).
export function getRiskBand(likelihood, severity) {
  const score = getRiskScore(likelihood, severity)
  if (score == null) return null
  if (score <= 4) return 'Low'
  if (score <= 9) return 'Medium'
  if (score <= 14) return 'High'
  return 'Critical'
}

export function scaleLabel(scale, value) {
  const entry = scale.find((s) => s.value === value)
  return entry ? `${entry.value} - ${entry.label}` : ''
}
