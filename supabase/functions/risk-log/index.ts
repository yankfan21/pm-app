// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "risk-log"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> risk-log -> Secrets before invoking.

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

function risksText(risks) {
  if (!risks || risks.length === 0) return "(none yet)"
  return risks
    .map(
      (r, i) =>
        `${i + 1}. ${r.risk} | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Mitigation: ${r.mitigation || "(none)"} | Owner: ${r.owner || "(unassigned)"}`
    )
    .join("\n")
}

const RISK_ROW_SHAPE_HINT =
  '{"risk": "short description of the risk", "likelihood": "Low" | "Medium" | "High", "impact": "Low" | "Medium" | "High", "mitigation": "short mitigation plan", "owner": "role or name responsible, or empty string if unknown"}'

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, brief, answers, risks } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, brief)

      const system =
        "You are a project management assistant preparing a Risk Log. You first check what is already established from the project data and any existing charter or requirements brief, and only ask about what's genuinely still missing. Where you can reasonably infer a likely risk from the context already given, you propose it as a suggestion for the PM to accept, edit, or dismiss - you never present a guess as settled fact. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter or requirements brief exists yet for this project."}

Generate 3 to 6 short, targeted questions to surface the project's known risks, needed to build a Risk Log capturing each risk's likelihood, impact, mitigation plan, and owner. Skip anything already answered by the project data, charter, or brief above. Favor questions like "what could delay/derail this" or that probe specific risk categories relevant to this kind of project (technical, schedule, resource, budget, external/vendor, compliance) rather than generic filler.

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
        "You are a project management assistant. You write concise, practical project risk logs. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
Discovery Q&A about risks:
${qaText || "(none provided)"}

Write a Risk Log: a list of concrete risks for this project, each with a likelihood, impact, short mitigation plan, and owner (a role or name if implied by context, otherwise an empty string). Base it on the project data, charter/brief (if provided), and Q&A above; do not invent specifics that weren't provided or implied. Keep each field short (risk and mitigation are one sentence each).

Return ONLY this JSON shape:
{"risks": [${RISK_ROW_SHAPE_HINT}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "suggest") {
      const context = establishedContext(charter, brief)

      const system =
        "You are a project management assistant proposing additional entries for an existing Risk Log. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
Risks already logged (do not repeat these):
${risksText(risks)}

Propose 1 to 4 additional risks for this project that are NOT already covered above. Only propose risks that are plausibly relevant given the project context - do not pad with generic boilerplate risks that don't fit this specific project. If you can't identify any genuinely new, relevant risks, return an empty array.

Return ONLY this JSON shape:
{"risks": [${RISK_ROW_SHAPE_HINT}]}`

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
