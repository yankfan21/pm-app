import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { HEALTH_LABELS, formatEvalMetric } from '../projectEvalHealth'
import { getRiskBand } from '../riskScale'
import { getIssueStatusCounts } from '../issueLogUtils'

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

// Mirrors KeyMetricsDashboard.jsx's useCriticalIssues - same three checks
// (including the High/Critical-band risk filter), same methodology gate on
// overdue phases (Agile skips it).
function useCriticalIssues(project, tasks, phases, risks) {
  return useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const issues = []

    tasks
      .filter((t) => t.backlog_status == null && t.status === 'delayed')
      .forEach((t) => issues.push({ key: `task-${t.id}`, type: 'Delayed Task', label: t.title, id: t.id }))

    // `id` is r.id verbatim (not the key's index fallback below) - a risk
    // missing an id just can't be linked, see hotspotLinkTo().
    ;(risks || [])
      .filter((r) => ['High', 'Critical'].includes(getRiskBand(r.likelihood, r.severity)))
      .forEach((r, i) =>
        issues.push({
          key: `risk-${r.id ?? i}`,
          type: 'High Risk',
          label: r.risk || `Risk ${i + 1}`,
          id: r.id ?? null,
          band: getRiskBand(r.likelihood, r.severity),
        })
      )

    if (project.methodology !== 'agile') {
      const waterfallTasks = tasks.filter((t) => t.backlog_status == null)
      phases
        .filter((p) => isPhaseOverdue(p, waterfallTasks, todayStr))
        .forEach((p) => issues.push({ key: `phase-${p.id}`, type: 'Overdue Phase', label: p.phase_name, id: p.id }))
    }

    return issues
  }, [project.methodology, tasks, phases, risks])
}

const ISSUE_TAG_CLASS = {
  'Delayed Task': 'mobile-issue-tag-task',
  'High Risk': 'mobile-issue-tag-risk',
  'Overdue Phase': 'mobile-issue-tag-phase',
}

// Mirrors KeyMetricsDashboard.jsx's hotspotLinkTo, adapted to mobile's own
// routes (see MobileProjectLayout.jsx's route tree - no Planning/Phases
// screen exists on mobile at all, so Overdue Phase is deliberately never
// clickable here, not just when it's missing an id). Delayed Task goes
// straight to MobileTaskDetail (a real per-task page already) rather than
// the task list with a highlight - no scroll/highlight plumbing needed for
// that type. High Risk goes to the flagged-risks list with a riskId for
// scroll-to + highlight, same shape as desktop's riskId handling.
function hotspotLinkTo(issue, projectId) {
  if (issue.type === 'Delayed Task') return issue.id ? `/m/projects/${projectId}/tasks/${issue.id}` : null
  if (issue.type === 'High Risk') return issue.id ? `/m/projects/${projectId}/more/risks?riskId=${issue.id}` : null
  return null
}

const HEALTH_BADGE_CLASS = {
  on_track: 'mobile-health-on_track',
  at_risk: 'mobile-health-at_risk',
  off_track: 'mobile-health-off_track',
}

// Overview - project goal plus Key Metrics Dashboard content, read-only
// (/m/projects/:projectId, the single Overview destination - no separate
// /metrics route). Own fetch (project_evaluations, tasks, phases,
// risk_logs) rather than reusing desktop's KeyMetricsDashboard.jsx per the
// mobile purpose-built pattern - see MobileProjectLayout.jsx.
function MobileProjectMetrics() {
  const { project } = useOutletContext()
  const { projectId } = useParams()

  const [evaluation, setEvaluation] = useState(null)
  const [tasks, setTasks] = useState([])
  const [phases, setPhases] = useState([])
  const [risks, setRisks] = useState([])
  const [issueLogIssues, setIssueLogIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [evalRes, taskRes, phaseRes, riskRes, issueRes] = await Promise.all([
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
        supabase.from('issue_logs').select('issues').eq('project_id', projectId).maybeSingle(),
      ])

      if (cancelled) return

      const firstError = evalRes.error || taskRes.error || phaseRes.error || riskRes.error || issueRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setEvaluation(evalRes.data && evalRes.data.length > 0 ? evalRes.data[0] : null)
      setTasks(taskRes.data || [])
      setPhases(phaseRes.data || [])
      setRisks(riskRes.data?.risks || [])
      setIssueLogIssues(issueRes.data?.issues || [])
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId, project.methodology])

  const issues = useCriticalIssues(project, tasks, phases, risks)
  const { open: openIssueCount, closed: closedIssueCount } = getIssueStatusCounts(issueLogIssues)

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Overview</h1>
        <p className="mobile-screen-stub">Loading metrics...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="mobile-screen-title">Overview</h1>
        <p className="mobile-error">{error}</p>
      </div>
    )
  }

  const metricText = evaluation ? formatEvalMetric(evaluation.metrics, { longer: true }) : null

  return (
    <div>
      <h1 className="mobile-screen-title">Overview</h1>

      {project.goal && (
        <div className="mobile-metrics-card mobile-goal-card">
          <h2 className="mobile-section-title">Project Goal</h2>
          <p className="mobile-goal-text">{project.goal}</p>
        </div>
      )}

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
          Project Hotspots
          <span className={`mobile-issues-count ${issues.length > 0 ? 'has-issues' : ''}`}>
            {issues.length > 0 ? issues.length : 'All Clear'}
          </span>
        </h2>
        {issues.length === 0 ? (
          <p className="mobile-screen-stub">No hotspots right now.</p>
        ) : (
          <ul className="mobile-issue-list">
            {issues.map((issue) => {
              const to = hotspotLinkTo(issue, projectId)
              const content = (
                <>
                  <span className={`mobile-issue-tag ${ISSUE_TAG_CLASS[issue.type] || ''}`}>{issue.type}</span>
                  <span className="mobile-issue-label">{issue.label}</span>
                </>
              )
              return (
                <li key={issue.key} className="mobile-issue-row">
                  {to ? (
                    <Link to={to} className="mobile-issue-row-link">
                      {content}
                    </Link>
                  ) : (
                    <span className="mobile-issue-row-link">{content}</span>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {openIssueCount + closedIssueCount > 0 && (
          <div className="mobile-issue-summary-row">
            <span className="mobile-doc-badge critical">{openIssueCount} Open</span>
            <span className="mobile-doc-badge done">{closedIssueCount} Closed</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default MobileProjectMetrics
