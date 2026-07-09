// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "backlog-gen"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> backlog-gen -> Secrets before invoking.
//
// Proposes a starter (or additional) Product Backlog from a project's
// Charter and, where they exist, its Requirements Brief and Risk Log -
// the Agile/Hybrid counterpart to task-gen. Every proposal is reviewed,
// edited, and explicitly accepted by the PM client-side before anything is
// written to the tasks table - this function only ever returns proposals,
// it never writes to the database itself. Mirrors task-gen's structure
// (same callClaude/questions-then-generate shape) since each edge function
// in this project is a self-contained deploy unit - no shared module
// between them - rather than sharing code across functions.

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
      max_tokens: 1500,
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
Methodology: ${project.methodology}`
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

function existingBacklogText(existingBacklogItems) {
  if (!existingBacklogItems || existingBacklogItems.length === 0) return null
  return existingBacklogItems
    .map((t) => `- ${t.title}${t.story_points != null ? ` (${t.story_points} pts)` : ""}`)
    .join("\n")
}

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

const ITEM_SHAPE_HINT =
  '{"items": [{"temp_id": "b1", "title": "short concrete backlog item title", "description": "1-2 sentence description", "story_points": 5, "epic_name": "epic or milestone name, or null"}]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, brief, riskLog, existingBacklogItems, answers } = await req.json()
    const isHybrid = project?.methodology === "hybrid"

    if (action === "questions") {
      const context = establishedContext(charter, brief, riskLog)
      const existingText = existingBacklogText(existingBacklogItems)

      const system =
        "You are a project management assistant helping break a project down into a starter Product Backlog for an Agile or Hybrid project. You first check what's already established from the project's charter (and requirements brief / risk log, if provided) and any backlog items that already exist, and only ask about what's genuinely still missing to propose a useful backlog - things like how granular to make items, whether to organize by epic/theme, or team capacity per sprint. You never ask about anything already answered by the documents provided, and you never ask generic filler questions. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter, requirements brief, or risk log exists yet for this project."}

${existingText ? `Backlog items already on this project (do not ask about these, and do not propose duplicates of them later):\n${existingText}` : "No backlog items exist yet for this project."}

Generate 0 to 4 short, targeted questions to gather information genuinely needed to propose a useful starter backlog from the above context - e.g. desired granularity, whether to group by epic/theme${isHybrid ? " (this is a Hybrid project - epics typically correspond to the project's Waterfall phases/milestones from the charter's timeline or scope)" : ""}, or team capacity constraints. Skip anything already answered by the context above. If the context already fully determines a sensible backlog breakdown, return an empty questions array rather than inventing filler questions.

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
      const existingText = existingBacklogText(existingBacklogItems)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant proposing a starter Product Backlog for an Agile or Hybrid project, broken down from its charter and other documents. You only propose backlog items for review - the PM will edit, decline, or accept each one, and nothing is added automatically. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
${existingText ? `Backlog items already on this project (do NOT propose duplicates of these):\n${existingText}\n` : ""}
Discovery Q&A about how to approach the breakdown:
${qaText || "(none provided)"}

Propose a starter backlog of 4 to 12 concrete items to accomplish this project's scope, based on the above. For each item, give:
- "title": a short, concrete backlog item title (not a vague phase name - something a PM could put on a sprint board)
- "description": a 1-2 sentence description of what the item covers
- "story_points": your best-guess relative-size estimate, which MUST be exactly one of: 1, 2, 3, 5, 8, 13 (Fibonacci scale - 1 is trivial, 13 is very large/should probably be split later)
${isHybrid
  ? '- "epic_name": if the charter\'s scope/timeline implies a phase or milestone structure, the name of the phase/milestone this item belongs to (e.g. matching a timeline entry); otherwise null'
  : '- "epic_name": always null (this is not a Hybrid project)'}

Do not propose an item that duplicates one already listed as existing above.

Return ONLY this JSON shape:
${ITEM_SHAPE_HINT}`

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
