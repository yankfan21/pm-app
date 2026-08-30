// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "scoping"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> scoping -> Secrets before invoking.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"
const FUNCTION_NAME = "scoping"

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
    return { result: extractJson(text), usage: data.usage }
  } catch {
    if (attempt < 3) return callClaude(system, user, attempt + 1)
    const blockTypes = (data.content || []).map((b) => b.type).join(", ")
    throw new Error(
      `Could not parse Claude's response as JSON after ${attempt} attempts. ` +
        `stop_reason=${data.stop_reason}, content block types=[${blockTypes}], text="${text.slice(0, 200)}"`
    )
  }
}

// Fire-and-forget usage logging for the admin usage/cost page - never
// allowed to block or fail the actual AI response returned to the PM.
// Two clients: the anon-key one (forwarding the caller's JWT) only resolves
// who the caller is; ai_usage_log itself is default-deny RLS (see
// supabase/migrations/create_ai_usage_log.sql), so the actual insert goes
// through the service role client.
async function logUsage(req, project, usage) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))
    await serviceClient.from("ai_usage_log").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      function_name: FUNCTION_NAME,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
    })
  } catch {
    // Logging failure must never surface to the caller.
  }
}

function projectContext(project) {
  return `Project name: ${project.name}
Goal: ${project.goal}
Priority: ${project.priority}
Deadline: ${project.deadline ?? "TBD"}`
}

// Scoping runs before anything else in the wizard, so unlike charter/risk-log
// there's no established-context block to fold in here - project data is all
// there is to go on.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, answers, stage } = await req.json()

    if ((action === "questions" || action === "evaluate") && stage !== "initiation" && stage !== "risk") {
      return new Response(JSON.stringify({ error: 'stage must be "initiation" or "risk"' }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "questions") {
      const system =
        "You are a project management assistant running a Scoping session before any other project documents are drafted. You surface the constraints and unknowns most likely to derail this project before real planning starts. Respond with ONLY a JSON object, no markdown fences, no other text."

      const user =
        stage === "risk"
          ? `${projectContext(project)}

Generate scoping questions for this project, covering:

Vital (mark "vital": true) - these matter enough that a thin or missing answer should be flagged before finishing:
- The hardest constraint that can't move (budget, deadline, a fixed regulatory date, a non-negotiable resource limit, etc.)
- Who has final approval / final say on this project's direction
- Key external dependencies (vendors, other teams, third-party systems, approvals from outside the immediate team)

Supporting (mark "vital": false) - useful context, but a thin answer is fine here:
- What's killed or badly delayed similar projects before
- Any single point of failure or key-person risk (one person or system this project can't proceed without)

Skip a topic entirely if it plainly doesn't apply to this kind of project, rather than forcing a question. For each question, decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "vital": true}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "vital": false}]}`
          : `${projectContext(project)}

Generate initiation questions for this project - roughly 5-6 questions, targeting one question per topic below as a base set:

Vital (mark "vital": true) - these matter enough that a thin or missing answer should be flagged before finishing (the same end-of-session follow-up check already used for every vital answer in this Scoping session applies here too):
- Scope boundaries: what's explicitly in scope versus out
- Success criteria / definition of done
- Stakeholder and approval structure: who approves what

Supporting (mark "vital": false) - useful context, but a thin answer is fine here:
- Deliverables and format expectations
- Budget or resource constraints

Skip a topic entirely if it plainly doesn't apply to this kind of project, rather than forcing a question. For each question, decide if it's better answered with free text or a small set of button choices (max 4 choices, only for genuinely categorical answers).

Return ONLY this JSON shape:
{"questions": [{"id": "short_snake_case_id", "text": "question text", "type": "text", "vital": true}, {"id": "short_snake_case_id", "text": "question text", "type": "choice", "choices": ["A", "B", "C"], "vital": false}]}`

      const { result, usage } = await callClaude(system, user)
      await logUsage(req, project, usage)
      const taggedQuestions = (result.questions || []).map((q) => ({ ...q, stage }))
      return new Response(JSON.stringify({ ...result, questions: taggedQuestions }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "evaluate") {
      const vitalAnswers = (answers || []).filter((a) => a.vital)
      const vitalQaText = vitalAnswers.length
        ? vitalAnswers
            .map((a) => `ID: ${a.id}\nQ: ${a.question}\nA: ${a.answer || "(no answer given)"}`)
            .join("\n\n")
        : "(no vital questions were asked)"

      const system =
        "You are a project management assistant doing an end-of-session review of a Scoping Q&A. You check only the vital answers for substantiveness - a real, specific answer versus something too thin to be useful later (missing, one word, \"N/A\", \"not sure\", etc). Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Vital answers from this scoping session (only these are being evaluated - supporting/non-vital answers are not checked here):
${vitalQaText}

For any vital answer that's thin or missing, write a short, specific, encouraging nudge prompting the PM to add more - reference why that particular answer matters rather than a generic "please elaborate". If every vital answer is adequately substantive, return sufficient: true with an empty followups array.

Return ONLY this JSON shape:
{"sufficient": true, "followups": []}
or
{"sufficient": false, "followups": [{"questionId": "the ID from above", "prompt": "short specific nudge"}]}`

      const { result, usage } = await callClaude(system, user)
      await logUsage(req, project, usage)
      return new Response(JSON.stringify({ ...result, stage }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    if (action === "suggest_methodology") {
      // Mirrors src/methodology.js - kept as a literal here since Edge
      // Functions run on Deno, separate from the Vite/React build that file
      // lives in.
      const qaText = (answers || []).length
        ? answers
            .map((a) => `Q: ${a.question}\nA: ${a.answer || "(no answer given)"}`)
            .join("\n\n")
        : "(no initiation answers given)"

      const system =
        "You are a project management assistant suggesting a project methodology based on a PM's initiation-stage scoping answers. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Initiation answers from this scoping session:
${qaText}

Based on these answers, suggest whether this project is better run as "waterfall", "agile", or "hybrid". Only suggest a methodology if the answers clearly point toward one being a meaningfully better fit than a reasonable default - if the answers are too sparse to judge, or don't clearly favor a particular methodology, return null instead of guessing. Either way, write a short (1-3 sentence) plain-language reason referencing specifically what in the answers led to your conclusion, written as the assistant speaking directly to the PM (never refer to yourself as "AI").

Return ONLY this JSON shape:
{"suggestedMethodology": "waterfall", "reason": "short reason"}
or
{"suggestedMethodology": null, "reason": "short reason explaining why no suggestion is being made"}`

      const { result, usage } = await callClaude(system, user)
      await logUsage(req, project, usage)
      return new Response(JSON.stringify({ ...result, stage: "initiation" }), {
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
