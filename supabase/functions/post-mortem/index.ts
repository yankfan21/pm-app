// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "post-mortem"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> post-mortem -> Secrets before invoking.
//
// Post-Mortem is only offered once a project is archived (see documentTypes.jsx's
// `available` field), and pulls its context from four already-generated
// sources - Charter, Risk Log, Status Update history, and Budget Tracker -
// so the Q&A intake only needs to ask what none of that data can answer
// (reflective "what would you do differently" style questions).

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
      // Higher than the other doc types' 1200-1500: "generate" here produces
      // six analytical sections synthesized from four other documents
      // (charter/risk log/status history/budget), which runs noticeably
      // longer than restating a single source - 1500 was truncating mid-JSON
      // and burning all 3 retries on the same truncation every time.
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

function riskLogText(riskLog) {
  const risks = riskLog?.risks || []
  if (risks.length === 0) return null
  return risks
    .map(
      (r, i) =>
        `${i + 1}. ${r.risk} | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Mitigation: ${r.mitigation || "(none)"} | Owner: ${r.owner || "(unassigned)"}`
    )
    .join("\n")
}

// Status Updates load most-recent-first everywhere else in the app; a
// post-mortem narrates what happened, so present them oldest-first here.
function statusUpdatesText(statusUpdates) {
  const entries = statusUpdates || []
  if (entries.length === 0) return null
  return [...entries]
    .reverse()
    .map((s) => {
      const dated = s.created_at ? String(s.created_at).slice(0, 10) : "(undated)"
      const parts = []
      if (s.what_got_done) parts.push(`What got done: ${s.what_got_done}`)
      if (s.whats_blocked) parts.push(`What's blocked: ${s.whats_blocked}`)
      if (s.whats_coming_up) parts.push(`What's coming up: ${s.whats_coming_up}`)
      return `${dated}\n${parts.join("\n") || "(no details logged)"}`
    })
    .join("\n\n")
}

function budgetText(budget) {
  const items = budget?.line_items || []
  if (items.length === 0) return null

  const totalEstimated = items.reduce((sum, r) => sum + (Number(r.estimated_amount) || 0), 0)
  const totalActual = items.reduce((sum, r) => sum + (Number(r.actual_amount) || 0), 0)
  const variance = totalActual - totalEstimated
  const variancePct = totalEstimated > 0 ? (variance / totalEstimated) * 100 : 0

  const lines = items.map(
    (r) =>
      `- ${r.category || "Uncategorized"} / ${r.name || "(unnamed)"}: estimated $${(Number(r.estimated_amount) || 0).toFixed(2)}, actual $${(Number(r.actual_amount) || 0).toFixed(2)}${r.notes ? ` (${r.notes})` : ""}`
  )

  return `${lines.join("\n")}\n\nTotal estimated: $${totalEstimated.toFixed(2)}\nTotal actual: $${totalActual.toFixed(2)}\nVariance: ${variance >= 0 ? "+" : ""}$${variance.toFixed(2)} (${variancePct >= 0 ? "+" : ""}${variancePct.toFixed(1)}%)`
}

function establishedContext(charter, riskLog, statusUpdates, budget) {
  const parts = []
  const c = charterText(charter)
  const r = riskLogText(riskLog)
  const s = statusUpdatesText(statusUpdates)
  const b = budgetText(budget)
  if (c) parts.push(`Original project charter (goals/success metrics):\n${c}`)
  if (r) parts.push(`Risk log (risks identified up front):\n${r}`)
  if (s) parts.push(`Status Update history, oldest first (what actually happened over time):\n${s}`)
  if (b) parts.push(`Budget Tracker (planned vs. actual spend):\n${b}`)
  return parts.length > 0 ? parts.join("\n\n") : null
}

const SECTION_LABELS = {
  objectives_met: "Objectives Met",
  what_went_well: "What Went Well",
  variances: "What Didn't Go Well / Variances",
  root_causes: "Root Causes",
  lessons_learned: "Lessons Learned",
  recommendations: "Recommendations for Future Projects",
}

function postMortemText(doc) {
  if (!doc) return null
  return Object.entries(SECTION_LABELS)
    .map(([key, label]) => `${label}: ${doc[key] || "(empty)"}`)
    .join("\n")
}

const REVISE_INSTRUCTIONS = {
  shorter:
    "Make this section noticeably more concise. Cut it down while keeping the key point(s) intact.",
  detail:
    "Add more relevant detail to this section, elaborating based on the project context provided. Do not invent specifics that aren't implied by the project data.",
  rephrase:
    "Rephrase this section with different wording while keeping the same meaning and roughly the same length.",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const {
      action,
      project,
      charter,
      riskLog,
      statusUpdates,
      budget,
      answers,
      doc,
      sectionKey,
      sectionText,
      instruction,
    } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, riskLog, statusUpdates, budget)

      const system =
        "You are a project management assistant preparing a post-mortem intake. You are given the project's original charter, risk log, full status update history, and budget tracker - everything factual (what the goals were, what happened over time, which risks materialized, and planned vs. actual spend) is already known from that data, so you never ask about it. You only ask reflective questions that require human judgment the data can't provide - things like team morale, what they'd personally do differently, or context that was never logged. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not ask about anything covered here - compare/summarize it yourself when writing the post-mortem):\n${context}` : "No charter, risk log, status updates, or budget tracker exist for this project yet - note that the post-mortem will be limited without them."}

Generate 2 to 4 short, targeted reflective questions that only the PM can answer - the kind of thing not inferable from the project data above (e.g. what they'd do differently next time, team dynamics, anything that went unrecorded, morale/stakeholder sentiment). Do not ask about facts already covered by the context (timeline slippage, budget variance, which risks happened, what got done) - those belong in the post-mortem's automatic analysis, not the intake.

For each question, decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"]}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      const context = establishedContext(charter, riskLog, statusUpdates, budget)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant writing a project post-mortem that blends formal PMI-style structure with a reflective, retrospective tone. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `${context}\n` : "No charter, risk log, status updates, or budget tracker were available for this project.\n"}
Reflective input from the PM:
${qaText || "(none provided)"}

Write a post-mortem with these sections:
- Objectives Met: compare the charter's stated goals/success metrics against what the status update history shows was actually delivered. Be specific about which were met, partially met, or missed.
- What Went Well
- What Didn't Go Well / Variances: call out timeline slippage, the budget variance (use the real estimated/actual numbers from the budget tracker, don't invent figures), and any scope changes visible in the status update history.
- Root Causes: for the risks that actually materialized (cross-reference the risk log against what the status updates describe as blocked/happened) and any other major issues, explain likely root causes.
- Lessons Learned
- Recommendations for Future Projects

Ground every claim in the project data and PM input above; do not invent specifics that weren't provided. If a section has too little information to say anything substantive, say so briefly rather than inventing content.

Return ONLY this JSON shape:
{"objectives_met": "...", "what_went_well": "...", "variances": "...", "root_causes": "...", "lessons_learned": "...", "recommendations": "..."}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "revise") {
      const instructionText = REVISE_INSTRUCTIONS[instruction]
      if (!instructionText) {
        return new Response(JSON.stringify({ error: `unknown instruction: ${instruction}` }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const system =
        "You are a project management assistant revising a single section of an existing post-mortem. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Section: ${SECTION_LABELS[sectionKey] || sectionKey}
Current text:
${sectionText}

Instruction: ${instructionText}

Rewrite ONLY this section's text per the instruction. Preserve the original format (plain paragraph vs "- " bullet list) unless the instruction implies otherwise. Do not include the section heading/label, just the body text.

Return ONLY this JSON shape:
{"revised": "..."}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "followup") {
      const system =
        "You are a project management assistant reviewing an existing post-mortem for gaps or ambiguities. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Current post-mortem:
${postMortemText(doc)}

Review this post-mortem for gaps, vague statements, or ambiguities. If you find genuine issues, write 1 to 3 short, targeted follow-up questions that would help clarify or improve specific sections. If it's already clear and complete, return an empty questions array rather than inventing filler questions.

For each question, decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers). Also specify which section key(s) from [${Object.keys(SECTION_LABELS).join(", ")}] the answer would primarily update.

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "sections": ["lessons_learned"]}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "apply_followup") {
      const targetKeys = [...new Set((answers || []).flatMap((a) => a.sections || []))].filter(
        (key) => SECTION_LABELS[key]
      )

      if (targetKeys.length === 0) {
        return new Response(JSON.stringify({ updates: {} }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")
      const currentSections = targetKeys
        .map((key) => `${SECTION_LABELS[key]}: ${doc[key] || "(empty)"}`)
        .join("\n")

      const system =
        "You are a project management assistant incorporating new answers into specific sections of an existing post-mortem. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Current text for the sections that need updating:
${currentSections}

New information from follow-up Q&A:
${qaText}

For each of these section keys: ${targetKeys.join(", ")} - rewrite that section's text to incorporate the new information above, keeping the rest of the section's existing content intact where still relevant. Preserve the original format (plain paragraph vs "- " bullet list) per section.

Return ONLY this JSON shape:
{"updates": {${targetKeys.map((k) => `"${k}": "..."`).join(", ")}}}`

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
