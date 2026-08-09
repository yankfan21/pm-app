import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from './supabaseClient'
import LoadingButton from './LoadingButton'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS } from './projectEvalHealth'
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

// Shell for the top metric row's cards - a label, then whatever single
// figure the card owns. Deliberately dumb: every card in that row is
// "one word of context plus one number", so the only thing shared is the
// box and the label, and each card component below supplies its own value
// and its own empty state.
//
// `action` (optional) is a control that sits on the label line, right-
// aligned - only Progress uses it, for its Update Progress button, which
// refreshes the Sprint Velocity card beside it as well (see
// useProgressRefresh). The label always renders inside the same head row
// whether or not one is given, so a card without an action looks exactly as
// it did before.
function StatCard({ label, action, children }) {
  return (
    <div className="overview-stat-card">
      <div className="overview-stat-head">
        <span className="overview-stat-label">{label}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

// The numeric metric badge that used to sit beside the health badge here is
// gone - the Progress card immediately to the right in the metric row now
// carries that exact same figure (both come off evaluation.metrics), and two
// copies of one number inside a four-card row is noise. The health badge and
// the snapshot timestamp are all this card owes.
function ProjectStatusCard({ evaluation, loading }) {
  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  if (!evaluation) {
    return (
      <p className="charter-status">
        Not evaluated yet — run Evaluate Project below to see status and progress here.
      </p>
    )
  }

  const colorClass = HEALTH_COLOR_CLASS[evaluation.health_status] || 'pending'

  return (
    <>
      <span className={`doc-status-badge ${colorClass} project-eval-health-badge overview-stat-badge`}>
        {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
      </span>
      {/* "Evaluated", not the old vague "As of" - the Progress card beside
          this one can now carry its own, later "Progress updated ..." line
          (a metrics refresh moves updated_at, never created_at), and the
          two dates have to read as two different events. */}
      <p className="overview-stat-caption">Evaluated {formatDateTime(evaluation.created_at)}</p>
    </>
  )
}

function formatDayMonth(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Evaluations written before velocity moved onto the most-recent-COMPLETED
// sprint have a metrics object with velocity_ratio but no velocity_sprint_*
// keys at all. Those figures are still real numbers from a real sprint, just
// chosen by the old start_date rule, so they keep the old caption rather
// than claiming a sprint name this snapshot never recorded. Absent key, not
// null value, is the tell - a current evaluation with nothing qualifying
// writes the key explicitly as null.
function isLegacyVelocityMetrics(metrics) {
  return !('velocity_sprint_name' in metrics)
}

function velocityCaption(metrics) {
  if (isLegacyVelocityMetrics(metrics)) return 'Velocity, most recent sprint'
  const when = metrics.velocity_sprint_completed_at
    ? `, completed ${formatDayMonth(metrics.velocity_sprint_completed_at)}`
    : ''
  return `${metrics.velocity_sprint_name}${when}`
}

// Which metric reads as "Progress %" depends on methodology - same fields
// formatEvalMetric() already knows how to format, see projectEvalHealth.js.
// Agile has no task/milestone completion figure at all (no dates, no fixed
// task schedule - see methodologyInstructions() in project-eval/index.ts),
// so velocity_ratio (committed-vs-completed points for the most recent
// sprint) is used as the closest available progress proxy - it's a
// per-sprint snapshot, not cumulative project completion, so the caption
// says so rather than passing it off as the same thing Waterfall/Hybrid show.
//
// Hybrid reads task_pct_complete, exactly as Waterfall does - it used to
// have its own branch showing milestone_pct_complete ("Epic work complete"),
// a blend of Waterfall-side tasks and backlog items linked to an Epic. That
// blend answered a question nobody was asking on a summary card: the two
// halves of a Hybrid project move at different speeds and for different
// reasons, which is why the Sprint Velocity card beside this one exists.
// Splitting them means each card is one measurement of one thing.
// milestone_pct_complete is still written and still read elsewhere (see
// project-eval/index.ts) - it just isn't what this card shows.
function progressFromMetrics(methodology, metrics) {
  if (!metrics) return null
  if (methodology === 'agile') {
    if (metrics.velocity_ratio == null) return null
    return { pct: Math.round(metrics.velocity_ratio * 100), caption: velocityCaption(metrics) }
  }
  if (metrics.task_pct_complete == null) return null
  return { pct: Math.round(metrics.task_pct_complete * 100), caption: 'Tasks complete' }
}

// What a sprint has to do to count as "completed" here is a rule a PM can't
// infer from a blank card, so the copy states it. Shared by both cards that
// can end up with no velocity figure to show - the metrics-fed one below and
// VelocityStatCard's own live query - which reach that state independently
// but mean exactly the same thing by it.
const NO_COMPLETED_SPRINT_COPY =
  'No completed sprint yet — a sprint counts once all its items are done and its retro is locked.'

// Why a velocity_ratio came back null, for the two distinct reasons that
// used to share one (wrong) sentence:
//   - no sprint qualifies as completed at all, or
//   - one does, but carries no story-point estimates to compute a ratio from.
// The old copy said "no sprint has committed story points yet" for both,
// which on a project with several closed-out sprints is simply false. That
// wording survives only for legacy metrics objects, which genuinely can't
// tell the two apart (no velocity_sprint_name key to check).
function velocityEmptyCopy(metrics) {
  if (isLegacyVelocityMetrics(metrics)) return 'No sprint has committed story points yet.'
  if (metrics.velocity_sprint_name) {
    return `${metrics.velocity_sprint_name} is the most recent completed sprint, but its items carry no story-point estimates — nothing to measure velocity against.`
  }
  return NO_COMPLETED_SPRINT_COPY
}

// Copy for the case an evaluation exists but its progress metric came back
// null - previously indistinguishable from "never evaluated", which read as
// a flat lie on a project that had just been evaluated. Each methodology can
// reach a null metric for its own reason (see project-eval/index.ts):
// Waterfall and Hybrid when there are no Waterfall-side tasks to compute a
// completion fraction from (both read task_pct_complete now - see
// progressFromMetrics above), and Agile per velocityEmptyCopy.
//
// The metrics column itself being null is a further case: evaluations
// written before add_project_eval_metrics.sql have no metrics object at all,
// so there's nothing to compute from until the PM re-runs the evaluation.
//
// Hybrid evaluations saved before task_pct_complete was added to that object
// land in their own case - they have metrics, just not this key - and the
// "no tasks yet" line would be a flat lie on a Hybrid project that has
// plenty. Absent key, not null value, is the tell (same distinction
// isLegacyVelocityMetrics draws): a Hybrid project genuinely holding no
// Waterfall-side tasks gets the key written as an explicit null and reads
// the ordinary empty line. A *live* object missing the key means something
// else entirely - the deployed project-eval predates the change - so that
// one stays neutral rather than blaming an evaluation it didn't come from.
// The isLive third argument this used to take is gone with the live-metrics
// object it described. An unsaved figure can now only come from a project
// with no evaluation at all, and that object is always computed by the
// current edge function, so it always carries task_pct_complete on Hybrid -
// the Hybrid branch below is reachable only from a genuinely old persisted
// evaluation, which is exactly what its copy says.
function progressEmptyCopy(methodology, metrics) {
  if (!metrics) {
    return 'This evaluation predates progress metrics — re-run Evaluate Project below to see a figure here.'
  }
  if (methodology === 'agile') return velocityEmptyCopy(metrics)
  if (methodology === 'hybrid' && !('task_pct_complete' in metrics)) {
    return 'This evaluation predates task-completion tracking on Hybrid projects — use Update Progress for a current figure.'
  }
  return 'No tasks yet to measure completion against.'
}

// Marks the figure beside it as one that did NOT get saved. Update Progress
// normally writes its result onto the latest evaluation row, so the number
// on this card is the same persisted number every other reader of the
// project sees; this tag is the one case where it isn't - a project with no
// evaluation yet has no row to write to, so the figure lives in component
// state and disappears on navigation. See useProgressRefresh below.
function UnsavedTag() {
  return (
    <span
      className="overview-stat-live"
      title="Recomputed just now from current project data — not saved, because this project has no evaluation to attach it to"
    >
      Not saved
    </span>
  )
}

// Says what the Not saved tag means in the only terms a PM can act on.
// Deliberately names Evaluate Project rather than Update Progress - clicking
// this button again on the same project reaches the same dead end, because
// what's missing is the evaluation row to attach the number to.
const UNSAVED_PROGRESS_COPY = 'Not saved — run Evaluate Project to keep this figure.'

// The Progress figure's own date line, shown only once a metrics refresh
// has actually moved it. A metrics-only refresh writes updated_at and
// leaves created_at alone, so the two timestamps now mean different things
// and each is shown where it applies:
//   - Project Status card: "Evaluated <created_at>", always. health_status
//     really is as old as the evaluation no matter what happened to the
//     metrics.
//   - this line: "Progress updated <updated_at>", only when newer. Without
//     it the Progress number would sit under a date belonging to the last
//     Evaluate Project run, which after a refresh is simply the wrong date.
// Nothing is duplicated and no date is lost: an unrefreshed evaluation says
// "Evaluated ..." once, on the card next door, exactly as it did before.
//
// Returns null for a row written before add_project_eval_updated_at.sql
// (updated_at NULL) and for one refreshed within the same instant it was
// created - neither has anything new to report.
function progressUpdatedCopy(evaluation) {
  const { created_at: createdAt, updated_at: updatedAt } = evaluation
  if (!updatedAt || !createdAt) return null
  if (new Date(updatedAt) <= new Date(createdAt)) return null
  return `Progress updated ${formatDateTime(updatedAt)}`
}

// Not clamped to 100 the way the donut ring this replaced was. That clamp
// existed because a ring can't draw past a full circle, and it silently
// turned an Agile project that delivered 120% of its committed points into a
// flat "100%". A number has no such constraint, so the real figure shows.
//
// Reads the persisted evaluation's metrics in the normal case - Update
// Progress writes its recomputed object straight onto that row now, so
// there is no second in-memory source to reconcile against and no "which
// one is fresher" question to answer.
//
// `unsavedMetrics` is the one exception: a project with no evaluation at
// all has no row to persist onto, so the refresh returns a figure that
// only this page knows about. It's still a real, server-computed number
// worth showing - the card just has to say plainly that it won't survive
// leaving the page.
//
// The "Progress updated ..." line under the number is the other half of
// persistence being real - see progressUpdatedCopy above for why it only
// appears once a refresh has actually moved the figure.
function ProgressStatCard({ project, evaluation, loading, unsavedMetrics }) {
  if (loading) {
    return <p className="charter-status">Loading...</p>
  }

  const isUnsaved = unsavedMetrics != null

  if (!isUnsaved && !evaluation) {
    return (
      <p className="charter-status">
        Not evaluated yet — run Evaluate Project below to see progress here.
      </p>
    )
  }

  const metrics = isUnsaved ? unsavedMetrics : evaluation.metrics
  const progress = progressFromMetrics(project.methodology, metrics)
  const updatedLine = !isUnsaved && evaluation ? progressUpdatedCopy(evaluation) : null

  if (!progress) {
    return (
      <>
        <p className="charter-status">{progressEmptyCopy(project.methodology, metrics)}</p>
        {isUnsaved && <UnsavedTag />}
        {isUnsaved && <p className="overview-stat-caption">{UNSAVED_PROGRESS_COPY}</p>}
        {updatedLine && <p className="overview-stat-caption">{updatedLine}</p>}
      </>
    )
  }

  return (
    <>
      <div className="overview-stat-value-row">
        <span className="overview-stat-value">{progress.pct}%</span>
        {isUnsaved && <UnsavedTag />}
      </div>
      <p className="overview-stat-caption">{progress.caption}</p>
      {isUnsaved && <p className="overview-stat-caption">{UNSAVED_PROGRESS_COPY}</p>}
      {updatedLine && <p className="overview-stat-caption">{updatedLine}</p>}
    </>
  )
}

// The Update Progress button's state. Calls project-eval's metrics_only
// action, which runs the same arithmetic Evaluate Project does and skips
// everything else about it - no Anthropic call, no ai_usage_log row, no new
// evaluation document - so this still costs nothing.
//
// What it no longer skips is the write. The edge function persists the
// computed object onto the latest evaluation row's `metrics` column, so the
// refreshed figure survives navigation and a page refresh and reaches every
// other reader of that row (All Projects' badge, mobile). This hook's job
// on success is therefore mostly to hand the new values up via
// onPersisted() so the one copy of that row on this page - the
// docs.project_evaluation array both the metric cards and the Project
// Evaluation section render from - matches what's now in the database,
// without a re-fetch.
//
// `unsavedMetrics` is the narrow fallback for the case the edge function
// reports persisted: false - a project with no evaluation row to write to.
// The number is still real and still worth showing, so it's held in
// component state exactly the way every refresh used to be, and the card
// labels it Not saved. It clears the moment a real evaluation lands (keyed
// off the latest evaluation's id), so running Evaluate Project after an
// unsaved refresh can't leave the older figure sitting on top of the
// fresher snapshot.
//
// onVelocityRefresh is the Sprint Velocity card's half of the same click.
// That card reads its own live query rather than this metrics object (it
// carries the point counts the metrics object can't), so keeping the two
// cards at one instant means re-running that query here rather than
// forwarding a second copy of the numbers into it.
function useProgressRefresh(project, latestEvaluationId, onPersisted, onVelocityRefresh) {
  const [unsavedMetrics, setUnsavedMetrics] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    setUnsavedMetrics(null)
    setError(null)
  }, [latestEvaluationId])

  async function refresh() {
    setRefreshing(true)
    setError(null)

    // Mirrors ProjectEvalFlow's invoke shape, minus the payload: this action
    // reads the rows it needs server-side from projectId, so the figure comes
    // from current database state rather than arrays this page loaded on
    // mount. `today` is computed locally for the same reason ProjectEvalFlow
    // does it - the viewer's calendar day, not the edge function's.
    const { data, error: invokeError } = await supabase.functions.invoke('project-eval', {
      body: {
        action: 'metrics_only',
        projectId: project.id,
        methodology: project.methodology,
        today: todayLocalDateString(),
      },
    })

    setRefreshing(false)

    if (invokeError || data?.error) {
      setError(invokeError?.message || data.error)
      return
    }

    if (data.persisted) {
      // Patch, don't re-fetch: these are the only two columns the edge
      // function touched, and they're exactly what it just wrote.
      onPersisted({ metrics: data.metrics ?? null, updated_at: data.updated_at ?? null })
      setUnsavedMetrics(null)
    } else {
      setUnsavedMetrics(data.metrics ?? null)
    }

    onVelocityRefresh()
  }

  return { unsavedMetrics, refreshing, error, refresh }
}

// Hybrid-only third metric. Agile doesn't get one because its Progress card
// is already velocity (progressFromMetrics' agile branch reads velocity_ratio),
// and Waterfall has no sprints at all - so this card only earns its slot on
// Hybrid, where Progress carries Waterfall-side task completion and velocity
// is the genuinely separate second signal for the Agile side.
//
// One source now: useSprintVelocity's completedSprint, a live client query,
// so this card is never tied to the last Evaluate Project run the way
// Progress is. It used to take a second source - the Update Progress
// refresh's metrics object - purely so one click could move both cards to
// the same instant. That's now done by re-running this card's own query on
// the same click (useProgressRefresh's onVelocityRefresh), which reaches the
// same instant without the second source: pickCompletedSprint and the edge
// function's mostRecentCompletedSprint are the same rule (see the note on
// pickCompletedSprint below), and the query path additionally carries the
// point counts - velocity_ratio is a ratio, and committed/completed aren't
// in the metrics object - so the "34/40 pts" tail survives a refresh now
// instead of dropping off it.
//
// completedSprint reads useSprintVelocity's own field rather than the last
// entry of its `sprints` trend array. Those disagree on purpose: the trend's
// last entry is whatever starts latest, including a sprint nobody has touched
// yet, which is the bug this card used to display.
function VelocityStatCard({ completedSprint, loading, error }) {
  if (loading) {
    return <p className="charter-status">Loading...</p>
  }
  if (error) {
    return <p className="charter-status">{error}</p>
  }

  if (!completedSprint) {
    return <p className="charter-status">{NO_COMPLETED_SPRINT_COPY}</p>
  }

  const { name, completedAt, committed, completed } = completedSprint
  const when = completedAt ? `, completed ${formatDayMonth(completedAt)}` : ''

  // A closed-out sprint whose items were never pointed has no ratio to show,
  // but it is still a real completed sprint - saying so beats falling back to
  // the "nothing qualifies" copy above, which would be wrong.
  if (!committed) {
    return (
      <p className="charter-status">
        {name}
        {when} — no story-point estimates to measure velocity against.
      </p>
    )
  }

  return (
    <>
      <span className="overview-stat-value">{Math.round((completed / committed) * 100)}%</span>
      <p className="overview-stat-caption">
        {name}
        {when} — {completed}/{committed} pts
      </p>
    </>
  )
}

// The headline count, and the same number the section heading badge shows.
// It's the sum of the hotspot breakdown rows rendered beside it (see
// buildHotspotRows) - not useCriticalIssues' `issues.length`, which counts a
// different set entirely.
function HotspotCountStatCard({ total, pending }) {
  return (
    <>
      <span className={`overview-stat-value ${total > 0 ? 'critical' : 'done'}`}>{total}</span>
      <p className="overview-stat-caption">
        {pending
          ? 'Sprint data still loading — not counted yet'
          : `Open hotspot${total === 1 ? '' : 's'} across the categories below`}
      </p>
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
// Each row links to the Risk Log section (its own top-level nav destination
// now - ProjectDocSectionRoutes.jsx's RiskLogRoute, which was Documents >
// Risk Log before the IA restructure) with both riskFilter and riskId:
// riskFilter is the severity view to land on, riskId is the row
// RiskLogView.jsx flashes on arrival.
//
// Capped at KEY_RISK_LIMIT rows. The list used to be unbounded, so a project
// with fifteen High risks rendered fifteen cards and pushed everything under
// it off the fold - the point of this panel is the worst few, and the sort
// above already guarantees those are the ones at the top.
const RISK_BAND_ORDER = { Critical: 0, High: 1 }
const KEY_RISK_LIMIT = 4

function riskLinkTo(projectId, risk) {
  const params = new URLSearchParams({ riskFilter: risk.band })
  if (risk.id) params.set('riskId', risk.id)
  return `/projects/${projectId}/risk-log?${params}`
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

  const shown = keyRisks.slice(0, KEY_RISK_LIMIT)
  const hidden = keyRisks.length - shown.length

  return (
    <>
      {keyRisks.length === 0 ? (
        <p className="charter-status">No Critical or High risks — nothing above the Medium band.</p>
      ) : (
        <ul className="key-risk-list">
          {shown.map((risk) => (
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

      {/* Deliberately not the plain "showing X of Y" tail Team Hotspots and
          Upcoming Milestones use - those tails are a footnote about a table
          that's already telling the whole story, whereas hidden Critical/High
          risks are themselves the thing a PM needs to go look at. Reads as a
          continuation of the list (same row shape, dashed edge) and links to
          the unfiltered Risk Log so every band is visible on arrival. */}
      {hidden > 0 && (
        <Link to={`/projects/${project.id}/risk-log`} className="key-risk-more">
          <span className="key-risk-more-ellipsis" aria-hidden="true">
            •••
          </span>
          +{hidden} more Critical/High risk{hidden === 1 ? '' : 's'} in the Risk Log
        </Link>
      )}

      {lowerBands.length > 0 && (
        <p className="key-risk-tail">
          Also logged:{' '}
          {lowerBands.map((level, i) => (
            <span key={level}>
              {i > 0 && ', '}
              <Link to={`/projects/${project.id}/risk-log?riskFilter=${level}`}>
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

// The four hotspot categories as one data array rather than four separate
// badge cards, so the breakdown that renders them and the "N Hotspots" count
// in the section heading are computed from the same source and can't disagree
// - which is exactly what they used to do (the heading read
// useCriticalIssues' issues.length, which counts every High/Critical risk but
// no Issue Log entries and no overdue sprints at all).
//
// Which rows exist is methodology-gated, same gates the old cards carried:
// Delayed Tasks and Overdue Phases are Waterfall-side concepts (every Agile
// task has backlog_status set, and phases don't exist for pure Agile), and
// Overdue Sprints only exists where sprints do. Issues are universal.
//
// Delayed Task / Overdue Phase counts come off useCriticalIssues' `issues`
// array rather than recomputing from tasks/phases, so those two rows stay
// consistent with the Key Risks list, which reads the same array.
//
// `pending` carries the sprint query's loading/error state - a row with it set
// renders that text instead of a number and is left out of the total, since
// counting an unknown as zero would quietly understate the headline figure.
//
// Deep links are unchanged: IssuesLogRoute's 'OpenGroup' (a deep-link-only
// value combining Open/In Progress/Blocked - see IssueLogView.jsx),
// PlanningTasksRoute's ?taskFilter=delayed, PlanningPhasesRoute's
// ?phaseFilter=overdue, and Sprint Board's ?sprintFilter=overdue.
function buildHotspotRows({
  project,
  issues,
  openIssues,
  overdueSprints,
  velocityLoading,
  velocityError,
  showDelayedTasks,
  showPhases,
  showVelocity,
}) {
  const rows = [
    {
      key: 'issues',
      label: 'Open issues',
      count: openIssues,
      to: `/projects/${project.id}/issues-log?issueFilter=OpenGroup`,
    },
  ]

  if (showDelayedTasks) {
    rows.push({
      key: 'delayed-tasks',
      label: 'Delayed tasks',
      count: issues.filter((i) => i.type === 'Delayed Task').length,
      to: `/projects/${project.id}/planning/tasks?taskFilter=delayed`,
    })
  }

  if (showPhases) {
    rows.push({
      key: 'overdue-phases',
      label: 'Overdue phases',
      count: issues.filter((i) => i.type === 'Overdue Phase').length,
      to: `/projects/${project.id}/planning/phases?phaseFilter=overdue`,
    })
  }

  if (showVelocity) {
    rows.push({
      key: 'overdue-sprints',
      label: 'Overdue sprints',
      count: overdueSprints.length,
      to: `/projects/${project.id}/execution/sprint-board?sprintFilter=overdue`,
      pending: velocityLoading ? 'Loading...' : velocityError ? 'Unavailable' : null,
    })
  }

  return rows
}

// Label/value rows rather than the pill cards this replaces - the pills were
// sized for a full-width row of their own, and this panel is now half the
// page beside the velocity chart. A zero stays plain text: only a non-zero
// count is a link, since there's nothing to look at behind a zero.
function HotspotBreakdown({ rows }) {
  return (
    <ul className="overview-hotspot-rows">
      {rows.map((row) => (
        <li key={row.key} className="overview-hotspot-row">
          <span className="overview-hotspot-row-label">{row.label}</span>
          {row.pending ? (
            <span className="overview-hotspot-row-pending">{row.pending}</span>
          ) : row.count > 0 ? (
            <Link to={row.to} className="overview-hotspot-row-count critical">
              {row.count}
            </Link>
          ) : (
            <span className="overview-hotspot-row-count done">0</span>
          )}
        </li>
      ))}
    </ul>
  )
}

const VELOCITY_SPRINT_LIMIT = 5

// The single-sprint headline figure, deliberately stricter than the trend
// below it. A sprint counts as completed only when every linked item is
// board_status 'done' - and it has at least one linked item, since an empty
// sprint satisfies "all done" vacuously - AND its retro is locked. Most
// recent = newest retro lock time, not the latest start_date the trend uses:
// a sprint created and pointed for next month is "latest by start_date"
// while showing nothing done, which is exactly how this figure came to read
// 0% on projects delivering perfectly well.
//
// Neither signal alone holds up in the real data: retros get locked early,
// before the work lands, and "all items done" carries no timestamp to order
// by. Locking is the one explicit "this sprint is closed" act a PM performs,
// and a locked retro is read-only (SprintRetroView's effectiveCanEdit), so
// its updated_at stops moving at the lock.
//
// Byte-for-byte the same rule as project-eval/index.ts's
// mostRecentCompletedSprint(), duplicated rather than shared because Edge
// Functions are self-contained single files here with no import path back
// into src/. Change one, change the other.
//
// Returns null when nothing qualifies - the caller must render that as its
// own state, never as 0%.
function pickCompletedSprint(sprints, bySprintId, retros) {
  const lockedRetroBySprintId = new Map()
  ;(retros || []).forEach((r) => {
    if (r.is_locked) lockedRetroBySprintId.set(r.sprint_id, r)
  })

  const qualifying = (sprints || [])
    .map((s) => ({ sprint: s, agg: bySprintId.get(s.id), retro: lockedRetroBySprintId.get(s.id) }))
    .filter(({ agg, retro }) => agg && agg.total > 0 && agg.done === agg.total && retro)
    .sort((a, b) => (b.retro.updated_at || '').localeCompare(a.retro.updated_at || ''))

  if (qualifying.length === 0) return null

  const { sprint, agg, retro } = qualifying[0]
  return {
    name: sprint.name,
    completedAt: retro.updated_at || null,
    committed: agg.committed,
    completed: agg.completed,
  }
}

// Mirrors project-eval/index.ts's velocityStats() (committed-vs-completed
// story points per sprint, chronological, capped to the most recent 5
// sprints with committed points) but as a live client query instead of
// text fed to Claude - that function's output never gets persisted as
// structured data, so there's nothing to read it back from. Project-wide
// (no milestone_id scoping). This `sprints` array is the trend the chart
// draws; the separate completedSprint below is the headline figure, and the
// two answer different questions - an unstarted sprint belongs in a trend
// line and doesn't belong in a velocity percentage.
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
//
// The load is a useCallback rather than a plain function inside the effect
// so the Update Progress button can re-run it (see useProgressRefresh's
// onVelocityRefresh). Without that, refreshing Progress would leave the
// Sprint Velocity card beside it describing an older instant - which is
// what the old liveMetrics prop on VelocityStatCard existed to paper over.
//
// No cancellation flag here: unlike the mount effect, a refresh triggered by
// a click has no unmount race worth guarding, and React drops setState on an
// unmounted component harmlessly. The effect below still guards its own run.
function useSprintVelocity(projectId, enabled) {
  const [sprints, setSprints] = useState([])
  const [completedSprint, setCompletedSprint] = useState(null)
  const [overdueSprints, setOverdueSprints] = useState([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState(null)

  const load = useCallback(
    async function load(isCancelled = () => false) {
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

      if (isCancelled()) return

      const firstError = sprintRes.error || taskRes.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      // sprint_retros has no project_id - it hangs off sprint_id only (see
      // sprint_retros_schema.sql), so this can't join the parallel batch
      // above; it needs the sprint ids first. Same two-step
      // ProjectDetailLayout's loadSprints/retro fetch already does. Skipped
      // entirely when the project has no sprints.
      const sprintIds = (sprintRes.data || []).map((s) => s.id)
      let retroData = []
      if (sprintIds.length > 0) {
        const retroRes = await supabase
          .from('sprint_retros')
          .select('sprint_id, is_locked, updated_at')
          .in('sprint_id', sprintIds)

        if (isCancelled()) return

        if (retroRes.error) {
          setError(retroRes.error.message)
          setLoading(false)
          return
        }
        retroData = retroRes.data || []
      }

      const bySprintId = new Map()
      ;(taskRes.data || []).forEach((t) => {
        const entry = bySprintId.get(t.sprint_id) || { total: 0, done: 0, committed: 0, completed: 0 }
        entry.total += 1
        entry.committed += t.story_points ?? 0
        if (t.board_status === 'done') {
          entry.done += 1
          entry.completed += t.story_points ?? 0
        }
        bySprintId.set(t.sprint_id, entry)
      })

      const relevant = (sprintRes.data || [])
        .filter((s) => bySprintId.has(s.id))
        .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || '') || (a.created_at || '').localeCompare(b.created_at || ''))
        .slice(-VELOCITY_SPRINT_LIMIT)
        .map((s) => ({ name: s.name, ...bySprintId.get(s.id) }))

      setSprints(relevant)
      setCompletedSprint(pickCompletedSprint(sprintRes.data || [], bySprintId, retroData))

      const todayStr = new Date().toISOString().slice(0, 10)
      const overdue = (sprintRes.data || [])
        .filter((s) => isSprintOverdue(s, taskRes.data || [], todayStr))
        .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
        .map((s) => ({ id: s.id, name: s.name, end_date: s.end_date }))

      setOverdueSprints(overdue)
      setLoading(false)
    },
    [projectId]
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    load(() => cancelled)

    return () => {
      cancelled = true
    }
  }, [enabled, load])

  // Guarded rather than handed out raw: on Waterfall this hook never runs
  // (enabled is false) and its state is permanently empty, so re-running the
  // query on an Update Progress click there would issue two pointless
  // requests and flip `loading` on a card that isn't rendered.
  const refresh = useCallback(() => {
    if (enabled) load()
  }, [enabled, load])

  return { sprints, completedSprint, overdueSprints, loading, error, refresh }
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
// Sprint Board / Gantt Chart. Laid out as four bands, top to bottom:
//
//   1. Metric row - Status / Progress / (Hybrid only) Sprint Velocity /
//      Hotspots, as compact one-number stat cards. Status and Progress are a
//      snapshot of the last Evaluate Project run; the other two are live.
//      Progress and Sprint Velocity are both moved by the Update Progress
//      button (see useProgressRefresh), which persists its result onto the
//      latest evaluation row rather than holding it in component state.
//   2. Sprint Velocity chart beside the hotspot breakdown - the metric row's
//      Hotspots number is the sum of that breakdown, and the velocity chart
//      is the trend behind the metric row's velocity figure, so each half of
//      this row is the detail behind a card directly above it. Waterfall has
//      no velocity at all (visibleSides().agile), and the breakdown then
//      takes the full width on its own - .overview-split-row is an auto-fit
//      grid, so a single child fills the row rather than sitting half-empty.
//   3. Key Risks, full width - itemized rows that need the horizontal space.
//   4. Team Hotspots beside Upcoming Milestones - two narrow tables that fit
//      side by side and used to burn a full page-width row each.
//
// The section heading's hotspot badge reads hotspotTotal, NOT
// useCriticalIssues' issues.length. Those two count different things (see
// buildHotspotRows) and the old heading disagreed with the breakdown right
// underneath it. useCriticalIssues is untouched - `issues` still feeds the
// Key Risks list and two of the breakdown rows.
function KeyMetricsDashboard({
  project,
  canEdit,
  tasks,
  phases,
  milestones,
  collaborators,
  riskLog,
  issueLog,
  evaluations,
  evaluationsLoading,
  onMetricsPersisted,
  expanded,
}) {
  const issues = useCriticalIssues(project, tasks, phases, riskLog)
  // Latest project_evaluations row, off the same docs.project_evaluation array
  // the Project Evaluation section on this page renders (loaded newest-first by
  // ProjectDetailLayout's loadDocs) rather than a query of this component's
  // own. That query duplicated work the layout had already done, and - now
  // that Evaluate Project runs from Overview itself - would have left these two
  // cards showing a stale snapshot until the next remount.
  //
  // It's also what Update Progress writes back through: onMetricsPersisted
  // patches this same array upstream, so a refreshed metrics object lands
  // here on the next render with no re-fetch.
  const evaluation = evaluations && evaluations.length > 0 ? evaluations[0] : null
  const evalLoading = evaluationsLoading
  const showVelocity = visibleSides(project.methodology).agile
  const {
    sprints: velocitySprints,
    completedSprint,
    overdueSprints,
    loading: velocityLoading,
    error: velocityError,
    refresh: refreshVelocity,
  } = useSprintVelocity(project.id, showVelocity)
  const {
    unsavedMetrics,
    refreshing: metricsRefreshing,
    error: metricsError,
    refresh: refreshMetrics,
  } = useProgressRefresh(project, evaluation?.id ?? null, onMetricsPersisted, refreshVelocity)
  // Phases don't exist as a concept for pure Agile (see useCriticalIssues'
  // own methodology gate above) - hide the sub-group entirely there rather
  // than showing a permanent, meaningless "0 overdue".
  const showPhases = project.methodology !== 'agile'
  // Delayed Tasks is Waterfall-side only (see useCriticalIssues' own
  // backlog_status == null scoping - it's always 0 for pure Agile since
  // every Agile task has backlog_status set) - Agile gets Overdue Sprints
  // in its place instead, Hybrid keeps both.
  const showDelayedTasks = project.methodology !== 'agile'
  // Hybrid only. Agile's Progress card is already a velocity figure
  // (progressFromMetrics reads velocity_ratio there), so a second velocity
  // card would be the same measurement twice; Waterfall has no sprints.
  const showLatestVelocity = showVelocity && project.methodology === 'hybrid'

  const { open: openIssues, closed: closedIssues } = useIssueStatusCounts(issueLog)

  const hotspotRows = useMemo(
    () =>
      buildHotspotRows({
        project,
        issues,
        openIssues,
        overdueSprints,
        velocityLoading,
        velocityError,
        showDelayedTasks,
        showPhases,
        showVelocity,
      }),
    [
      project,
      issues,
      openIssues,
      overdueSprints,
      velocityLoading,
      velocityError,
      showDelayedTasks,
      showPhases,
      showVelocity,
    ]
  )

  // Rows still waiting on (or failing) the sprint query contribute nothing
  // rather than a zero - see buildHotspotRows. hotspotPending is what tells
  // the count card to say so instead of presenting a partial sum as final.
  const hotspotTotal = hotspotRows.reduce((sum, row) => sum + (row.pending ? 0 : row.count), 0)
  const hotspotPending = hotspotRows.some((row) => row.pending)

  return (
    <div className="detail-zone key-metrics-dashboard">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Overview</span>
        <span className={`doc-status-badge ${hotspotTotal > 0 ? 'critical' : 'done'}`}>
          {hotspotTotal > 0 ? `${hotspotTotal} Hotspot${hotspotTotal === 1 ? '' : 's'}` : 'All Clear'}
        </span>
      </h2>

      {expanded && (
        <div className="key-metrics-body">
          <div className="overview-stat-grid">
            <StatCard label="Project Status">
              <ProjectStatusCard evaluation={evaluation} loading={evalLoading} />
            </StatCard>

            {/* Gated on canEdit: Update Progress writes now (it persists the
                recomputed metrics onto the latest evaluation row), so it's
                an edit action like the Evaluate Project button below, and
                RLS would refuse it for a viewer anyway. */}
            <StatCard
              label="Progress"
              action={
                canEdit ? (
                  <LoadingButton
                    className="stat-action-btn"
                    loading={metricsRefreshing}
                    loadingLabel="Updating"
                    onClick={refreshMetrics}
                    title={
                      showLatestVelocity
                        ? 'Recompute and save Progress and Sprint Velocity from current project data. Does not create a new evaluation.'
                        : 'Recompute and save this figure from current project data. Does not create a new evaluation.'
                    }
                  >
                    <span className="stat-action-icon" aria-hidden="true">
                      ↻
                    </span>
                    Update Progress
                  </LoadingButton>
                ) : null
              }
            >
              <ProgressStatCard
                project={project}
                evaluation={evaluation}
                loading={evalLoading}
                unsavedMetrics={unsavedMetrics}
              />
              {metricsError && <p className="overview-stat-error">{metricsError}</p>}
            </StatCard>

            {showLatestVelocity && (
              <StatCard label="Sprint Velocity">
                {/* Reads its own live query, which the Update Progress button
                    above re-runs on the same click - so both cards still move
                    together, and this one keeps the point counts the metrics
                    object can't carry. Only rendered on Hybrid, where Progress
                    carries Waterfall-side task completion and velocity is the
                    genuinely separate second signal. */}
                <VelocityStatCard
                  completedSprint={completedSprint}
                  loading={velocityLoading}
                  error={velocityError}
                />
              </StatCard>
            )}

            <StatCard label="Hotspots">
              <HotspotCountStatCard total={hotspotTotal} pending={hotspotPending} />
            </StatCard>
          </div>

          <div className="overview-split-row">
            {showVelocity && (
              <div className="key-metrics-panel">
                <h3 className="key-metrics-panel-heading">Sprint Velocity</h3>
                <SprintVelocityCard sprints={velocitySprints} loading={velocityLoading} error={velocityError} />
              </div>
            )}

            <div className="key-metrics-panel">
              <h3 className="key-metrics-panel-heading">Project Hotspots</h3>
              <HotspotBreakdown rows={hotspotRows} />
              {closedIssues > 0 && (
                <p className="key-risk-tail">
                  <Link to={`/projects/${project.id}/issues-log?issueFilter=Closed`}>
                    {closedIssues} closed issue{closedIssues === 1 ? '' : 's'}
                  </Link>{' '}
                  — not counted as a hotspot.
                </p>
              )}
            </div>
          </div>

          <div className="key-metrics-panel">
            <h3 className="key-metrics-panel-heading">Key Risks</h3>
            <KeyRisksCard project={project} riskLog={riskLog} issues={issues} />
          </div>

          <div className="overview-split-row">
            <div className="key-metrics-panel">
              <h3 className="key-metrics-panel-heading">Team Hotspots</h3>
              <TeamHotspotsCard project={project} tasks={tasks} collaborators={collaborators || []} />
            </div>

            <div className="key-metrics-panel">
              <h3 className="key-metrics-panel-heading">Upcoming Milestones</h3>
              <UpcomingMilestonesCard milestones={milestones} tasks={tasks} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default KeyMetricsDashboard
