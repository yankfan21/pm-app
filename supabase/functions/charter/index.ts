// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "charter"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> charter -> Secrets before invoking.

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

const SECTION_LABELS = {
  purpose: "Purpose",
  scope: "Scope",
  stakeholders: "Stakeholders",
  success_metrics: "Success Metrics",
  risks: "Risks",
  timeline: "Timeline",
}

function charterText(charter) {
  return Object.entries(SECTION_LABELS)
    .map(([key, label]) => `${label}: ${charter[key] || "(empty)"}`)
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
    const { action, project, answers, charter, sectionKey, sectionText, instruction } =
      await req.json()

    if (action === "questions") {
      const system =
        "You are a project management assistant. You write short, specific follow-up questions to fill gaps before writing a project charter. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Generate 3 to 5 short, targeted follow-up questions to gather information not already covered above, useful for writing a project charter (e.g. key stakeholders, success metric, known risks, budget if relevant to this project). Skip questions that don't apply to this kind of project.

For each question decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"]}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      const system =
        "You are a project management assistant. You write concise, professional project charters. Respond with ONLY a JSON object, no markdown fences, no other text."
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")
      const user = `${projectContext(project)}

Additional context from follow-up Q&A:
${qaText}

Write a project charter with these sections: Purpose, Scope, Stakeholders, Success Metrics, Risks, Timeline. Keep each section concise (2-5 sentences, or a short bullet list using "- " prefixes). Base it on the project data and Q&A above; do not invent specifics that weren't provided.

Return ONLY this JSON shape:
{"purpose": "...", "scope": "...", "stakeholders": "...", "success_metrics": "...", "risks": "...", "timeline": "..."}`

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
        "You are a project management assistant revising a single section of an existing project charter. Respond with ONLY a JSON object, no markdown fences, no other text."
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
        "You are a project management assistant reviewing an existing project charter for gaps or ambiguities. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Current charter:
${charterText(charter)}

Review this charter for gaps, vague statements, or ambiguities. If you find genuine issues, write 1 to 3 short, targeted follow-up questions that would help clarify or improve specific sections. If the charter is already clear and complete, return an empty questions array rather than inventing filler questions.

For each question, decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers). Also specify which section key(s) from [purpose, scope, stakeholders, success_metrics, risks, timeline] the answer would primarily update.

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "sections": ["stakeholders"]}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B"], "sections": ["risks", "timeline"]}]}`

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
        .map((key) => `${SECTION_LABELS[key]}: ${charter[key] || "(empty)"}`)
        .join("\n")

      const system =
        "You are a project management assistant incorporating new answers into specific sections of an existing project charter. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Current text for the sections that need updating:
${currentSections}

New information from follow-up Q&A:
${qaText}

For each of these section keys: ${targetKeys.join(", ")} — rewrite that section's text to incorporate the new information above, keeping the rest of the section's existing content intact where still relevant. Preserve the original format (plain paragraph vs "- " bullet list) per section.

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
