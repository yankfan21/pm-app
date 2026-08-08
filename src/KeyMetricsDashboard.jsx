import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from './supabaseClient'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from './projectEvalHealth'
import { visibleSides } from './projectSections'
import { getRiskBand, getRiskScore } from './riskScale'
import { getIssueStatusCounts } from './issueLogUtils'
import { isPhaseOverdue } from './phaseUtils'
import { getEasternTodayStr, isTaskDelayed } from './taskUtils'
import { isSprintOverdue } from './sprintStats'
import { resolveAssigneeLabel } from './components/AssigneePicker'
import { buildAssigneeGroups } from './teamStats'
import { todayLocalDateString } from './useSprintSelection'

const CHART_TOOLTIP_STYLE = {
  background: 'var(--surface-1-solid)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
}
const CHART_TOOLTIP_LABEL_STYLE = { color: 'var(--text-h)' }
// Recharts' default itemStyle is a muted gray baked into its own stylesheet
// - unreadable against our dark card surface. contentStyle/labelStyle alone
// don't touch it, so it needs setting explicitly, same text token as the label.
const CHART_TOOLTIP_ITEM_STYLE = { color: 'var(--text)' }
const CHART_AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 12 }

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// Everything here is recomputed from already-loaded props on every render -
// unlike the Project Status card below, this is a live view, not tied to
// whenever Evaluate Project was last run.
function useCriticalIssues(project, tasks, phases, riskLog) {
  return useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const todayEasternStr = getEasternTodayStr()
    const issues = []

    // Delayed tasks - Waterfall-side only (backlog_status == null). Backlog
    // items are driven by backlog_status/board_status instead (see
    // BacklogView.jsx/SprintBoardView.jsx) and never get `status` set
    // through those views, so they'd never legitimately trip either arm of
    // isTaskDelayed - same waterfallTasks scoping project-eval/index.ts's
    // taskStats() uses. isTaskDelayed (taskUtils.js) covers both the manual
    // PM flag (status === 'delayed') and the auto-trigger (5+ days past due,
    // not yet Completed) - same helper PlanningTasksRoute.jsx's
    // ?taskFilter=delayed uses, so this count and that filtered list can't
    // drift apart.
    tasks
      .filter((t) => t.backlog_status == null && isTaskDelayed(t, todayEasternStr))
      .forEach((t) => issues.push({ key: `task-${t.id}`, type: 'Delayed Task', label: t.title, id: t.id }))

    // High/Critical-band risks - mirrors project-eval/index.ts's riskStats()
    // band filter. `label`/`band`/`id` used to be dead weight here (the old
    // four-count RiskSeverityCard only needed the `type` count); KeyRisksCard
    // below now renders them as a real itemized list, so they're load-bearing
    // again - along with owner/mitigation/score, carried straight off the
    // risk row so the list doesn't need a second pass over riskLog.risks.
    ;(riskLog?.risks || [])
      .filter((r) => ['High', 'Critical'].includes(getRiskBand(r.likelihood, r.severity)))
      .forEach((r, i) =>
        issues.push({
          key: `risk-${r.id ?? i}`,
          type: 'High Risk',
          label: r.risk || `Risk ${i + 1}`,
          id: r.id ?? null,
          band: getRiskBand(r.likelihood, r.severity),
          score: getRiskScore(r.likelihood, r.severity),
          owner: r.owner || null,
          mitigation: r.mitigation || null,
        })
      )

    // Overdue phases - Waterfall/Hybrid only, matching visibleSides() in
    // ProjectDetail.jsx (phases are hidden entirely for pure Agile).
    if (project.methodology !== 'agile') {
      const waterfallTasks = tasks.filter((t) => t.backlog_status == null)
      phases
        .filter((p) => isPhaseOverdue(p, waterfallTasks, todayStr))
        .forEach((p) => issues.push({ key: `phase-${p.id}`, type: 'Overdue Phase', label: p.phase_name, id: p.id }))
    }

    return issues
  }, [project.methodology, tasks, phases, riskLog])
}

// Lifted out of ProjectStatusCard so ProgressRingCard can read the same
// project_evaluations row without a second query - both cards show facets
// of one snapshot (see the module comment above KeyMetricsDashboard).
function useLatestEvaluation(projectId) {
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadLatestEvaluation() {
      setLoading(true)
      // Same query ProjectList.jsx uses for its dashboard badges - latest
      // project_evaluations row for this project, newest first, capped to 1.
      const { data, error } = await supabase
        .from('project_evaluations')
        .select('health_status, metrics, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (cancelled) return
      setEvaluation(!error && data && data.length > 0 ? data[0] : null)
      setLoading(false)
    }

    loadLatestEvaluation()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return { evaluation, loading }
}

function ProjectStatusCard({ evaluation, loading }) {
  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  if (!evaluation) {
    return (
      <p className="charter-status">
        Not evaluated yet — run Evaluate Project (under Documents) to see status and progress here.
      </p>
    )
  }

  const colorClass = HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending'
  const metricText = formatEvalMetric(evaluation.metrics, { longer: true })

  return (
    <div className="project-eval-card key-metrics-status-card">
      <div className="project-eval-card-header">
        <span className={`doc-status-badge ${colorClass} project-eval-health-badge`}>
          {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
        </span>
        {metricText && (
          <span className={`doc-status-badge ${colorClass} project-eval-metric-badge`}>{metricText}</span>
        )}
      </div>
      <p className="key-metrics-as-of">As of {formatDateTime(evaluation.created_at)}</p>
    </div>
  )
}

// Circular meter (donut ring) for a single 0-100 value - Pie with two
// slices (value + remainder), full circle via startAngle 90 -> -270. Fill
// is --accent; track is --code-bg, a lighter neutral step of the same
// surface family (mirrors the "meter" contract: fill carries state,
// unfilled track is a lighter step so state reads across the whole ring).
function ProgressRing({ pct, caption }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const data = [
    { name: 'complete', value: clamped },
    { name: 'remaining', value: 100 - clamped },
  ]

  return (
    <div className="key-metrics-ring-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
            innerRadius="72%"
            outerRadius="100%"
            cornerRadius={4}
            stroke="none"
            isAnimationActive={false}
          >
            <Cell fill="var(--accent)" />
            <Cell fill="var(--code-bg)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="key-metrics-ring-label">
        <span className="key-metrics-ring-pct">{clamped}%</span>
        <span className="key-metrics-ring-caption">{caption}</span>
      </div>
    </div>
  )
}

// Which metric reads as "Progress %" depends on methodology - same fields
// formatEvalMetric() already knows how to format, see projectEvalHealth.js.
// Agile has no task/milestone completion figure at all (no dates, no fixed
// task schedule - see methodologyInstructions() in project-eval/index.ts),
// so velocity_ratio (committed-vs-completed points for the most recent
// sprint) is used as the closest available progress proxy - it's a
// per-sprint snapshot, not cumulative project completion, so the caption
// says so rather than passing it off as the same thing Waterfall/Hybrid show.
function progressFromMetrics(methodology, metrics) {
  if (!metrics) return null
  if (methodology === 'agile') {
    if (metrics.velocity_ratio == null) return null
    return { pct: Math.round(metrics.velocity_ratio * 100), caption: 'Velocity, most recent sprint' }
  }
  if (methodology === 'hybrid') {
    if (metrics.milestone_pct_complete == null) return null
    return { pct: Math.round(metrics.milestone_pct_complete * 100), caption: 'Epic work complete' }
  }
  if (metrics.task_pct_complete == null) return null
  return { pct: Math.round(metrics.task_pct_complete * 100), caption: 'Tasks complete' }
}

function ProgressRingCard({ project, evaluation, loading }) {
  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  const progress = evaluation ? progressFromMetrics(project.methodology, evaluation.metrics) : null

  if (!progress) {
    return (
      <p className="charter-status">
        Not evaluated yet — run Evaluate Project (under Documents) to see progress here.
      </p>
    )
  }

  return (
    <>
      <ProgressRing pct={progress.pct} caption={progress.caption} />
      <p className="key-metrics-as-of">As of {formatDateTime(evaluation.created_at)}</p>
    </>
  )
}

const SEVERITY_LEVELS = ['Critical', 'High', 'Medium', 'Low']

// Unscored risks (band === null) aren't counted here - this card is a
// scored-risk summary, not a full risk enumeration. RiskLogView.jsx's own
// "Needs scoring" badge is where unscored risks get surfaced.
function useRiskSeverityCounts(riskLog) {
  return useMemo(() => {
    const counts = { Critical: 0, High: 0, Medium: 0, Low: 0 }
    ;(riskLog?.risks || []).forEach((r) => {
      const band = getRiskBand(r.likelihood, r.severity)
      if (band in counts) counts[band] += 1
    })
    return SEVERITY_LEVELS.map((level) => ({ level, count: counts[level] }))
  }, [riskLog])
}

// Itemized Critical/High risks, replacing the four count badges that used to
// live here - a PM reading Overview needs to know *which* risks are biting,
// not just that four of them exist. Rows come straight off useCriticalIssues'
// existing High/Critical entries rather than re-filtering riskLog.risks, so
// this list and the "N Hotspots" header count can never disagree about what
// qualifies.
//
// Critical sorts above High, then higher score first, so the worst row is
// always the top one. Medium/Low are deliberately not itemized (they'd bury
// the rows that matter) but aren't dropped either - the tail line below keeps
// their counts and their deep links, which is all the old badge row gave them.
//
// Each row links to Documents > Risk Log with both riskFilter and riskId:
// DocumentsRoute.jsx only auto-expands the Risk Log section when riskFilter is
// present, while riskId is what RiskLogView.jsx flashes on arrival - a riskId
// on its own would land on a collapsed section.
const RISK_BAND_ORDER = { Critical: 0, High: 1 }

function riskLinkTo(projectId, risk) {
  const params = new URLSearchParams({ riskFilter: risk.band })
  if (risk.id) params.set('riskId', risk.id)
  return `/projects/${projectId}/documents?${params}`
}

function KeyRisksCard({ project, riskLog, issues }) {
  const counts = useRiskSeverityCounts(riskLog)
  const countFor = (level) => counts.find((c) => c.level === level)?.count ?? 0
  const lowerBands = ['Medium', 'Low'].filter((level) => countFor(level) > 0)

  const keyRisks = useMemo(
    () =>
      issues
        .filter((i) => i.type === 'High Risk')
        .sort(
          (a, b) => RISK_BAND_ORDER[a.band] - RISK_BAND_ORDER[b.band] || (b.score ?? 0) - (a.score ?? 0)
        ),
    [issues]
  )

  const totalLogged = counts.reduce((sum, c) => sum + c.count, 0)
  if (totalLogged === 0) {
    return <p className="charter-status">No risks logged yet.</p>
  }

  return (
    <>
      {keyRisks.length === 0 ? (
        <p className="charter-status">No Critical or High risks — nothing above the Medium band.</p>
      ) : (
        <ul className="key-risk-list">
          {keyRisks.map((risk) => (
            <li key={risk.key} className="key-risk-item">
              <Link to={riskLinkTo(project.id, risk)} className="key-risk-link">
                <span className="key-risk-head">
                  <span className={`risk-level-badge risk-level-${risk.band.toLowerCase()}`}>
                    {risk.band}
                    {risk.score != null && ` · ${risk.score}`}
                  </span>
                  <span className="key-risk-title">{risk.label}</span>
                </span>
                <span className="key-risk-meta">
                  Owner: {risk.owner || 'Unassigned'}
                  {risk.mitigation ? ` · ${risk.mitigation}` : ' · No mitigation recorded'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lowerBands.length > 0 && (
        <p className="key-risk-tail">
          Also logged:{' '}
          {lowerBands.map((level, i) => (
            <span key={level}>
              {i > 0 && ', '}
              <Link to={`/projects/${project.id}/documents?riskFilter=${level}`}>
                {countFor(level)} {level}
              </Link>
            </span>
          ))}
        </p>
      )}
    </>
  )
}

// Live snapshot, not tied to the project_evaluations snapshot at all - same
// "recomputed from already-loaded props on every render" treatment as
// useCriticalIssues/useRiskSeverityCounts above. Open bucket = Open/In
// Progress/Blocked combined (see issueLogUtils.js's OPEN_ISSUE_STATUSES);
// Closed is its own bucket.
function useIssueStatusCounts(issueLog) {
  return useMemo(() => getIssueStatusCounts(issueLog?.issues), [issueLog])
}

// Mirrors KeyRisksCard's deep-link pattern: each badge links to
// Documents > Issues Log pre-filtered (DocumentsRoute.jsx reads the
// issueFilter param and expands the Issue Log row; IssueLogView.jsx applies
// the actual filter - 'OpenGroup' is a deep-link-only value combining
// Open/In Progress/Blocked, not one of its visible tabs).
function IssueSummaryCard({ project, issueLog }) {
  const { open, closed } = useIssueStatusCounts(issueLog)

  if (open + closed === 0) {
    return <p className="charter-status">No issues logged yet.</p>
  }

  return (
    <div className="key-metrics-severity-badges">
      <Link
        to={`/projects/${project.id}/documents?issueFilter=OpenGroup`}
        className="doc-status-badge key-metrics-severity-badge-link critical"
      >
        {open} Open
      </Link>
      <Link
        to={`/projects/${project.id}/documents?issueFilter=Closed`}
        className="doc-status-badge key-metrics-severity-badge-link done"
      >
        {closed} Closed
      </Link>
    </div>
  )
}

// Delayed Task / Overdue Phase counts both come straight off useCriticalIssues'
// `issues` array instead of recomputing from tasks/phases a second time -
// that array already carries one entry per delayed task / overdue phase
// (see useCriticalIssues above), so filtering by `type` here can't drift
// from the top-level "N Hotspots" count.
function DelayedTaskCard({ project, issues }) {
  const count = issues.filter((i) => i.type === 'Delayed Task').length

  if (count === 0) {
    return <p className="charter-status">No delayed tasks.</p>
  }

  return (
    <div className="key-metrics-severity-badges">
      <Link
        to={`/projects/${project.id}/planning/tasks?taskFilter=delayed`}
        className="doc-status-badge key-metrics-severity-badge-link critical"
      >
        {count} Delayed
      </Link>
    </div>
  )
}

// Overdue Phases has no PM-facing "Issue" or "Risk" concept to fold into -
// it's its own sub-group rather than merged into one of the other three
// (see redesign discussion). Links into PlanningPhasesRoute's new
// ?phaseFilter=overdue view (ProjectSectionRoutes.jsx/PhaseDetailView.jsx).
function OverduePhaseCard({ project, issues }) {
  const count = issues.filter((i) => i.type === 'Overdue Phase').length

  if (count === 0) {
    return <p className="charter-status">No overdue phases.</p>
  }

  return (
    <div className="key-metrics-severity-badges">
      <Link
        to={`/projects/${project.id}/planning/phases?phaseFilter=overdue`}
        className="doc-status-badge key-metrics-severity-badge-link critical"
      >
        {count} Overdue
      </Link>
    </div>
  )
}

// Agile/Hybrid only (methodology !== 'waterfall' - same side useSprintVelocity
// is gated on, since Waterfall has no sprints concept at all). Data comes
// from useSprintVelocity's overdueSprints, computed alongside the velocity
// chart's own query rather than a separate fetch. Links into Sprint Board's
// ?sprintFilter=overdue deep link (ProjectSectionRoutes.jsx's
// ExecutionSprintBoardRoute), which auto-selects the earliest overdue sprint.
function OverdueSprintsCard({ project, overdueSprints, loading, error }) {
  if (loading) {
    return <p className="charter-status">Loading sprint data...</p>
  }
  if (error) {
    return <p className="charter-status">{error}</p>
  }
  if (overdueSprints.length === 0) {
    return <p className="charter-status">No overdue sprints.</p>
  }

  return (
    <div className="key-metrics-severity-badges">
      <Link
        to={`/projects/${project.id}/execution/sprint-board?sprintFilter=overdue`}
        className="doc-status-badge key-metrics-severity-badge-link critical"
      >
        {overdueSprints.length} Overdue
      </Link>
    </div>
  )
}

const VELOCITY_SPRINT_LIMIT = 5

// Mirrors project-eval/index.ts's velocityStats() (committed-vs-completed
// story points per sprint, chronological, capped to the most recent 5
// sprints with committed points) but as a live client query instead of
// text fed to Claude - that function's output never gets persisted as
// structured data, so there's nothing to read it back from. Project-wide
// (no milestone_id scoping), matching what velocity_ratio in the
// project_evaluations snapshot already uses for its single-sprint figure.
//
// Also derives overdueSprints (Project Hotspots' Overdue Sprints count) off
// this same sprints+tasks query rather than issuing a second one - id/name/
// end_date for every sprint that trips isSprintOverdue, earliest end_date
// first (the ?sprintFilter=overdue deep-link auto-selects the first one).
// Unlike the velocity chart's `sprints`, this isn't capped to the last 5 or
// scoped to sprints with committed points - a sprint can be overdue with no
// story-pointed tasks at all... though isSprintOverdue itself then reads it
// as not overdue (no linked tasks to be incomplete), so in practice this
// only ever contains sprints that do have linked tasks.
function useSprintVelocity(projectId, enabled) {
  const [sprints, setSprints] = useState([])
  const [overdueSprints, setOverdueSprints] = useState([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const [sprintRes, taskRes] = await Promise.all([
        supabase.from('sprints').select('id, name, start_date, end_date, created_at').eq('project_id', projectId),
        supabase
          .from('tasks')
          .select('sprint_id, story_points, board_status')
          .eq('project_id', projectId)
          .not('sprint_id', 'is', null),
      ])

      if (cancelled) return

      const firstError = sprintRes.error || taskRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const bySprintId = new Map()
      ;(taskRes.data || []).forEach((t) => {
        const entry = bySprintId.get(t.sprint_id) || { committed: 0, completed: 0 }
        entry.committed += t.story_points ?? 0
        if (t.board_status === 'done') entry.completed += t.story_points ?? 0
        bySprintId.set(t.sprint_id, entry)
      })

      const relevant = (sprintRes.data || [])
        .filter((s) => bySprintId.has(s.id))
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') || (a.created_at || '').localeCompare(b.created_at || ''))
        .slice(-VELOCITY_SPRINT_LIMIT)
        .map((s) => ({ name: s.name, ...bySprintId.get(s.id) }))

      setSprints(relevant)

      const todayStr = new Date().toISOString().slice(0, 10)
      const overdue = (sprintRes.data || [])
        .filter((s) => isSprintOverdue(s, taskRes.data || [], todayStr))
        .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        .map((s) => ({ id: s.id, name: s.name, end_date: s.end_date }))

      setOverdueSprints(overdue)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId, enabled])

  return { sprints, overdueSprints, loading, error }
}

// Committed = the sprint's planned points (neutral gray, a "plan" tone);
// Completed = points actually done (--accent, the same primary blue used
// for the Progress ring's fill) - two distinct series so both get a
// legend per marks-and-anatomy.md's "legend always present for >= 2 series".
function SprintVelocityCard({ sprints, loading, error }) {
  if (loading) {
    return <p className="charter-status">Loading sprint data...</p>
  }
  if (error) {
    return <p className="charter-status">{error}</p>
  }
  if (sprints.length === 0) {
    return <p className="charter-status">No sprint data with committed points yet.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={sprints} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--border-faint)" />
        <XAxis dataKey="name" tick={CHART_AXIS_TICK} axisLine={{ stroke: 'var(--border-faint)' }} tickLine={false} />
        <YAxis allowDecimals={false} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: 'var(--code-bg)' }}
          contentStyle={CHART_TOOLTIP_STYLE}
          labelStyle={CHART_TOOLTIP_LABEL_STYLE}
          itemStyle={CHART_TOOLTIP_ITEM_STYLE}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-muted)' }} />
        <Bar dataKey="committed" name="Committed" fill="var(--zone-accent-neutral)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        <Bar dataKey="completed" name="Completed" fill="var(--accent)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

const TEAM_HOTSPOT_LIMIT = 6

// Per-assignee load table, computed by the same teamStats.js helpers the
// Execution > Team routes use (see the module comment there for why the
// logic was lifted out of TeamView rather than the component reused here).
//
// Scoping deliberately differs from the Team routes in two ways. First, no
// active-sprint scoping: Overview is a project-wide snapshot, and quietly
// narrowing to one sprint here would make this table disagree with every
// other number on the page. Second, Hybrid reads its Waterfall side
// (backlog_status == null) rather than both - same scoping the Delayed Tasks
// and Overdue Phases sub-groups above already use, so the whole Hotspots
// panel describes one consistent slice of the project. Pure Agile has no
// Waterfall side at all, so it reads the backlog instead and swaps in the
// story-point stats.
//
// Capped at TEAM_HOTSPOT_LIMIT rows - this is a "who's loaded up" glance, not
// the full roster, which is what the Team route itself is for.
function TeamHotspotsCard({ project, tasks, collaborators }) {
  const isAgile = project.methodology === 'agile'
  const todayStr = todayLocalDateString()

  const groups = useMemo(() => {
    const scoped = tasks.filter((t) => (isAgile ? t.backlog_status != null : t.backlog_status == null))
    return buildAssigneeGroups(scoped, {
      variant: isAgile ? 'agile' : 'waterfall',
      todayStr,
      resolveLabel: (task) => resolveAssigneeLabel(task, collaborators, project),
    })
  }, [tasks, collaborators, project, isAgile, todayStr])

  if (groups.length === 0) {
    return <p className="charter-status">No {isAgile ? 'backlog items' : 'tasks'} assigned yet.</p>
  }

  const shown = groups.slice(0, TEAM_HOTSPOT_LIMIT)

  return (
    <>
      <div className="risk-table-wrap key-metrics-table-wrap">
        <table className="risk-log-table overview-table">
          <thead>
            <tr>
              <th>Assignee</th>
              <th>{isAgile ? 'Backlog Items' : 'Tasks'}</th>
              {isAgile ? (
                <th>Story Points</th>
              ) : (
                <>
                  <th>Overdue/Delayed</th>
                  <th>Overlapping</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.key}>
                <td className="overview-table-label">{g.label}</td>
                <td>{g.stats.taskCount}</td>
                {isAgile ? (
                  <td>{g.stats.totalPoints} pts</td>
                ) : (
                  <>
                    <td>
                      <span
                        className={`status-dot ${g.stats.overdueOrDelayedCount > 0 ? 'critical' : 'done'}`}
                        aria-hidden="true"
                      />{' '}
                      {g.stats.overdueOrDelayedCount}
                    </td>
                    <td>
                      <span
                        className={`status-dot ${g.stats.overlapCount > 0 ? 'critical' : 'done'}`}
                        aria-hidden="true"
                      />{' '}
                      {g.stats.overlapCount}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {groups.length > shown.length && (
        <p className="key-risk-tail">
          Showing the {shown.length} most loaded of {groups.length} assignees —{' '}
          <Link to={`/projects/${project.id}/execution/team-${isAgile ? 'agile' : 'waterfall'}`}>
            see the full team view
          </Link>
          .
        </p>
      )}
    </>
  )
}

const UPCOMING_MILESTONE_LIMIT = 5

// Milestones with an end_date still ahead of today. There is no status or
// completed column on the milestones table, so "upcoming" can only mean
// "not yet past its end date" - a milestone finished early still shows here,
// and that's an honest limit of the data rather than something to paper over.
// Rows with no end_date at all are included (undated work is still ahead of
// you), sorted last.
//
// The completion figure is gated twice on purpose. tasks.milestone_id is a
// Backlog concept - Waterfall projects never set it (see GanttChart.jsx's
// note), so on those projects every milestone would read a permanent "0/0
// done" that looks like real, alarming data. `projectLinksTasks` suppresses
// the column entirely unless this project actually has linked tasks, and the
// per-row check suppresses it for any individual milestone with none.
function useUpcomingMilestones(milestones, tasks) {
  return useMemo(() => {
    const todayStr = todayLocalDateString()
    const projectLinksTasks = tasks.some((t) => t.milestone_id)

    const upcoming = (milestones || [])
      .filter((m) => !m.end_date || m.end_date >= todayStr)
      .sort((a, b) => {
        if (!a.end_date && !b.end_date) return 0
        if (!a.end_date) return 1
        if (!b.end_date) return -1
        return a.end_date.localeCompare(b.end_date)
      })
      .map((m) => {
        const linked = projectLinksTasks ? tasks.filter((t) => t.milestone_id === m.id) : []
        const done = linked.filter((t) => t.board_status === 'done' || t.completed).length
        return {
          ...m,
          progress: linked.length > 0 ? { done, total: linked.length } : null,
        }
      })

    return { upcoming, showProgressColumn: projectLinksTasks && upcoming.some((m) => m.progress) }
  }, [milestones, tasks])
}

function UpcomingMilestonesCard({ milestones, tasks }) {
  const { upcoming, showProgressColumn } = useUpcomingMilestones(milestones, tasks)

  if (upcoming.length === 0) {
    return (
      <p className="charter-status">
        {(milestones || []).length === 0
          ? 'No milestones defined yet.'
          : 'No upcoming milestones — every milestone end date has passed.'}
      </p>
    )
  }

  const shown = upcoming.slice(0, UPCOMING_MILESTONE_LIMIT)

  return (
    <>
      <div className="risk-table-wrap key-metrics-table-wrap">
        <table className="risk-log-table overview-table">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Target</th>
              {showProgressColumn && <th>Linked Work</th>}
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id}>
                <td className="overview-table-label">{m.name}</td>
                <td>{m.end_date || 'TBD'}</td>
                {showProgressColumn && <td>{m.progress ? `${m.progress.done}/${m.progress.total} done` : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {upcoming.length > shown.length && (
        <p className="key-risk-tail">
          Showing the next {shown.length} of {upcoming.length} upcoming milestones.
        </p>
      )}
    </>
  )
}

// New top-level section, same level as Tasks and Milestones / Backlog /
// Sprint Board / Gantt Chart - Project Status + Progress % is a snapshot of
// the latest Evaluate Project run (see ProjectStatusCard/ProgressRingCard);
// Project Hotspots is a live recomputation from already-loaded
// tasks/phases/riskLog/issueLog props, not tied to that snapshot at all.
// Progress and Sprint Velocity share one panel/row - the donut is the
// current velocity_ratio snapshot, the bar chart is the trend behind it
// (own live query, see useSprintVelocity) - pairing them makes that
// relationship visible at a glance. Waterfall has no Sprint Velocity (see
// visibleSides().agile), so the row falls back to just the donut,
// left-aligned at its normal size - .key-metrics-progress-col's fixed
// width means it never stretches to fill the row on its own.
function KeyMetricsDashboard({
  project,
  tasks,
  phases,
  milestones,
  collaborators,
  riskLog,
  issueLog,
  expanded,
}) {
  const issues = useCriticalIssues(project, tasks, phases, riskLog)
  const { evaluation, loading: evalLoading } = useLatestEvaluation(project.id)
  const showVelocity = visibleSides(project.methodology).agile
  const {
    sprints: velocitySprints,
    overdueSprints,
    loading: velocityLoading,
    error: velocityError,
  } = useSprintVelocity(project.id, showVelocity)
  // Phases don't exist as a concept for pure Agile (see useCriticalIssues'
  // own methodology gate above) - hide the sub-group entirely there rather
  // than showing a permanent, meaningless "0 overdue".
  const showPhases = project.methodology !== 'agile'
  // Delayed Tasks is Waterfall-side only (see useCriticalIssues' own
  // backlog_status == null scoping - it's always 0 for pure Agile since
  // every Agile task has backlog_status set) - Agile gets Overdue Sprints
  // in its place instead, Hybrid keeps both.
  const showDelayedTasks = project.methodology !== 'agile'

  return (
    <div className="detail-zone key-metrics-dashboard">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Overview</span>
        <span className={`doc-status-badge ${issues.length > 0 ? 'critical' : 'done'}`}>
          {issues.length > 0 ? `${issues.length} Hotspot${issues.length === 1 ? '' : 's'}` : 'All Clear'}
        </span>
      </h2>

      {expanded && (
        <div className="key-metrics-body">
          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Project Status</h3>
            <ProjectStatusCard evaluation={evaluation} loading={evalLoading} />
          </div>

          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Progress &amp; Velocity</h3>
            <div className="key-metrics-progress-velocity-row">
              <div className="key-metrics-progress-col">
                <ProgressRingCard project={project} evaluation={evaluation} loading={evalLoading} />
              </div>
              {showVelocity && (
                <div className="key-metrics-velocity-col">
                  <SprintVelocityCard sprints={velocitySprints} loading={velocityLoading} error={velocityError} />
                </div>
              )}
            </div>
          </div>

          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Project Hotspots</h3>
            <div className="key-metrics-hotspot-groups">
              <div className="key-metrics-hotspot-group">
                <h4 className="key-metrics-subheading">Issues</h4>
                <IssueSummaryCard project={project} issueLog={issueLog} />
              </div>

              {showDelayedTasks && (
                <div className="key-metrics-hotspot-group">
                  <h4 className="key-metrics-subheading">Delayed Tasks</h4>
                  <DelayedTaskCard project={project} issues={issues} />
                </div>
              )}

              {showPhases && (
                <div className="key-metrics-hotspot-group">
                  <h4 className="key-metrics-subheading">Overdue Phases</h4>
                  <OverduePhaseCard project={project} issues={issues} />
                </div>
              )}

              {showVelocity && (
                <div className="key-metrics-hotspot-group">
                  <h4 className="key-metrics-subheading">Overdue Sprints</h4>
                  <OverdueSprintsCard
                    project={project}
                    overdueSprints={overdueSprints}
                    loading={velocityLoading}
                    error={velocityError}
                  />
                </div>
              )}

            </div>

            {/* Key Risks and Team Hotspots sit below the count sub-groups
                rather than inside .key-metrics-hotspot-groups - that row is a
                wrapping grid of narrow count columns, and a full-width table
                or itemized list dropped into it would be squeezed into a
                200px flex basis. */}
            <div className="key-metrics-hotspot-detail">
              <h4 className="key-metrics-subheading">Key Risks</h4>
              <KeyRisksCard project={project} riskLog={riskLog} issues={issues} />
            </div>

            <div className="key-metrics-hotspot-detail">
              <h4 className="key-metrics-subheading">Team Hotspots</h4>
              <TeamHotspotsCard project={project} tasks={tasks} collaborators={collaborators || []} />
            </div>
          </div>

          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Upcoming Milestones</h3>
            <UpcomingMilestonesCard milestones={milestones} tasks={tasks} />
          </div>
        </div>
      )}
    </div>
  )
}

export default KeyMetricsDashboard
