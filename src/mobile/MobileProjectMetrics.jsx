import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { HEALTH_LABELS, formatEvalMetric } from '../projectEvalHealth'

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Mirrors KeyMetricsDashboard.jsx's isPhaseOverdue - can't import it (not
// exported, and this task deliberately keeps mobile off the desktop Key
// Metrics component), so replicated here instead: end date passed while at
// least one Waterfall task linked to this phase is still incomplete.
function isPhaseOverdue(phase, waterfallTasks, todayStr) {
  if (!phase.effective_end_date || todayStr <= phase.effective_end_date) return false
  const linked = waterfallTasks.filter((t) => t.phase_id === phase.id)
  return linked.some((t) => !t.completed)
}

// Mirrors KeyMetricsDashboard.jsx's useCriticalIssues - same three checks,
// same methodology gate on overdue phases (Agile skips it).
function useCriticalIssues(project, tasks, phases, risks) {
  return useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const issues = []

    tasks
      .filter((t) => t.backlog_status == null && t.status === 'delayed')
      .forEach((t) => issues.push({ key: `task-${t.id}`, type: 'Delayed Task', label: t.title }))

    ;(risks || [])
      .filter((r) => r.impact === 'High')
      .forEach((r, i) => issues.push({ key: `risk-${r.id ?? i}`, type: 'High Risk', label: r.risk || `Risk ${i + 1}` }))

    if (project.methodology !== 'agile') {
      const waterfallTasks = tasks.filter((t) => t.backlog_status == null)
      phases
        .filter((p) => isPhaseOverdue(p, waterfallTasks, todayStr))
        .forEach((p) => issues.push({ key: `phase-${p.id}`, type: 'Overdue Phase', label: p.phase_name }))
    }

    return issues
  }, [project.methodology, tasks, phases, risks])
}

const ISSUE_TAG_CLASS = {
  'Delayed Task': 'mobile-issue-tag-task',
  'High Risk': 'mobile-issue-tag-risk',
  'Overdue Phase': 'mobile-issue-tag-phase',
}

const HEALTH_BADGE_CLASS = {
  on_track: 'mobile-health-on_track',
  at_risk: 'mobile-health-at_risk',
  off_track: 'mobile-health-off_track',
}

// Key Metrics Dashboard, read-only (/m/projects/:projectId/metrics). Own
// fetch (project_evaluations, tasks, phases, risk_logs) rather than reusing
// desktop's KeyMetricsDashboard.jsx per the mobile purpose-built pattern -
// see MobileProjectLayout.jsx.
function MobileProjectMetrics() {
  const { project } = useOutletContext()
  const { projectId } = useParams()

  const [evaluation, setEvaluation] = useState(null)
  const [tasks, setTasks] = useState([])
  const [phases, setPhases] = useState([])
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [evalRes, taskRes, phaseRes, riskRes] = await Promise.all([
        supabase
          .from('project_evaluations')
          .select('health_status, metrics, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('tasks').select('id, title, status, backlog_status, phase_id, completed').eq('project_id', projectId),
        project.methodology !== 'agile'
          ? supabase.from('phases').select('id, phase_name, effective_end_date').eq('project_id', projectId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('risk_logs').select('risks').eq('project_id', projectId).maybeSingle(),
      ])

      if (cancelled) return

      const firstError = evalRes.error || taskRes.error || phaseRes.error || riskRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setEvaluation(evalRes.data && evalRes.data.length > 0 ? evalRes.data[0] : null)
      setTasks(taskRes.data || [])
      setPhases(phaseRes.data || [])
      setRisks(riskRes.data?.risks || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId, project.methodology])

  const issues = useCriticalIssues(project, tasks, phases, risks)

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Metrics</h1>
        <p className="mobile-screen-stub">Loading metrics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="mobile-screen-title">Metrics</h1>
        <p className="mobile-error">{error}</p>
      </div>
    )
  }

  const metricText = evaluation ? formatEvalMetric(evaluation.metrics, { longer: true }) : null

  return (
    <div>
      <h1 className="mobile-screen-title">Metrics</h1>

      <div className="mobile-metrics-card">
        <h2 className="mobile-section-title">Project Status</h2>
        {evaluation ? (
          <>
            <span className={`mobile-health-badge ${HEALTH_BADGE_CLASS[evaluation.health_status] || ''}`}>
              {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
            </span>
            {metricText && <p className="mobile-metrics-progress">{metricText}</p>}
            <p className="mobile-metrics-asof">As of {formatDateTime(evaluation.created_at)}</p>
          </>
        ) : (
          <p className="mobile-screen-stub">
            Not evaluated yet — run Evaluate Project on desktop to see metrics here.
          </p>
        )}
      </div>

      <div className="mobile-metrics-card">
        <h2 className="mobile-section-title">
          Critical Issues
          <span className={`mobile-issues-count ${issues.length > 0 ? 'has-issues' : ''}`}>
            {issues.length > 0 ? issues.length : 'All Clear'}
          </span>
        </h2>
        {issues.length === 0 ? (
          <p className="mobile-screen-stub">No critical issues right now.</p>
        ) : (
          <ul className="mobile-issue-list">
            {issues.map((issue) => (
              <li key={issue.key} className="mobile-issue-row">
                <span className={`mobile-issue-tag ${ISSUE_TAG_CLASS[issue.type] || ''}`}>{issue.type}</span>
                <span className="mobile-issue-label">{issue.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export default MobileProjectMetrics
