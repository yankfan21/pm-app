// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "task-gen"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> task-gen -> Secrets before invoking.
//
// Proposes a starter (or additional) task list from a project's Charter and,
// where they exist, its Requirements Brief and Risk Log. Every proposal is
// reviewed, edited, and explicitly accepted by the PM client-side before
// anything is written to the tasks table - this function only ever returns
// proposals, it never writes to the database itself.

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

function existingTasksText(existingTasks) {
  if (!existingTasks || existingTasks.length === 0) return null
  return existingTasks.map((t) => `- ${t.title} (id: ${t.id})`).join("\n")
}

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

const TASK_SHAPE_HINT =
  '{"tasks": [{"temp_id": "t1", "title": "short concrete task title", "duration_days": 3, "depends_on": null}, {"temp_id": "t2", "title": "...", "duration_days": 2, "depends_on": "t1"}]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, brief, riskLog, existingTasks, answers } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, brief, riskLog)
      const existingText = existingTasksText(existingTasks)

      const system =
        "You are a project management assistant helping break a project down into a starter task list. You first check what's already established from the project's charter (and requirements brief / risk log, if provided) and any tasks that already exist, and only ask about what's genuinely still missing to propose a useful task list - things like whether to break work out by phase or by workstream, granularity, or team/parallelization constraints. You never ask about anything already answered by the documents provided, and you never ask generic filler questions. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter, requirements brief, or risk log exists yet for this project."}

${existingText ? `Tasks already on this project (do not ask about these, and do not propose duplicates of them later):\n${existingText}` : "No tasks exist yet for this project."}

Generate 0 to 4 short, targeted questions to gather information genuinely needed to propose a useful starter task list from the above context - e.g. how to break tasks out (by phase, by workstream, etc.), granularity, or team/parallelization constraints. Skip anything already answered by the context above. If the context already fully determines a sensible task breakdown, return an empty questions array rather than inventing filler questions.

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
      const existingText = existingTasksText(existingTasks)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant proposing a starter task list for a project, broken down from its charter and other documents. You only propose tasks for review - the PM will edit, decline, or accept each one, and nothing is added automatically. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
${existingText ? `Tasks already on this project (do NOT propose duplicates of these; you MAY reference one of these ids in "depends_on" if a new task genuinely depends on it):\n${existingText}\n` : ""}
Discovery Q&A about how to approach the breakdown:
${qaText || "(none provided)"}

Propose a starter list of 4 to 12 concrete tasks to accomplish this project, based on the above. For each task, give:
- "title": a short, concrete task title (not a vague phase name like "Planning" - something a PM could put on a checklist)
- "duration_days": an estimated whole-number duration in days for that task alone
- "depends_on": if the task can only reasonably start after another task in THIS proposal finishes, set this to that task's "temp_id" (e.g. "t1"); if it can only start after one of the EXISTING tasks listed above finishes, set this to that existing task's id; otherwise null (can start right away, in parallel with other unblocked tasks).

Sequence tasks sensibly - not everything has to be sequential, use dependencies only where there's a real ordering constraint. Do not propose a task that duplicates one already listed as existing above.

Return ONLY this JSON shape:
${TASK_SHAPE_HINT}`

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
