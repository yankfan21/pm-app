import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { HEALTH_LABELS, formatEvalMetric } from '../projectEvalHealth'
import { getRiskBand } from '../riskScale'
import { getIssueStatusCounts } from '../issueLogUtils'
import { getEasternTodayStr, isTaskDelayed } from '../taskUtils'
import { isSprintOverdue } from '../sprintStats'

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
// overdue phases (Agile skips it). Delayed Task now goes through the same
// shared isTaskDelayed (taskUtils.js) desktop uses - manual PM flag
// (status === 'delayed') OR 5+ days past due and not yet Completed - so
// mobile's badge count can't drift from what desktop shows for the same
// project.
function useCriticalIssues(project, tasks, phases, risks) {
  return useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayEasternStr = getEasternTodayStr()
    const issues = []

    tasks
      .filter((t) => t.backlog_status == null && isTaskDelayed(t, todayEasternStr))
      .forEach((t) => issues.push({ key: `task-${t.id}`, type: 'Delayed Task', label: t.title, id: t.id }))

    // `id`/`label`/`band` aren't read by the badge-group cards below
    // (they only need the `type` count, same as desktop's
    // KeyMetricsDashboard.jsx after its own itemized-list removal) - `id`
    // is r.id verbatim (not the key's index fallback below) anyway, kept
    // as a straight mirror of desktop's useCriticalIssues shape.
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

const HEALTH_BADGE_CLASS = {
  on_track: 'mobile-health-on_track',
  at_risk: 'mobile-health-at_risk',
  off_track: 'mobile-health-off_track',
}

const SEVERITY_LEVELS = ['Critical', 'High', 'Medium', 'Low']

// Mirrors MobileProjectRisks.jsx's own BAND_BADGE_CLASS (same color
// vocabulary as desktop's SEVERITY_BADGE_CLASS) - kept as its own local
// copy rather than importing across screen files, same "purpose-built,
// independent per screen" reasoning as useCriticalIssues/isPhaseOverdue
// above.
const BAND_BADGE_CLASS = {
  Critical: 'severe',
  High: 'critical',
  Medium: 'partial',
  Low: 'done',
}

function getRiskSeverityCounts(risks) {
  const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
  ;(risks || []).forEach((r) => {
    const band = getRiskBand(r.likelihood, r.severity)
    if (band in counts) counts[band] += 1
  })
  return SEVERITY_LEVELS.map((level) => ({ level, count: counts[level] }))
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
  const [sprints, setSprints] = useState([])
  const [risks, setRisks] = useState([])
  const [issueLogIssues, setIssueLogIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [evalRes, taskRes, phaseRes, sprintRes, riskRes, issueRes] = await Promise.all([
        supabase
          .from('project_evaluations')
          .select('health_status, metrics, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('tasks')
          .select('id, title, status, due_date, backlog_status, phase_id, completed, sprint_id, board_status')
          .eq('project_id', projectId),
        project.methodology !== 'agile'
          ? supabase.from('phases').select('id, phase_name, effective_end_date').eq('project_id', projectId)
          : Promise.resolve({ data: [], error: null }),
        project.methodology !== 'waterfall'
          ? supabase.from('sprints').select('id, name, start_date, end_date, created_at').eq('project_id', projectId)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('risk_logs').select('risks').eq('project_id', projectId).maybeSingle(),
        supabase.from('issue_logs').select('issues').eq('project_id', projectId).maybeSingle(),
      ])

      if (cancelled) return

      const firstError = evalRes.error || taskRes.error || phaseRes.error || sprintRes.error || riskRes.error || issueRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      setEvaluation(evalRes.data && evalRes.data.length > 0 ? evalRes.data[0] : null)
      setTasks(taskRes.data || [])
      setPhases(phaseRes.data || [])
      setSprints(sprintRes.data || [])
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
  // Reuses useCriticalIssues' own Delayed Task entries for the count - same
  // isTaskDelayed definition (taskUtils.js) MobileProjectTasks.jsx's
  // ?taskFilter=delayed now filters by, so the badge and the list it links
  // to can't disagree.
  const delayedTaskCount = issues.filter((i) => i.type === 'Delayed Task').length
  const riskSeverityCounts = getRiskSeverityCounts(risks)
  // Delayed Tasks is Waterfall-side only (see useCriticalIssues' own
  // backlog_status == null scoping - always 0 for pure Agile) - Agile gets
  // Overdue Sprints in its place instead, Hybrid keeps both. Mirrors
  // desktop KeyMetricsDashboard.jsx's showDelayedTasks/showVelocity gates.
  const showDelayedTasks = project.methodology !== 'agile'
  const showOverdueSprints = project.methodology !== 'waterfall'
  const todayStr = new Date().toISOString().slice(0, 10)
  const overdueSprints = sprints.filter((s) => isSprintOverdue(s, tasks, todayStr))

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

        <div className="mobile-hotspot-group">
          <h3 className="mobile-hotspot-group-title">Issues</h3>
          {openIssueCount + closedIssueCount === 0 ? (
            <p className="mobile-screen-stub">No issues logged yet.</p>
          ) : (
            <div className="mobile-issue-summary-row">
              <Link
                to={`/m/projects/${projectId}/more/issues?issueFilter=open`}
                className="mobile-doc-badge critical mobile-badge-link"
              >
                {openIssueCount} Open
              </Link>
              <Link
                to={`/m/projects/${projectId}/more/issues?issueFilter=closed`}
                className="mobile-doc-badge done mobile-badge-link"
              >
                {closedIssueCount} Closed
              </Link>
            </div>
          )}
        </div>

        {showDelayedTasks && (
          <div className="mobile-hotspot-group">
            <h3 className="mobile-hotspot-group-title">Delayed Tasks</h3>
            {delayedTaskCount === 0 ? (
              <p className="mobile-screen-stub">No delayed tasks.</p>
            ) : (
              <div className="mobile-issue-summary-row">
                <Link
                  to={`/m/projects/${projectId}/tasks?taskFilter=delayed`}
                  className="mobile-doc-badge critical mobile-badge-link"
                >
                  {delayedTaskCount} Delayed
                </Link>
              </div>
            )}
          </div>
        )}

        {showOverdueSprints && (
          <div className="mobile-hotspot-group">
            <h3 className="mobile-hotspot-group-title">Overdue Sprints</h3>
            {overdueSprints.length === 0 ? (
              <p className="mobile-screen-stub">No overdue sprints.</p>
            ) : (
              <div className="mobile-issue-summary-row">
                <Link
                  to={`/m/projects/${projectId}/sprint-board?sprintFilter=overdue`}
                  className="mobile-doc-badge critical mobile-badge-link"
                >
                  {overdueSprints.length} Overdue
                </Link>
              </div>
            )}
          </div>
        )}

        <div className="mobile-hotspot-group">
          <h3 className="mobile-hotspot-group-title">Risks</h3>
          {riskSeverityCounts.every((d) => d.count === 0) ? (
            <p className="mobile-screen-stub">No risks logged yet.</p>
          ) : (
            <div className="mobile-issue-summary-row mobile-issue-summary-row-wrap">
              {riskSeverityCounts.map((d) => (
                <Link
                  key={d.level}
                  to={`/m/projects/${projectId}/more/risks?riskFilter=${d.level}`}
                  className={`mobile-doc-badge ${BAND_BADGE_CLASS[d.level]} mobile-badge-link`}
                >
                  {d.count} {d.level}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default MobileProjectMetrics
