// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "project-eval"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> project-eval -> Secrets before invoking.
//
// Evaluate Project is a one-shot, read-only diagnostic - no Q&A intake, no
// PM editing, nothing it does ever writes back to tasks/budget/risks. The
// one thing that makes this different from every other doc type's edge
// function: the numbers it needs (overdue tasks/phases, budget
// variance, risk age, sprint velocity) have to be arithmetically exact,
// and LLMs are unreliable at date math and counting over a raw list. So
// this function computes every derived stat in plain code first and hands
// Claude already-computed facts to synthesize/narrate, rather than asking
// it to do the counting itself.
//
// Methodology-aware: `tasks` holds both classic Waterfall tasks and
// Backlog/Sprint items in one table, distinguished only by backlog_status
// (null = task, set = backlog item - same filter GanttChart.jsx/
// BacklogView.jsx already use). Earlier this function ran taskStats over
// the raw unfiltered array for every methodology, which silently produced
// wrong numbers for Agile/Hybrid (backlog items never set the `completed`
// column Backlog/Sprint Board doesn't use, so "% tasks complete" read as
// a bogus 0% while real progress lived in backlog_status/board_status
// instead). Now: Waterfall primary signal = phases + their linked
// Waterfall tasks; Agile primary signal = sprint velocity + backlog
// health + locked retro themes, no dates/overdue framing since Agile has
// no fixed schedule; Hybrid leads with phases (like Waterfall) for the
// schedule signal and pulls in velocity/backlog/retro evidence for
// whichever Epic(s) still have incomplete linked work, as supporting
// context for that Epic's progress. Risks and budget stay in the
// evaluation across all three, unscoped.
//
// Milestones (the `milestones` table / tasks.milestone_id) are Epics -
// dateless grouping containers for Hybrid backlog work as of the Epic UI
// rework (see BacklogView.jsx). They no longer carry a schedule verdict
// here (no "OVERDUE milestone" framing) - only completion progress. The
// date-driven "on track vs. overdue against a range" signal that used to
// live on milestones now lives on Phases instead, which still have real
// dates (phases_schema.sql's effective_start_date/effective_end_date) and
// are Waterfall-task-scoped via tasks.phase_id. Note this means the
// overdue/schedule signal only covers Waterfall-side tasks - backlog
// items never carry a phase_id, so Hybrid's backlog/Agile-side work has
// no schedule-overdue signal in this function (a known scope limit, not
// something this pass tries to fix).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"
const DAY_MS = 24 * 60 * 60 * 1000

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim())
}

async function callClaude(system, user, attempt = 1) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY secret is not set")

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      // Bumped from 3000 - a dense, fully-cross-referenced rationale plus
      // up to 5 recommendations already sat close to that ceiling before,
      // and the methodology-aware version adds meaningfully more context
      // (per-phase breakdowns, per-Epic evidence, multi-sprint velocity
      // series, retro excerpts) for Claude to cross-reference. max_tokens
      // is only a ceiling, so raising it doesn't force longer output.
      // Matches the fixed ceiling task-gen/backlog-gen/milestone-gen
      // already use.
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    // 429 (rate limited) and 5xx/529 (overloaded/transient) are worth a
    // retry; anything else (bad request, auth, etc.) is not.
    const retryable = resp.status === 429 || resp.status === 529 || resp.status >= 500
    if (retryable && attempt < 3) {
      await new Promise((r) => setTimeout(r, 500 * attempt))
      return callClaude(system, user, attempt + 1)
    }
    throw new Error(`Anthropic API error (${resp.status}): ${errText}`)
  }

  // The fetch to Anthropic occasionally returns a truncated/empty body from
  // this runtime. Retry a couple of times before giving up.
  const rawBody = await resp.text()
  let data
  try {
    data = JSON.parse(rawBody)
  } catch {
    if (attempt < 3) return callClaude(system, user, attempt + 1)
    throw new Error(
      `Anthropic response was not valid JSON after ${attempt} attempts`
    )
  }

  // Find the first text block rather than assuming index 0, since some
  // responses include a non-text block (e.g. reasoning) before the text.
  const textBlock = (data.content || []).find((block) => block.type === "text")
  const text = textBlock?.text ?? ""
  try {
    return extractJson(text)
  } catch {
    if (attempt < 3) return callClaude(system, user, attempt + 1)
    const blockTypes = (data.content || []).map((b) => b.type).join(", ")
    throw new Error(
      `Could not parse Claude's response as JSON after ${attempt} attempts. ` +
        `stop_reason=${data.stop_reason}, content block types=[${blockTypes}], text="${text.slice(0, 200)}"`
    )
  }
}

function projectContext(project) {
  return `Project name: ${project.name}
Goal: ${project.goal}
Priority: ${project.priority}
Deadline: ${project.deadline ?? "TBD"}
Status: ${project.status}
Methodology: ${project.methodology}`
}

function parseDay(dateStr) {
  return new Date(`${dateStr}T00:00:00`).getTime()
}

function daysBetween(aStr, bStr) {
  return Math.round((parseDay(bStr) - parseDay(aStr)) / DAY_MS)
}

const CHARTER_SECTION_LABELS = {
  purpose: "Purpose",
  scope: "Scope",
  stakeholders: "Stakeholders",
  success_metrics: "Success Metrics",
  risks: "Risks",
  timeline: "Timeline",
}

function charterText(charter) {
  if (!charter) return null
  return Object.entries(CHARTER_SECTION_LABELS)
    .map(([key, label]) => `${label}: ${charter[key] || "(empty)"}`)
    .join("\n")
}

// There's no per-risk resolved flag or timestamp in the risk log schema -
// every risk currently in the log is "open" by definition (a risk the PM
// considers resolved gets deleted from the log), and the only age signal
// available is the whole log's own created_at. So "how long has this been
// open" is reported as an honest log-level proxy, not a fabricated
// per-risk date.
function riskStats(riskLog, today) {
  const risks = riskLog?.risks || []
  const high = risks.filter((r) => r.impact === "High")
  const logAgeDays = riskLog?.created_at ? daysBetween(riskLog.created_at.slice(0, 10), today) : null
  return { risks, high, logAgeDays }
}

function riskStatsText(stats) {
  if (stats.risks.length === 0) return null
  const lines = stats.risks.map(
    (r, i) =>
      `${i + 1}. ${r.risk} | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Mitigation: ${r.mitigation || "(none)"}`
  )
  const ageNote =
    stats.logAgeDays != null
      ? `This risk log has been active for ${stats.logAgeDays} day(s) (no per-risk resolution tracking exists, so treat all listed risks as currently open).`
      : ""
  return `${lines.join("\n")}\n\n${stats.high.length} of these are High-impact. ${ageNote}`
}

function budgetStats(budget) {
  const items = budget?.line_items || []
  const totalEstimated = items.reduce((sum, r) => sum + (Number(r.estimated_amount) || 0), 0)
  const totalActual = items.reduce((sum, r) => sum + (Number(r.actual_amount) || 0), 0)
  const variance = totalActual - totalEstimated
  const variancePct = totalEstimated > 0 ? (variance / totalEstimated) * 100 : null

  const byCategory = new Map()
  items.forEach((r) => {
    const key = r.category || "Uncategorized"
    const entry = byCategory.get(key) || { estimated: 0, actual: 0 }
    entry.estimated += Number(r.estimated_amount) || 0
    entry.actual += Number(r.actual_amount) || 0
    byCategory.set(key, entry)
  })

  return { items, totalEstimated, totalActual, variance, variancePct, byCategory }
}

function budgetStatsText(stats) {
  if (stats.items.length === 0) return null
  const categoryLines = [...stats.byCategory.entries()].map(([cat, v]) => {
    const catVariance = v.actual - v.estimated
    const catPct = v.estimated > 0 ? (catVariance / v.estimated) * 100 : null
    return `- ${cat}: estimated $${v.estimated.toFixed(2)}, actual $${v.actual.toFixed(2)}${catPct != null ? ` (${catPct >= 0 ? "+" : ""}${catPct.toFixed(1)}%)` : ""}`
  })
  return `${categoryLines.join("\n")}\n\nOverall: estimated $${stats.totalEstimated.toFixed(2)}, actual $${stats.totalActual.toFixed(2)}, variance ${stats.variance >= 0 ? "+" : ""}$${stats.variance.toFixed(2)}${stats.variancePct != null ? ` (${stats.variancePct >= 0 ? "+" : ""}${stats.variancePct.toFixed(1)}%)` : ""}`
}

// Waterfall-side task stats - called only on tasks with backlog_status ==
// null (see the module comment). Unchanged logic from before this
// refactor, just scoped to the right subset now.
function taskStats(tasks, today, firstDependsOnByTaskId) {
  const list = tasks || []
  const incomplete = list.filter((t) => !t.completed)
  const overdue = incomplete
    .filter((t) => t.due_date && t.due_date < today)
    .map((t) => ({ ...t, daysOverdue: daysBetween(t.due_date, today) }))
  const upcoming = incomplete.filter(
    (t) => t.due_date && t.due_date >= today && daysBetween(today, t.due_date) <= 14
  )

  const byId = new Map(list.map((t) => [t.id, t]))
  const blockedCounts = new Map()
  incomplete.forEach((t) => {
    const dependsOnId = firstDependsOnByTaskId?.get(t.id)
    if (dependsOnId) {
      const blocker = byId.get(dependsOnId)
      if (blocker && !blocker.completed) {
        blockedCounts.set(dependsOnId, (blockedCounts.get(dependsOnId) || 0) + 1)
      }
    }
  })
  const blockers = [...blockedCounts.entries()]
    .map(([id, count]) => ({ task: byId.get(id), count }))
    .filter((b) => b.task)
    .sort((a, b) => b.count - a.count)

  const starts = list.map((t) => t.start_date).filter(Boolean)
  const earliestStart = starts.length ? starts.sort()[0] : null
  const daysElapsed = earliestStart ? daysBetween(earliestStart, today) : null
  const pctComplete = list.length > 0 ? (list.length - incomplete.length) / list.length : null

  return { total: list.length, completedCount: list.length - incomplete.length, overdue, upcoming, blockers, daysElapsed, pctComplete }
}

function taskStatsText(stats) {
  if (stats.total === 0) return null
  const parts = [
    `${stats.completedCount} of ${stats.total} tasks completed${stats.pctComplete != null ? ` (${(stats.pctComplete * 100).toFixed(0)}%)` : ""}.`,
  ]
  if (stats.daysElapsed != null) parts.push(`${stats.daysElapsed} day(s) since the earliest task start date.`)
  if (stats.overdue.length > 0) {
    parts.push(
      `${stats.overdue.length} task(s) overdue: ${stats.overdue.map((t) => `"${t.title}" (${t.daysOverdue} day(s) overdue)`).join(", ")}.`
    )
  } else {
    parts.push("No tasks are currently overdue.")
  }
  if (stats.upcoming.length > 0) {
    parts.push(
      `${stats.upcoming.length} task(s) due within 14 days: ${stats.upcoming.map((t) => `"${t.title}" (due ${t.due_date})`).join(", ")}.`
    )
  }
  if (stats.blockers.length > 0) {
    parts.push(
      `Dependency chokepoints: ${stats.blockers.map((b) => `"${b.task.title}" is blocking ${b.count} other incomplete task(s)`).join("; ")}.`
    )
  }
  return parts.join(" ")
}

// Per-Epic exact facts: completion of whatever's linked to it via
// milestone_id (union of Waterfall tasks and backlog items - covers
// Hybrid's dual usage naturally, degrades to just tasks for pure
// Waterfall since backlogItems is always empty there). Epics are dateless
// grouping containers now (see the module comment above) - progress only,
// no schedule verdict.
function milestoneStats(milestones, waterfallTasks, backlogItems) {
  const list = milestones || []
  return list.map((m) => {
    const linked = [
      ...waterfallTasks.filter((t) => t.milestone_id === m.id),
      ...backlogItems.filter((t) => t.milestone_id === m.id),
    ]
    const linkedTotal = linked.length
    const linkedCompleted = linked.filter((t) =>
      t.backlog_status != null ? t.backlog_status === "done" : !!t.completed
    ).length
    const linkedIncomplete = linkedTotal - linkedCompleted

    return { milestone: m, linked, linkedTotal, linkedCompleted, linkedIncomplete }
  })
}

function milestoneStatsText(stats) {
  if (stats.length === 0) return null
  const lines = stats.map((s) => {
    const itemsLabel = s.linkedTotal === 0 ? "no items linked yet" : `${s.linkedCompleted} of ${s.linkedTotal} linked item(s) complete`
    return `- "${s.milestone.name}": ${itemsLabel}.`
  })
  return lines.join("\n")
}

// Per-phase exact facts: date-range status against today, and completion
// of whatever Waterfall task is linked to it via phase_id. This is the
// schedule/overdue signal that used to live on milestones (see the module
// comment above) - phases still carry real dates
// (effective_start_date/effective_end_date, phases_schema.sql), Epics no
// longer do. Only Waterfall tasks carry a phase_id (backlog items never
// do), so this signal doesn't cover Hybrid's backlog/Agile-side work.
//
// The core signal this exists to catch: an end_date that has already
// passed while linked tasks are still incomplete. That's computed here as
// an explicit `overdue` flag with exact days-overdue, not left as a soft
// "the date is in the past" fact for Claude to (possibly) soften.
function phaseStats(phases, waterfallTasks, today) {
  const list = [...(phases || [])].sort((a, b) => a.phase_number - b.phase_number)
  return list.map((p) => {
    const linked = waterfallTasks.filter((t) => t.phase_id === p.id)
    const linkedTotal = linked.length
    const linkedCompleted = linked.filter((t) => !!t.completed).length
    const linkedIncomplete = linkedTotal - linkedCompleted

    const hasDates = !!(p.effective_start_date && p.effective_end_date)
    let dateStatus = "undated"
    let daysOverdue = null
    let daysUntilStart = null
    let daysUntilEnd = null

    if (hasDates) {
      if (today < p.effective_start_date) {
        dateStatus = "upcoming"
        daysUntilStart = daysBetween(today, p.effective_start_date)
      } else if (today <= p.effective_end_date) {
        dateStatus = "active"
        daysUntilEnd = daysBetween(today, p.effective_end_date)
      } else {
        dateStatus = "past"
        daysOverdue = daysBetween(p.effective_end_date, today)
      }
    }

    const overdue = dateStatus === "past" && linkedIncomplete > 0

    return { phase: p, linked, linkedTotal, linkedCompleted, linkedIncomplete, dateStatus, daysOverdue, daysUntilStart, daysUntilEnd, overdue }
  })
}

function phaseStatsText(stats) {
  if (stats.length === 0) return null
  const lines = stats.map((s) => {
    const p = s.phase
    const dateLabel = s.dateStatus === "undated" ? "no dates yet" : `${p.effective_start_date} to ${p.effective_end_date}`

    let statusLabel
    if (s.overdue) {
      statusLabel = `OVERDUE by ${s.daysOverdue} day(s) - end date has passed with incomplete linked tasks`
    } else if (s.dateStatus === "past" && s.linkedTotal === 0) {
      statusLabel = "end date passed, but no tasks are linked to this phase - completion can't be verified from the data"
    } else if (s.dateStatus === "past") {
      statusLabel = "end date passed, all linked tasks complete"
    } else if (s.dateStatus === "active") {
      statusLabel = `in progress, ${s.daysUntilEnd} day(s) until end date`
    } else if (s.dateStatus === "upcoming") {
      statusLabel = `upcoming, starts in ${s.daysUntilStart} day(s)`
    } else {
      statusLabel = "no dates set yet to judge schedule against"
    }

    const itemsLabel = s.linkedTotal === 0 ? "no tasks linked yet" : `${s.linkedCompleted} of ${s.linkedTotal} linked task(s) complete`

    return `- "${p.phase_name}" (${dateLabel}): ${statusLabel}. ${itemsLabel}.`
  })
  return lines.join("\n")
}

// Committed-vs-completed story points per sprint, chronological, capped to
// the most recent 5 sprints that actually have committed points (bounded
// enough to read as a trend without diluting into long-past noise - same
// spirit as taskStats' 14-day upcoming cutoff). Optionally scoped to only
// backlog items carrying a given milestone_id, for Hybrid's per-Epic
// evidence.
function velocityStats(sprints, backlogItems, milestoneId) {
  const scoped = milestoneId != null ? backlogItems.filter((t) => t.milestone_id === milestoneId) : backlogItems

  const bySprintId = new Map()
  scoped.forEach((t) => {
    if (!t.sprint_id) return
    const entry = bySprintId.get(t.sprint_id) || { committed: 0, completed: 0 }
    entry.committed += t.story_points ?? 0
    if (t.board_status === "done") entry.completed += t.story_points ?? 0
    bySprintId.set(t.sprint_id, entry)
  })

  const relevantSprints = (sprints || [])
    .filter((s) => bySprintId.has(s.id))
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || "") || (a.created_at || "").localeCompare(b.created_at || ""))

  return relevantSprints.slice(-5).map((s) => ({ sprint: s, ...bySprintId.get(s.id) }))
}

function velocityStatsText(stats) {
  if (stats.length === 0) return null
  return stats
    .map(({ sprint, committed, completed }) => {
      const pct = committed > 0 ? Math.round((completed / committed) * 100) : null
      const dateRange = sprint.start_date ? ` (${sprint.start_date} to ${sprint.end_date ?? "TBD"})` : ""
      return `- ${sprint.name}${dateRange}: committed ${committed} pt(s), completed ${completed} pt(s)${pct != null ? ` (${pct}%)` : ""}.`
    })
    .join("\n")
}

// Backlog pipeline health: counts by backlog_status, plus an "ungroomed"
// proxy (sitting in plain backlog status with no story-point estimate yet
// - the concrete sign nobody's triaged it). Optionally scoped to a
// milestone_id for Hybrid's per-Epic evidence.
function backlogHealthStats(backlogItems, milestoneId) {
  const scoped = milestoneId != null ? backlogItems.filter((t) => t.milestone_id === milestoneId) : backlogItems
  const byStatus = { backlog: 0, ready: 0, in_sprint: 0, done: 0 }
  let ungroomed = 0
  scoped.forEach((t) => {
    if (t.backlog_status in byStatus) byStatus[t.backlog_status] += 1
    if (t.backlog_status === "backlog" && t.story_points == null) ungroomed += 1
  })
  return { total: scoped.length, byStatus, ungroomed }
}

function backlogHealthStatsText(stats) {
  if (stats.total === 0) return null
  return `${stats.total} backlog item(s) total - ${stats.byStatus.backlog} in Backlog, ${stats.byStatus.ready} Ready, ${stats.byStatus.in_sprint} In Sprint, ${stats.byStatus.done} Done. ${stats.ungroomed} item(s) sitting in Backlog status with no story-point estimate (ungroomed).`
}

// Only locked retros count - an in-progress retro isn't a settled
// reflection yet. Oldest-first, same "momentum over time" convention as
// statusUpdatesText. Optionally restricted to a set of sprint ids, for
// Hybrid's per-Epic evidence. Pattern-spotting across entries (e.g. a
// recurring "didn't go well" theme) is left to Claude - that's a
// text-synthesis task, not arithmetic.
function retroThemesText(retros, sprints, sprintIdFilter) {
  const sprintById = new Map((sprints || []).map((s) => [s.id, s]))
  let list = (retros || []).filter((r) => r.is_locked)
  if (sprintIdFilter) list = list.filter((r) => sprintIdFilter.has(r.sprint_id))
  if (list.length === 0) return null

  const sorted = [...list].sort((a, b) => {
    const sa = sprintById.get(a.sprint_id)
    const sb = sprintById.get(b.sprint_id)
    return (sa?.start_date || "").localeCompare(sb?.start_date || "")
  })

  return sorted
    .map((r) => {
      const sprintName = sprintById.get(r.sprint_id)?.name || "(unknown sprint)"
      const wentWell = (r.went_well || []).map((e) => e.text).filter(Boolean)
      const didntGoWell = (r.didnt_go_well || []).map((e) => e.text).filter(Boolean)
      const parts = []
      if (wentWell.length > 0) parts.push(`Went well: ${wentWell.join("; ")}`)
      if (didntGoWell.length > 0) parts.push(`Didn't go well: ${didntGoWell.join("; ")}`)
      return `${sprintName}: ${parts.join(" | ") || "(no details logged)"}`
    })
    .join("\n")
}

// Status Updates load most-recent-first everywhere else in the app; a
// health check reasons about momentum over time, so present them
// oldest-first here (same choice as the post-mortem function). Methodology-
// agnostic PM-authored freeform text, so this stays included for all three.
function statusUpdatesText(statusUpdates) {
  const entries = statusUpdates || []
  if (entries.length === 0) return null
  return [...entries]
    .reverse()
    .map((s) => {
      const dated = s.created_at ? String(s.created_at).slice(0, 10) : "(undated)"
      const parts = []
      if (s.what_got_done) parts.push(`Done: ${s.what_got_done}`)
      if (s.whats_blocked) parts.push(`Blocked: ${s.whats_blocked}`)
      if (s.whats_coming_up) parts.push(`Next: ${s.whats_coming_up}`)
      return `${dated} - ${parts.join(" | ") || "(no details logged)"}`
    })
    .join("\n")
}

function methodologyInstructions(methodology) {
  if (methodology === "agile") {
    return `This is an Agile project - there are no milestones and no fixed task schedule to evaluate against. Base the evaluation primarily on sprint velocity trend (is committed-vs-completed velocity stable, improving, or declining across the recent sprints given), backlog health (a healthy pipeline of groomed/Ready items vs. everything stuck ungroomed in Backlog), and any locked retro themes (a recurring "didn't go well" pattern across retros is a real signal). Do NOT evaluate this project against calendar dates or "overdue tasks" - that concept doesn't apply to Agile work here.`
  }
  if (methodology === "hybrid") {
    return `This is a Hybrid project - lead the evaluation with phase status: are phases on track against their date ranges, and are their linked Waterfall tasks progressing or overdue. A phase marked OVERDUE in the data below (end date passed with incomplete linked tasks) is a concrete red flag - name it directly and let it drive health_status toward at_risk/off_track, don't soften it into a neutral "that phase is in the past" observation. Milestones in the data below are Epics - dateless grouping containers for backlog work, not a schedule signal - judge them only on completion progress (how much of their linked work is done), never as "overdue" or "on track" against a date. For whichever Epic(s) still have incomplete linked work, use the supporting sprint velocity / backlog health / retro evidence given for that Epic to reinforce or complicate the picture - e.g. "Epic X is mostly complete, and velocity for its linked sprints is also strong, reinforcing confidence" or "Epic X still has significant incomplete work, and velocity for its sprints has been declining, compounding the concern." Treat that evidence as context for the Epic's progress, not a separate parallel verdict.`
  }
  return `This is a Waterfall project - evaluate primarily on phases and tasks: are phases on track against their date ranges, and are tasks progressing or overdue relative to their phase. A phase marked OVERDUE in the data below (end date passed with incomplete linked tasks) is a concrete red flag - name it directly and let it drive health_status toward at_risk/off_track, don't soften it into a neutral "that phase is in the past" observation. If any Milestones (Epics) are listed, judge them only on completion progress, never as "overdue" against a date - they're dateless grouping containers, not a schedule signal.`
}

const HEALTH_VALUES = ["on_track", "at_risk", "off_track"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, riskLog, budget, tasks, taskDependencies, statusUpdates, sprints, retros, milestones, phases, today } = await req.json()

    if (action !== "evaluate") {
      return new Response(JSON.stringify({ error: "invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const todayStr = today || new Date().toISOString().slice(0, 10)
    const methodology = project?.methodology

    const allTasks = tasks || []
    const waterfallTasks = allTasks.filter((t) => t.backlog_status == null)
    const backlogItems = allTasks.filter((t) => t.backlog_status != null)

    // task_dependencies supports multiple predecessors per task, but
    // blocked-task scoring below is still single-predecessor (same
    // behavior as the legacy tasks.depends_on scalar column). Caller
    // orders rows by created_at ascending, so the first row seen per
    // task_id here is that task's earliest-recorded predecessor. Full
    // multi-predecessor blocked-task logic is Phase 4 (see CLAUDE.md),
    // alongside the Gantt multi-line work.
    const firstDependsOnByTaskId = new Map()
    ;(taskDependencies || []).forEach((d) => {
      if (!firstDependsOnByTaskId.has(d.task_id)) firstDependsOnByTaskId.set(d.task_id, d.depends_on_id)
    })

    const rStats = riskStats(riskLog, todayStr)
    const bStats = budgetStats(budget)

    const daysUntilDeadline = project.deadline ? daysBetween(todayStr, project.deadline) : null

    const contextParts = []
    const c = charterText(charter)
    if (c) contextParts.push(`Charter (original goals/success metrics/timeline):\n${c}`)

    const rText = riskStatsText(rStats)
    if (rText) contextParts.push(`Risk Log:\n${rText}`)

    const bText = budgetStatsText(bStats)
    if (bText) contextParts.push(`Budget Tracker (planned vs. actual, computed exactly - use these figures as-is, do not recompute):\n${bText}`)

    // Captured into named variables (not just inlined into the *Text()
    // calls below) so the same already-computed numbers can also be
    // returned as `metrics` further down, without recomputing anything or
    // changing a single word of what gets fed to Claude.
    let metrics = null

    if (methodology === "agile") {
      const vStats = velocityStats(sprints, backlogItems, null)
      const vText = velocityStatsText(vStats)
      contextParts.push(
        vText
          ? `Sprint Velocity, recent sprints, computed exactly (use these figures as-is, do not recompute):\n${vText}`
          : "Sprint Velocity: no sprint has any committed backlog points yet."
      )

      const bhText = backlogHealthStatsText(backlogHealthStats(backlogItems, null))
      if (bhText) contextParts.push(`Backlog Health (computed exactly):\n${bhText}`)

      const rtText = retroThemesText(retros, sprints, null)
      if (rtText) contextParts.push(`Locked Sprint Retro themes, oldest first:\n${rtText}`)

      // Most recent sprint with committed points, same definition
      // velocityStats/velocityStatsText already use (last entry - the
      // array is chronological, oldest first).
      const latest = vStats[vStats.length - 1] || null
      metrics = {
        velocity_ratio: latest && latest.committed > 0 ? latest.completed / latest.committed : null,
      }
    } else {
      const mStats = milestoneStats(milestones, waterfallTasks, backlogItems)
      const mText = milestoneStatsText(mStats)
      contextParts.push(
        mText
          ? `Milestones / Epics, progress only - dateless grouping containers, no schedule verdict (computed exactly - use these figures as-is, do not recompute):\n${mText}`
          : "Milestones / Epics: none created yet for this project."
      )

      const pStats = phaseStats(phases, waterfallTasks, todayStr)
      const pText = phaseStatsText(pStats)
      contextParts.push(
        pText
          ? `Phases (computed exactly - use these figures as-is, do not recompute):\n${pText}`
          : "Phases: none set up yet for this project."
      )

      const tStats = taskStats(waterfallTasks, todayStr, firstDependsOnByTaskId)
      const tText = taskStatsText(tStats)
      if (tText) contextParts.push(`Tasks, Waterfall side (computed exactly - use these figures as-is, do not recompute):\n${tText}`)

      if (methodology === "hybrid") {
        // Every Epic still carrying incomplete linked work gets its own
        // supporting-evidence block - not just one "currently active"
        // pick. There's no date left on Epics to break ties with, and an
        // Epic with unfinished work is "in flight" regardless of how many
        // other Epics also are.
        const inFlightMilestones = mStats.filter((s) => s.linkedIncomplete > 0)

        inFlightMilestones.forEach((s) => {
          const mId = s.milestone.id
          const vText = velocityStatsText(velocityStats(sprints, backlogItems, mId))
          const bhText = backlogHealthStatsText(backlogHealthStats(backlogItems, mId))
          const linkedSprintIds = new Set(
            backlogItems.filter((t) => t.milestone_id === mId && t.sprint_id).map((t) => t.sprint_id)
          )
          const rtText = retroThemesText(retros, sprints, linkedSprintIds)

          const evidenceParts = []
          if (vText) evidenceParts.push(`Velocity for sprints linked to this Epic:\n${vText}`)
          if (bhText) evidenceParts.push(`Backlog health for items linked to this Epic:\n${bhText}`)
          if (rtText) evidenceParts.push(`Locked retro themes for sprints linked to this Epic:\n${rtText}`)

          if (evidenceParts.length > 0) {
            contextParts.push(`Supporting evidence for Epic "${s.milestone.name}" (has incomplete linked work):\n${evidenceParts.join("\n\n")}`)
          }
        })

        // Metrics for Hybrid: Epic completion is the primary signal,
        // computed project-wide across every Epic's linked work (the same
        // linkedCompleted/linkedTotal milestoneStats() already computes
        // per Epic, just summed). Velocity is the secondary signal -
        // Epics are dateless now so there's no single "currently active"
        // one left to anchor a sprint choice to, so this uses the most
        // recent sprint project-wide instead, same computation Agile's
        // velocity_ratio already uses.
        const totalLinked = mStats.reduce((sum, s) => sum + s.linkedTotal, 0)
        const totalLinkedCompleted = mStats.reduce((sum, s) => sum + s.linkedCompleted, 0)
        const milestonePctComplete = totalLinked > 0 ? totalLinkedCompleted / totalLinked : null

        const vStats = velocityStats(sprints, backlogItems, null)
        const latest = vStats[vStats.length - 1] || null
        const velocityRatio = latest && latest.committed > 0 ? latest.completed / latest.committed : null

        metrics = { milestone_pct_complete: milestonePctComplete, velocity_ratio: velocityRatio }
      } else {
        metrics = { task_pct_complete: tStats.pctComplete }
      }
    }

    const sText = statusUpdatesText(statusUpdates)
    if (sText) contextParts.push(`Status Update history, oldest first (momentum over time):\n${sText}`)

    if (daysUntilDeadline != null) {
      contextParts.push(
        `Deadline is ${daysUntilDeadline < 0 ? `${Math.abs(daysUntilDeadline)} day(s) in the past (overdue)` : `${daysUntilDeadline} day(s) away`}.`
      )
    }

    const context = contextParts.length > 0 ? contextParts.join("\n\n") : null

    const system =
      "You are a project management assistant performing an on-demand project health check. You are given exact, pre-computed facts (phase/task status, Epic completion progress, budget variance, risk counts, sprint velocity, backlog health) - never recompute or contradict these numbers, only interpret and connect them. Your value is synthesis: connecting facts across categories relevant to this project's methodology (e.g. relate phase schedule status to its linked task progress and to risk exposure, or relate sprint velocity trend to backlog health and retro themes) rather than restating any single number in isolation. Respond with ONLY a JSON object, no markdown fences, no other text."

    const user = `${projectContext(project)}
Today's date: ${todayStr}

${methodologyInstructions(methodology)}

${context || "No charter, risk log, budget tracker, phases, milestones, tasks, sprints, or status updates exist for this project yet - note the evaluation will be very limited."}

Perform a project health check:
1. Decide an overall health_status: exactly one of "on_track", "at_risk", or "off_track".
2. Write a one-paragraph rationale that explains the reasoning by connecting specific data points across categories appropriate to this project's methodology (see the guidance above) - e.g. don't just say "budget is 80% spent", relate it to something else like phase/schedule pace, risk exposure, or velocity trend. Never simply restate a single number in isolation; every claim should connect at least two facts.
3. Write 2 to 5 recommended actions - specific and concrete, naming the actual phase/task/Epic/sprint/risk/category involved (e.g. "Phase \\"Execution\\" is 12 day(s) overdue with 3 incomplete linked tasks" or "Epic \\"Payments\\" still has 6 of 9 linked items incomplete" or "Address the N High-impact risks still open"), not generic advice.

Ground everything in the facts given above; never invent numbers, phase/task/Epic/sprint names, or risks that weren't provided.

Return ONLY this JSON shape:
{"health_status": "on_track" | "at_risk" | "off_track", "rationale": "...", "recommendations": ["...", "..."]}`

    const result = await callClaude(system, user)

    if (!HEALTH_VALUES.includes(result.health_status)) {
      result.health_status = "at_risk"
    }
    if (!Array.isArray(result.recommendations)) {
      result.recommendations = []
    }
    // Not part of Claude's response - these are the already-computed,
    // exact numbers from earlier in this function, attached here so the
    // frontend can persist and display them without any LLM involvement.
    result.metrics = metrics

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  }
})
