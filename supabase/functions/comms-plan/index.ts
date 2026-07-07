// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "comms-plan"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> comms-plan -> Secrets before invoking.
//
// Backs both the Exec Comms Plan and Team Newsletter document types, which
// share one Q&A intake (the "questions" action is variant-agnostic) but
// produce different output shapes/tone (the "generate" and other actions
// branch on the "variant" field: "exec" | "newsletter").

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
        `${i + 1}. ${r.risk} | Likelihood: ${r.likelihood} | Impact: ${r.impact} | Mitigation: ${r.mitigation || "(none)"} | Owner: ${r.owner || "(unassigned)"}`
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

const SECTION_LABELS_BY_VARIANT = {
  exec: {
    status_summary: "Status Summary",
    key_decisions: "Key Decisions Needed",
    risks_blockers: "Risks & Blockers",
    ask: "The Ask",
  },
  newsletter: {
    highlights: "Highlights & Wins",
    upcoming_milestones: "Upcoming Milestones",
    shoutouts: "Shoutouts",
    links: "Links & Resources",
  },
}

const VARIANT_DOC_LABEL = {
  exec: "Exec Comms Plan",
  newsletter: "Team Newsletter",
}

function docText(doc, sectionLabels) {
  if (!doc) return null
  return Object.entries(sectionLabels)
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

const QUESTION_SHAPE_HINT =
  '{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "a proposed answer the PM can accept, edit, or dismiss, or null if you have no reasonable basis to suggest one"}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "suggested_answer": "A" }]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const {
      action,
      variant,
      project,
      charter,
      brief,
      riskLog,
      answers,
      doc,
      sectionKey,
      sectionText,
      instruction,
    } = await req.json()

    if (action === "questions") {
      const context = establishedContext(charter, brief, riskLog)

      const system =
        "You are a project management assistant preparing a Stakeholder Communications Plan intake. You first check what is already established from the project data and any existing project charter, requirements brief, and risk log, and only ask about what's genuinely still missing. Where you can reasonably infer a likely answer from the context already given, you propose it as a suggestion for the PM to accept, edit, or dismiss - you never present a guess as settled fact. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

${context ? `Already established (do not re-ask about anything covered here):\n${context}` : "No project charter, requirements brief, or risk log exists yet for this project."}

Gather answers to these 4 topics needed to write a stakeholder communications plan (this intake is shared by two downstream documents - an Exec Comms update and a Team Newsletter - so keep questions general-purpose rather than audience-specific):
1. Key messages or updates to communicate this period
2. Audience concerns or sensitivities that need to be addressed
3. Communication cadence (e.g. weekly, biweekly, monthly, ad hoc)
4. Preferred communication channels (e.g. email, Slack, all-hands meeting)

For each topic, decide if it's better answered with free text or a small set of button choices (max 4 choices - cadence and channels are natural choice candidates). If the context above already answers a topic, either skip it entirely or include it with a "suggested_answer" pre-filled from that context so the PM can just confirm it - prefer including it with a suggestion over skipping outright, unless the topic is genuinely not applicable to this project. Only include a suggestion when it's a reasonable inference from what's already known, never a fabricated guess.

Return ONLY this JSON shape:
${QUESTION_SHAPE_HINT}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "generate") {
      if (!SECTION_LABELS_BY_VARIANT[variant]) {
        return new Response(JSON.stringify({ error: `unknown variant: ${variant}` }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const context = establishedContext(charter, brief, riskLog)
      const qaText = (answers || [])
        .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
        .join("\n\n")

      const system =
        variant === "exec"
          ? "You are a project management assistant. You write concise, high-level status communications for executive/leadership audiences. Respond with ONLY a JSON object, no markdown fences, no other text."
          : "You are a project management assistant. You write friendly, engaging team newsletters. Respond with ONLY a JSON object, no markdown fences, no other text."

      const instructions =
        variant === "exec"
          ? `Write a concise Exec Comms update with these sections: Status Summary, Key Decisions Needed, Risks & Blockers, The Ask. Keep it short and direct - this is for leadership, not the full team. Each section should be 1-4 sentences or a short bullet list ("- " prefix) where appropriate.`
          : `Write a Team Newsletter with these sections: Highlights & Wins, Upcoming Milestones, Shoutouts, Links & Resources. Use a friendly, narrative, engaging tone aimed at the project team - more conversational than a status report. For Shoutouts, only name specific people/teams if named in the context provided, otherwise keep it general (e.g. "great work from the whole team on X") rather than inventing names. For Links & Resources, reference relevant project docs already established (charter, requirements brief, risk log) by name where relevant.`

      const user = `${projectContext(project)}

${context ? `${context}\n` : ""}
Additional context from communications Q&A:
${qaText || "(none provided)"}

${instructions} Base it on the project data, charter/brief/risk log (if provided), and Q&A above; do not invent specifics that weren't provided.

Return ONLY this JSON shape:
{${Object.keys(SECTION_LABELS_BY_VARIANT[variant])
        .map((k) => `"${k}": "..."`)
        .join(", ")}}`

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

      const sectionLabels = SECTION_LABELS_BY_VARIANT[variant] || {}

      const system =
        "You are a project management assistant revising a single section of an existing stakeholder communications document. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Section: ${sectionLabels[sectionKey] || sectionKey}
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
      const sectionLabels = SECTION_LABELS_BY_VARIANT[variant]
      if (!sectionLabels) {
        return new Response(JSON.stringify({ error: `unknown variant: ${variant}` }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const docLabel = VARIANT_DOC_LABEL[variant]

      const system =
        `You are a project management assistant reviewing an existing ${docLabel} for gaps or ambiguities. Respond with ONLY a JSON object, no markdown fences, no other text.`
      const user = `${projectContext(project)}

Current ${docLabel}:
${docText(doc, sectionLabels)}

Review this document for gaps, vague statements, or ambiguities. If you find genuine issues, write 1 to 3 short, targeted follow-up questions that would help clarify or improve specific sections. If the document is already clear and complete, return an empty questions array rather than inventing filler questions.

For each question:
- Decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).
- Specify which section key(s) from [${Object.keys(sectionLabels).join(", ")}] the answer would primarily update.
- If you can reasonably infer a likely answer from the document and project context, include it as "suggested_answer" for the PM to accept, edit, or dismiss; otherwise set it to null.

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "suggested_answer": "...", "sections": ["${Object.keys(sectionLabels)[0]}"]}]}`

      const result = await callClaude(system, user)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "apply_followup") {
      const sectionLabels = SECTION_LABELS_BY_VARIANT[variant]
      if (!sectionLabels) {
        return new Response(JSON.stringify({ error: `unknown variant: ${variant}` }), {
          status: 400,
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const targetKeys = [...new Set((answers || []).flatMap((a) => a.sections || []))].filter(
        (key) => sectionLabels[key]
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
        .map((key) => `${sectionLabels[key]}: ${doc[key] || "(empty)"}`)
        .join("\n")

      const system =
        "You are a project management assistant incorporating new answers into specific sections of an existing stakeholder communications document. Respond with ONLY a JSON object, no markdown fences, no other text."
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
