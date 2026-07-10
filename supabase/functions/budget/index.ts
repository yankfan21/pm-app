// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "budget"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> budget -> Secrets before invoking.

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

// Bumped from 1500 - "generate"/"suggest" return a list of budget line
// items, the same class of ceiling that truncated charter's apply_followup
// in production (Claude's "thinking" content block draws from the same
// max_tokens budget as the actual JSON output). max_tokens is only a
// ceiling, so raising it doesn't force longer output.
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

function projectContext(project) {
  return `Project name: ${project.name}
Goal: ${project.goal}
Priority: ${project.priority}
Deadline: ${project.deadline ?? "TBD"}`
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

function establishedContext(charter, brief) {
  const parts = []
  const c = charterText(charter)
  const b = briefText(brief)
  if (c) parts.push(`Existing project charter:\n${c}`)
  if (b) parts.push(`Existing requirements brief:\n${b}`)
  return parts.length > 0 ? parts.join("\n\n") : null
}

function tasksText(existingTasks) {
  if (!existingTasks || existingTasks.length === 0) return "(no tasks defined yet)"
  return existingTasks.map((t) => `- id: ${t.id} | title: ${t.title}`).join("\n")
}

function lineItemsText(lineItems) {
  if (!lineItems || lineItems.length === 0) return "(none yet)"
  return lineItems
    .map(
      (i, idx) =>
        `${idx + 1}. ${i.name} | Category: ${i.category} | Estimated: ${i.estimated_amount}${i.notes ? ` | Notes: ${i.notes}` : ""}`
    )
    .join("\n")
}

const LINE_ITEM_SHAPE_HINT =
  '{"category": "short category, e.g. Labor, Software, Travel, Contractors, Equipment", "name": "short description of the line item", "estimated_amount": 1200, "task_id": "id of a matching task from the list above, or null if none clearly applies", "notes": "short optional note, or empty string"}'

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, brief, answers, existingTasks, line_items } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, brief)

      const system =
        "You are a project management assistant preparing a starting Budget Tracker. You first check what is already established from the project data and any existing charter or requirements brief, and only ask about what's genuinely still missing. Where you can reasonably infer a likely answer from the context already given, you propose it as a suggestion for the PM to accept, edit, or dismiss - you never present a guess as settled fact. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter or requirements brief exists yet for this project."}

Generate 3 to 6 short, targeted questions needed to scope a starting project budget: things like an overall budget ceiling if one exists, the labor/contractor mix, tools or software licensing needs, travel, and other major cost drivers relevant to this specific kind of project. Skip anything already answered by the project data, charter, or brief above.

For each question:
- Decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).
- If you can reasonably infer a likely answer from the project context above, include it as "suggested_answer" - phrased so the PM can quickly tell it's a proposal. Only include a suggestion when it's a reasonable inference from what's already known, never a fabricated guess. Otherwise set "suggested_answer" to null.

Return ONLY this JSON shape:
${QUESTION_SHAPE_HINT}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      const context = establishedContext(charter, brief)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant. You write concise, practical starting project budgets. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
Discovery Q&A about the budget:
${qaText || "(none provided)"}

Existing tasks on this project (link a line item to one of these only when it clearly applies; otherwise use null - never invent a task):
${tasksText(existingTasks)}

Propose a starting budget: a list of concrete line items for this project, each with a category, a short name/description, an estimated amount, and optionally a linked task id from the list above. Base it on the project data, charter/brief (if provided), and Q&A above; do not invent specifics that weren't provided or implied. Aim for roughly 4 to 10 line items covering the major cost drivers, not an exhaustive line-by-line breakdown. Do NOT include an "actual_amount" field - actual spend is tracked separately by the PM starting at zero.

Return ONLY this JSON shape:
{"line_items": [${LINE_ITEM_SHAPE_HINT}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "suggest") {
      const context = establishedContext(charter, brief)

      const system =
        "You are a project management assistant proposing additional entries for an existing project budget. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
Line items already budgeted (do not repeat these):
${lineItemsText(line_items)}

Existing tasks on this project (link a line item to one of these only when it clearly applies; otherwise use null):
${tasksText(existingTasks)}

Propose 1 to 4 additional budget line items for this project that are NOT already covered above. Only propose items that are plausibly relevant given the project context - do not pad with generic boilerplate costs that don't fit this specific project. Do NOT include an "actual_amount" field. If you can't identify any genuinely new, relevant items, return an empty array.

Return ONLY this JSON shape:
{"line_items": [${LINE_ITEM_SHAPE_HINT}]}`

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
