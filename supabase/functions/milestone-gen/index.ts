// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "milestone-gen"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> milestone-gen -> Secrets before invoking.
//
// Proposes a starter (or additional) Milestone list from a project's
// Charter and, where they exist, its Requirements Brief and Risk Log - the
// Waterfall/Hybrid counterpart to task-gen/backlog-gen. Every proposal is
// reviewed, edited, and explicitly accepted by the PM client-side before
// anything is written to the milestones table - this function only ever
// returns proposals, it never writes to the database itself. Mirrors
// task-gen/backlog-gen's structure (same callClaude/questions-then-generate
// shape) since each edge function in this project is a self-contained
// deploy unit - no shared module between them - rather than sharing code
// across functions.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim())
}

// 4000 from the start, matching the ceiling every other edge function in
// this project was bumped to (see task-gen/backlog-gen) - Claude's
// "thinking" content block draws from the same max_tokens budget as the
// actual JSON output, and a multi-item proposal can exceed a low ceiling
// and truncate mid-JSON. max_tokens is only a ceiling, so setting it high
// doesn't force longer output.
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

// Today's date, passed to the model as the anchor it must reason from when
// inferring start_date/end_date (e.g. "Phase 1 is 3 weeks" only becomes a
// real calendar date relative to *some* today).
function todayDateString() {
  return new Date().toISOString().slice(0, 10)
}

function projectContext(project) {
  return `Project name: ${project.name}
Goal: ${project.goal}
Priority: ${project.priority}
Deadline: ${project.deadline ?? "TBD"}
Methodology: ${project.methodology}
Today's date: ${todayDateString()}`
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

const BRIEF_SECTION_LABELS = {
  problem_statement: "Problem Statement",
  objectives: "Objectives",
  scope_in: "Scope (In)",
  scope_out: "Scope (Out)",
  functional_requirements: "Functional Requirements",
  constraints: "Constraints",
  assumptions: "Assumptions",
}

function briefText(brief) {
  if (!brief) return null
  return Object.entries(BRIEF_SECTION_LABELS)
    .map(([key, label]) => `${label}: ${brief[key] || "(empty)"}`)
    .join("\n")
}

function risksText(risks) {
  if (!risks || risks.length === 0) return null
  return risks
    .map(
      (r, i) =>
        `${i + 1}. ${r.risk} | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Mitigation: ${r.mitigation || "(none)"}`
    )
    .join("\n")
}

function establishedContext(charter, brief, riskLog) {
  const parts = []
  const c = charterText(charter)
  const b = briefText(brief)
  const r = risksText(riskLog?.risks)
  if (c) parts.push(`Existing project charter:\n${c}`)
  if (b) parts.push(`Existing requirements brief:\n${b}`)
  if (r) parts.push(`Existing risk log:\n${r}`)
  return parts.length > 0 ? parts.join("\n\n") : null
}

function existingMilestonesText(existingMilestones) {
  if (!existingMilestones || existingMilestones.length === 0) return null
  return existingMilestones
    .map((m) => `- ${m.name}${m.start_date || m.end_date ? ` (${m.start_date ?? "TBD"} to ${m.end_date ?? "TBD"})` : ""}`)
    .join("\n")
}

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

const MILESTONE_SHAPE_HINT =
  '{"milestones": [{"temp_id": "m1", "name": "short milestone name", "description": "1-2 sentence description of what must be true for this milestone to be reached", "start_date": "YYYY-MM-DD or null", "end_date": "YYYY-MM-DD or null"}]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, brief, riskLog, existingMilestones, answers } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, brief, riskLog)
      const existingText = existingMilestonesText(existingMilestones)

      const system =
        "You are a project management assistant helping propose a starter set of Milestones for a Waterfall or Hybrid project. You first check what's already established from the project's charter (and requirements brief / risk log, if provided) and any milestones that already exist, and only ask about what's genuinely still missing to propose useful milestones - things like desired granularity (major phases vs. finer checkpoints), whether milestones should track a hard external deadline, or team/parallelization constraints. You never ask about anything already answered by the documents provided, and you never ask generic filler questions. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter, requirements brief, or risk log exists yet for this project."}

${existingText ? `Milestones already on this project (do not ask about these, and do not propose duplicates of them later):\n${existingText}` : "No milestones exist yet for this project."}

Generate 0 to 4 short, targeted questions to gather information genuinely needed to propose a useful starter milestone set from the above context - e.g. desired granularity, whether milestones should map 1:1 to Waterfall phases from the charter's timeline, or a hard deadline to plan backward from. Skip anything already answered by the context above. If the context already fully determines a sensible milestone breakdown, return an empty questions array rather than inventing filler questions.

For each question:
- Decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).
- If you can reasonably infer a likely answer from the context above, include it as "suggested_answer" for the PM to accept, edit, or dismiss; otherwise set it to null.

Return ONLY this JSON shape:
${QUESTION_SHAPE_HINT}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      const context = establishedContext(charter, brief, riskLog)
      const existingText = existingMilestonesText(existingMilestones)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant proposing a starter set of Milestones for a Waterfall or Hybrid project, broken down from its charter and other documents. You only propose milestones for review - the PM will edit, decline, or accept each one, and nothing is added automatically. You are conservative about dates: you only propose start_date/end_date when the source material gives you a genuine basis to infer them, and you say so by leaving both null otherwise rather than guessing. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
${existingText ? `Milestones already on this project (do NOT propose duplicates of these):\n${existingText}\n` : ""}
Discovery Q&A about how to approach the breakdown:
${qaText || "(none provided)"}

Propose a starter set of 3 to 8 concrete milestones to mark meaningful progress checkpoints for this project, based on the above. For each milestone, give:
- "name": a short, concrete milestone name (e.g. "Design Complete", "Beta Launch", "M1: Foundation" - not a vague generic label)
- "description": a 1-2 sentence description of what must be true for this milestone to be considered reached
- "start_date" and "end_date": ONLY propose these (as "YYYY-MM-DD" strings) if the charter/brief gives you a genuine basis - an explicit timeline section with phases/durations/dates, or a hard project deadline you can reasonably plan backward from, anchored to today's date given above. If there isn't enough basis to responsibly guess, set BOTH to null - do not invent dates with no grounding.

Sequence the milestones in a sensible order reflecting project progression. Do not propose a milestone that duplicates one already listed as existing above.

Return ONLY this JSON shape:
${MILESTONE_SHAPE_HINT}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ error: "invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  }
})
