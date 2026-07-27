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
import { getRiskBand } from './riskScale'
import { getIssueStatusCounts } from './issueLogUtils'
import { isPhaseOverdue } from './phaseUtils'
import { getEasternTodayStr, isTaskDelayed } from './taskUtils'

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

    // High/Critical-band risks - mirrors project-eval/index.ts's
    // riskStats() band filter. `id`/`label`/`band` aren't read by anything
    // downstream anymore (DelayedTaskCard/OverduePhaseCard/RiskSeverityCard
    // only need the `type` count, now that the per-item itemized list/
    // hotspotLinkTo is gone) - left on the issue object as harmless
    // leftover shape rather than trimmed, so this stays a straight mirror
    // of project-eval/index.ts's riskStats() row shape.
    ;(riskLog?.risks || [])
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
// Reuse doc-status-badge's existing color modifiers instead of inventing a
// new vocabulary - critical/partial/done are the same red/amber/green used
// for Project Status and the section header badge above. 'severe' is the
// one addition, an inverted-danger variant for the new Critical band (see
// App.css) so it reads as a step up from High's plain danger red.
const SEVERITY_BADGE_CLASS = {
  Critical: 'severe',
  High: 'critical',
  Medium: 'partial',
  Low: 'done',
}

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

// Each badge links to Documents > Risk Log pre-filtered to that severity
// (DocumentsRoute.jsx reads the riskFilter param and expands the Risk Log
// row; RiskLogView.jsx applies the actual filter). Still a plain count
// badge visually - .key-metrics-severity-badge-link just adds the
// pointer/hover affordance doc-status-badge doesn't have on its own.
function RiskSeverityCard({ project, riskLog }) {
  const data = useRiskSeverityCounts(riskLog)
  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (total === 0) {
    return <p className="charter-status">No risks logged yet.</p>
  }

  return (
    <div className="key-metrics-severity-badges">
      {data.map((d) => (
        <Link
          key={d.level}
          to={`/projects/${project.id}/documents?riskFilter=${d.level}`}
          className={`doc-status-badge key-metrics-severity-badge-link ${SEVERITY_BADGE_CLASS[d.level]}`}
        >
          {d.count} {d.level}
        </Link>
      ))}
    </div>
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

// Mirrors RiskSeverityCard's deep-link pattern: each badge links to
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

const VELOCITY_SPRINT_LIMIT = 5

// Mirrors project-eval/index.ts's velocityStats() (committed-vs-completed
// story points per sprint, chronological, capped to the most recent 5
// sprints with committed points) but as a live client query instead of
// text fed to Claude - that function's output never gets persisted as
// structured data, so there's nothing to read it back from. Project-wide
// (no milestone_id scoping), matching what velocity_ratio in the
// project_evaluations snapshot already uses for its single-sprint figure.
function useSprintVelocity(projectId, enabled) {
  const [sprints, setSprints] = useState([])
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
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId, enabled])

  return { sprints, loading, error }
}

// Committed = the sprint's planned points (neutral gray, a "plan" tone);
// Completed = points actually done (--accent, the same primary blue used
// for the Progress ring's fill) - two distinct series so both get a
// legend per marks-and-anatomy.md's "legend always present for >= 2 series".
function SprintVelocityCard({ project }) {
  const { sprints, loading, error } = useSprintVelocity(project.id, true)

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
function KeyMetricsDashboard({ project, tasks, phases, riskLog, issueLog, expanded }) {
  const issues = useCriticalIssues(project, tasks, phases, riskLog)
  const { evaluation, loading: evalLoading } = useLatestEvaluation(project.id)
  const showVelocity = visibleSides(project.methodology).agile
  // Phases don't exist as a concept for pure Agile (see useCriticalIssues'
  // own methodology gate above) - hide the sub-group entirely there rather
  // than showing a permanent, meaningless "0 overdue".
  const showPhases = project.methodology !== 'agile'

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
                  <SprintVelocityCard project={project} />
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

              <div className="key-metrics-hotspot-group">
                <h4 className="key-metrics-subheading">Delayed Tasks</h4>
                <DelayedTaskCard project={project} issues={issues} />
              </div>

              {showPhases && (
                <div className="key-metrics-hotspot-group">
                  <h4 className="key-metrics-subheading">Overdue Phases</h4>
                  <OverduePhaseCard project={project} issues={issues} />
                </div>
              )}

              <div className="key-metrics-hotspot-group">
                <h4 className="key-metrics-subheading">Risks</h4>
                <RiskSeverityCard project={project} riskLog={riskLog} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default KeyMetricsDashboard
