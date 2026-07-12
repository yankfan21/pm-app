// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "project-eval"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> project-eval -> Secrets before invoking.
//
// Evaluate Project is a one-shot, read-only diagnostic - no Q&A intake, no
// PM editing, nothing it does ever writes back to tasks/budget/risks. The
// one thing that makes this different from every other doc type's edge
// function: the numbers it needs (overdue tasks/milestones, budget
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
// instead). Now: Waterfall primary signal = milestones + their linked
// tasks; Agile primary signal = sprint velocity + backlog health + locked
// retro themes, no dates/overdue framing since Agile has no fixed
// schedule; Hybrid leads with milestones (like Waterfall) and pulls in
// velocity/backlog/retro evidence scoped to whichever milestone(s) are
// currently active, as supporting evidence for that milestone's verdict.
// Risks and budget stay in the evaluation across all three, unscoped.

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
      // (per-milestone breakdowns, multi-sprint velocity series, retro
      // excerpts) for Claude to cross-reference. max_tokens is only a
      // ceiling, so raising it doesn't force longer output. Matches the
      // fixed ceiling task-gen/backlog-gen/milestone-gen already use.
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
function taskStats(tasks, today) {
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
    if (t.depends_on) {
      const blocker = byId.get(t.depends_on)
      if (blocker && !blocker.completed) {
        blockedCounts.set(t.depends_on, (blockedCounts.get(t.depends_on) || 0) + 1)
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

// Per-milestone exact facts: date-range status against today, and
// completion of whatever's linked to it via milestone_id (union of
// Waterfall tasks and backlog items - covers Hybrid's dual usage
// naturally, degrades to just tasks for pure Waterfall since backlogItems
// is always empty there).
//
// The core signal this exists to catch: an end_date that has already
// passed while linked work is still incomplete. That's computed here as
// an explicit `overdue` flag with exact days-overdue, not left as a soft
// "the date is in the past" fact for Claude to (possibly) soften.
function milestoneStats(milestones, waterfallTasks, backlogItems, today) {
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

    const hasDates = !!(m.start_date && m.end_date)
    let dateStatus = "undated"
    let daysOverdue = null
    let daysUntilStart = null
    let daysUntilEnd = null

    if (hasDates) {
      if (today < m.start_date) {
        dateStatus = "upcoming"
        daysUntilStart = daysBetween(today, m.start_date)
      } else if (today <= m.end_date) {
        dateStatus = "active"
        daysUntilEnd = daysBetween(today, m.end_date)
      } else {
        dateStatus = "past"
        daysOverdue = daysBetween(m.end_date, today)
      }
    }

    const overdue = dateStatus === "past" && linkedIncomplete > 0

    // Drives which milestone(s) get scoped sprint/backlog/retro evidence
    // pulled in for Hybrid. An overdue milestone still deserves that
    // evidence (it's exactly the "compounding concern" case). An undated
    // milestone with unfinished linked work is still "in flight" and
    // shouldn't be excluded just because no dates were set.
    const isActive = dateStatus === "active" || overdue || (dateStatus === "undated" && linkedIncomplete > 0)

    return { milestone: m, linked, linkedTotal, linkedCompleted, linkedIncomplete, dateStatus, daysOverdue, daysUntilStart, daysUntilEnd, overdue, isActive }
  })
}

function milestoneStatsText(stats) {
  if (stats.length === 0) return null
  const lines = stats.map((s) => {
    const m = s.milestone
    const dateLabel = s.dateStatus === "undated" ? "no dates set" : `${m.start_date} to ${m.end_date}`

    let statusLabel
    if (s.overdue) {
      statusLabel = `OVERDUE by ${s.daysOverdue} day(s) - end date has passed with incomplete linked work`
    } else if (s.dateStatus === "past" && s.linkedTotal === 0) {
      statusLabel = "end date passed, but no items are linked to this milestone - completion can't be verified from the data"
    } else if (s.dateStatus === "past") {
      statusLabel = "end date passed, all linked items complete"
    } else if (s.dateStatus === "active") {
      statusLabel = `in progress, ${s.daysUntilEnd} day(s) until end date`
    } else if (s.dateStatus === "upcoming") {
      statusLabel = `upcoming, starts in ${s.daysUntilStart} day(s)`
    } else {
      statusLabel = "no dates set to judge schedule against"
    }

    const itemsLabel = s.linkedTotal === 0 ? "no items linked yet" : `${s.linkedCompleted} of ${s.linkedTotal} linked item(s) complete`

    return `- "${m.name}" (${dateLabel}): ${statusLabel}. ${itemsLabel}.`
  })
  return lines.join("\n")
}

// Committed-vs-completed story points per sprint, chronological, capped to
// the most recent 5 sprints that actually have committed points (bounded
// enough to read as a trend without diluting into long-past noise - same
// spirit as taskStats' 14-day upcoming cutoff). Optionally scoped to only
// backlog items carrying a given milestone_id, for Hybrid's per-milestone
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
// milestone_id for Hybrid's per-milestone evidence.
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
// Hybrid's per-milestone evidence. Pattern-spotting across entries (e.g. a
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
    return `This is a Hybrid project - lead the evaluation with milestone/phase status, the same way you would for Waterfall: are milestones on track against their date ranges, and are their linked tasks progressing or overdue. A milestone marked OVERDUE in the data below (end date passed with incomplete linked work) is a concrete red flag - name it directly and let it drive health_status toward at_risk/off_track, don't soften it into a neutral "that milestone is in the past" observation. For whichever milestone(s) are currently active, use the supporting sprint velocity / backlog health / retro evidence given for that milestone to reinforce or complicate its own verdict - e.g. "Milestone X is on track, and velocity for its linked sprints is also strong, reinforcing confidence" or "Milestone X's timeline is at risk, and velocity for its sprints has also been declining, compounding the concern." Treat that evidence as support for the milestone's verdict, not a separate parallel verdict.`
  }
  return `This is a Waterfall project - evaluate primarily on milestones and tasks: are milestones on track against their date ranges, and are tasks progressing or overdue relative to their milestone. A milestone marked OVERDUE in the data below (end date passed with incomplete linked work) is a concrete red flag - name it directly and let it drive health_status toward at_risk/off_track, don't soften it into a neutral "that milestone is in the past" observation.`
}

const HEALTH_VALUES = ["on_track", "at_risk", "off_track"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, riskLog, budget, tasks, statusUpdates, sprints, retros, milestones, today } = await req.json()

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

    if (methodology === "agile") {
      const vText = velocityStatsText(velocityStats(sprints, backlogItems, null))
      contextParts.push(
        vText
          ? `Sprint Velocity, recent sprints, computed exactly (use these figures as-is, do not recompute):\n${vText}`
          : "Sprint Velocity: no sprint has any committed backlog points yet."
      )

      const bhText = backlogHealthStatsText(backlogHealthStats(backlogItems, null))
      if (bhText) contextParts.push(`Backlog Health (computed exactly):\n${bhText}`)

      const rtText = retroThemesText(retros, sprints, null)
      if (rtText) contextParts.push(`Locked Sprint Retro themes, oldest first:\n${rtText}`)
    } else {
      const mStats = milestoneStats(milestones, waterfallTasks, backlogItems, todayStr)
      const mText = milestoneStatsText(mStats)
      contextParts.push(
        mText
          ? `Milestones (computed exactly - use these figures as-is, do not recompute):\n${mText}`
          : "Milestones: none created yet for this project."
      )

      const tText = taskStatsText(taskStats(waterfallTasks, todayStr))
      if (tText) contextParts.push(`Tasks, Waterfall side (computed exactly - use these figures as-is, do not recompute):\n${tText}`)

      if (methodology === "hybrid") {
        mStats
          .filter((s) => s.isActive)
          .forEach((s) => {
            const mId = s.milestone.id
            const vText = velocityStatsText(velocityStats(sprints, backlogItems, mId))
            const bhText = backlogHealthStatsText(backlogHealthStats(backlogItems, mId))
            const linkedSprintIds = new Set(
              backlogItems.filter((t) => t.milestone_id === mId && t.sprint_id).map((t) => t.sprint_id)
            )
            const rtText = retroThemesText(retros, sprints, linkedSprintIds)

            const evidenceParts = []
            if (vText) evidenceParts.push(`Velocity for sprints linked to this milestone:\n${vText}`)
            if (bhText) evidenceParts.push(`Backlog health for items linked to this milestone:\n${bhText}`)
            if (rtText) evidenceParts.push(`Locked retro themes for sprints linked to this milestone:\n${rtText}`)

            if (evidenceParts.length > 0) {
              contextParts.push(`Supporting evidence for active milestone "${s.milestone.name}":\n${evidenceParts.join("\n\n")}`)
            }
          })
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
      "You are a project management assistant performing an on-demand project health check. You are given exact, pre-computed facts (milestone/task status, budget variance, risk counts, sprint velocity, backlog health) - never recompute or contradict these numbers, only interpret and connect them. Your value is synthesis: connecting facts across categories relevant to this project's methodology (e.g. relate milestone schedule status to its linked task progress and to risk exposure, or relate sprint velocity trend to backlog health and retro themes) rather than restating any single number in isolation. Respond with ONLY a JSON object, no markdown fences, no other text."

    const user = `${projectContext(project)}
Today's date: ${todayStr}

${methodologyInstructions(methodology)}

${context || "No charter, risk log, budget tracker, milestones, tasks, sprints, or status updates exist for this project yet - note the evaluation will be very limited."}

Perform a project health check:
1. Decide an overall health_status: exactly one of "on_track", "at_risk", or "off_track".
2. Write a one-paragraph rationale that explains the reasoning by connecting specific data points across categories appropriate to this project's methodology (see the guidance above) - e.g. don't just say "budget is 80% spent", relate it to something else like milestone/schedule pace, risk exposure, or velocity trend. Never simply restate a single number in isolation; every claim should connect at least two facts.
3. Write 2 to 5 recommended actions - specific and concrete, naming the actual milestone/task/sprint/risk/category involved (e.g. "Milestone \\"Design Complete\\" is 12 day(s) overdue with 3 incomplete linked items" or "Address the N High-impact risks still open"), not generic advice.

Ground everything in the facts given above; never invent numbers, milestone/task/sprint names, or risks that weren't provided.

Return ONLY this JSON shape:
{"health_status": "on_track" | "at_risk" | "off_track", "rationale": "...", "recommendations": ["...", "..."]}`

    const result = await callClaude(system, user)

    if (!HEALTH_VALUES.includes(result.health_status)) {
      result.health_status = "at_risk"
    }
    if (!Array.isArray(result.recommendations)) {
      result.recommendations = []
    }

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
