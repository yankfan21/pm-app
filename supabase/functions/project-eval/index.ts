// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "project-eval"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> project-eval -> Secrets before invoking.
//
// Evaluate Project is a one-shot, read-only diagnostic - no Q&A intake, no
// PM editing, nothing it does ever writes back to tasks/budget/risks. The
// one thing that makes this different from every other doc type's edge
// function: the numbers it needs (overdue tasks, budget variance, risk
// age) have to be arithmetically exact, and LLMs are unreliable at date
// math and counting over a raw list. So this function computes every
// derived stat in plain code first and hands Claude already-computed facts
// to synthesize/narrate, rather than asking it to do the counting itself.

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
      // A dense, fully-cross-referenced one-paragraph rationale plus up to
      // 5 specific recommendations occasionally ran past 2000 and got
      // truncated mid-JSON (same failure mode fixed in post-mortem/index.ts
      // by raising its budget) - give this comparable headroom.
      max_tokens: 3000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
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
Status: ${project.status}`
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

// Status Updates load most-recent-first everywhere else in the app; a
// health check reasons about momentum over time, so present them
// oldest-first here (same choice as the post-mortem function).
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

const HEALTH_VALUES = ["on_track", "at_risk", "off_track"]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, riskLog, budget, tasks, statusUpdates, today } = await req.json()

    if (action !== "evaluate") {
      return new Response(JSON.stringify({ error: "invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const todayStr = today || new Date().toISOString().slice(0, 10)

    const rStats = riskStats(riskLog, todayStr)
    const bStats = budgetStats(budget)
    const tStats = taskStats(tasks, todayStr)

    const daysUntilDeadline = project.deadline ? daysBetween(todayStr, project.deadline) : null

    const contextParts = []
    const c = charterText(charter)
    if (c) contextParts.push(`Charter (original goals/success metrics/timeline):\n${c}`)

    const rText = riskStatsText(rStats)
    if (rText) contextParts.push(`Risk Log:\n${rText}`)

    const bText = budgetStatsText(bStats)
    if (bText) contextParts.push(`Budget Tracker (planned vs. actual, computed exactly - use these figures as-is, do not recompute):\n${bText}`)

    const tText = taskStatsText(tStats)
    if (tText) contextParts.push(`Tasks (computed exactly - use these figures as-is, do not recompute):\n${tText}`)

    const sText = statusUpdatesText(statusUpdates)
    if (sText) contextParts.push(`Status Update history, oldest first (momentum over time):\n${sText}`)

    if (daysUntilDeadline != null) {
      contextParts.push(
        `Deadline is ${daysUntilDeadline < 0 ? `${Math.abs(daysUntilDeadline)} day(s) in the past (overdue)` : `${daysUntilDeadline} day(s) away`}.`
      )
    }

    const context = contextParts.length > 0 ? contextParts.join("\n\n") : null

    const system =
      "You are a project management assistant performing an on-demand project health check. You are given exact, pre-computed facts (task overdue counts, budget variance, risk counts) - never recompute or contradict these numbers, only interpret and connect them. Your value is synthesis: connecting facts across categories (e.g. relate budget pace to schedule pace, relate open risk exposure to task slippage, relate status update momentum to the deadline) rather than restating any single number in isolation. Respond with ONLY a JSON object, no markdown fences, no other text."

    const user = `${projectContext(project)}
Today's date: ${todayStr}

${context || "No charter, risk log, budget tracker, tasks, or status updates exist for this project yet - note the evaluation will be very limited."}

Perform a project health check:
1. Decide an overall health_status: exactly one of "on_track", "at_risk", or "off_track".
2. Write a one-paragraph rationale that explains the reasoning by connecting specific data points across categories - e.g. don't just say "budget is 80% spent", relate it to something else like schedule pace, risk exposure, or how much work is actually done. Never simply restate a single number in isolation; every claim should connect at least two facts.
3. Write 2 to 5 recommended actions - specific and concrete, naming the actual task/risk/category involved (e.g. "Address the N High-impact risks still open" or "\\"Task title\\" is blocking N other tasks and is Y days overdue"), not generic advice.

Ground everything in the facts given above; never invent numbers, task names, or risks that weren't provided.

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
