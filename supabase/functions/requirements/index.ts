// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "requirements"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> requirements -> Secrets before invoking.

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
      max_tokens: 1200,
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

const SECTION_LABELS = {
  problem_statement: "Problem Statement",
  objectives: "Objectives",
  scope_in: "Scope (In)",
  scope_out: "Scope (Out)",
  functional_requirements: "Functional Requirements",
  constraints: "Constraints",
  assumptions: "Assumptions",
}

function briefText(brief) {
  return Object.entries(SECTION_LABELS)
    .map(([key, label]) => `${label}: ${brief[key] || "(empty)"}`)
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

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, answers, brief, sectionKey, sectionText, instruction } =
      await req.json()

    if (action === "questions") {
      const establishedContext = charterText(charter)

      const system =
        "You are a project management assistant preparing a Requirements/Discovery Brief. You first check what is already established from the project data and any existing project charter, and only ask about what's genuinely still missing. Where you can reasonably infer a likely answer from the context already given, you propose it as a suggestion for the PM to accept, edit, or dismiss - you never present a guess as settled fact. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${establishedContext ? `Existing project charter (already established - do not re-ask about anything covered here):\n${establishedContext}` : "No project charter exists yet for this project."}

Generate 3 to 6 short, targeted discovery questions to gather information not already covered above, needed to write a Requirements/Discovery Brief covering: Problem Statement, Objectives, Scope (In/Out), Functional Requirements, Constraints, Assumptions. Skip anything already answered by the project data or charter above.

For each question:
- Decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).
- If you can reasonably infer a likely answer from the project context above, include it as "suggested_answer" - phrased so the PM can quickly tell it's a proposal (e.g. "Based on this project's goal, a likely constraint is X - does this apply?"). Only include a suggestion when it's a reasonable inference from what's already known, never a fabricated guess. Otherwise set "suggested_answer" to null.

Return ONLY this JSON shape:
${QUESTION_SHAPE_HINT}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      const establishedContext = charterText(charter)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        "You are a project management assistant. You write concise, professional Requirements/Discovery Briefs. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${establishedContext ? `Existing project charter for context:\n${establishedContext}` : ""}

Additional context from discovery Q&A:
${qaText || "(none provided)"}

Write a Requirements/Discovery Brief with these sections: Problem Statement, Objectives, Scope (In), Scope (Out), Functional Requirements, Constraints, Assumptions. Keep each section concise (2-5 sentences, or a short bullet list using "- " prefixes; Functional Requirements should usually be a bullet list). Base it on the project data, charter (if provided), and Q&A above; do not invent specifics that weren't provided.

Return ONLY this JSON shape:
{"problem_statement": "...", "objectives": "...", "scope_in": "...", "scope_out": "...", "functional_requirements": "...", "constraints": "...", "assumptions": "..."}`

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
        "You are a project management assistant revising a single section of an existing Requirements/Discovery Brief. Respond with ONLY a JSON object, no markdown fences, no other text."
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
        "You are a project management assistant reviewing an existing Requirements/Discovery Brief for gaps or ambiguities. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Current brief:
${briefText(brief)}

Review this brief for gaps, vague statements, or ambiguities. If you find genuine issues, write 1 to 3 short, targeted follow-up questions that would help clarify or improve specific sections. If the brief is already clear and complete, return an empty questions array rather than inventing filler questions.

For each question:
- Decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).
- Specify which section key(s) from [${Object.keys(SECTION_LABELS).join(", ")}] the answer would primarily update.
- If you can reasonably infer a likely answer from the brief and project context, include it as "suggested_answer" for the PM to accept, edit, or dismiss; otherwise set it to null.

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "..." , "sections": ["constraints"]}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B"], "suggested_answer": null, "sections": ["scope_in", "scope_out"]}]}`

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
        .map((key) => `${SECTION_LABELS[key]}: ${brief[key] || "(empty)"}`)
        .join("\n")

      const system =
        "You are a project management assistant incorporating new answers into specific sections of an existing Requirements/Discovery Brief. Respond with ONLY a JSON object, no markdown fences, no other text."
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
