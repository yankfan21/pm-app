// Deployed via CLI: npx supabase functions deploy comm-plan --project-ref ihualqkokgchmzoeumxo
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> comm-plan -> Secrets before invoking
// (shared project secret, set once - see CLAUDE.md "Known infrastructure quirks").
// JWT verification must be manually disabled for this function in Supabase Settings, same as every other AI Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"
const FUNCTION_NAME = "comm-plan"

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim())
}

// Copied verbatim from stakeholder-registry/index.ts (itself copied from
// risk-log/index.ts) - same retry/parse behavior needed here (429/5xx
// retry, truncated-body retry, JSON-parse retry), none of it specific to
// comm plan items.
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

// Copied verbatim from stakeholder-registry/index.ts - fire-and-forget
// usage logging, never allowed to block or fail the actual AI response.
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

// Stakeholder Registry context - same "here's who exists, reference them by
// name in your proposed audience" shape the frontend needs to map names
// back to stakeholder ids after the response comes back.
function stakeholdersText(stakeholders) {
  if (!stakeholders || stakeholders.length === 0) return "(none logged yet)"
  return stakeholders
    .map(
      (s, i) =>
        `${i + 1}. ${s.name}${s.role_title ? ` - ${s.role_title}` : ""}${s.org ? ` (${s.org})` : ""} | Quadrant: ${s.quadrant}`
    )
    .join("\n")
}

// "do not repeat these" context, same shape/purpose as stakeholder-registry's
// stakeholdersText / risk-log's risksText.
function existingItemsText(items) {
  if (!items || items.length === 0) return "(none yet)"
  return items
    .map((item, i) => `${i + 1}. ${item.type} - ${item.format}, ${item.frequency}${item.purpose ? ` - ${item.purpose}` : ""}`)
    .join("\n")
}

const COMM_PLAN_ITEM_SHAPE_HINT =
  '{"type": one of the Type values below, "purpose": "one sentence on what this communication is for, or empty string", "owner": "who sends/runs it if the text implies one, otherwise empty string", "format": one of the Format values below, "frequency": one of the Frequency values below, "audience": ["exact stakeholder name", ...] }'

// Same named-anchor + explicit anti-default-to-middle technique as
// stakeholder-registry's QUADRANT_GUIDE / risk-log's RISK_SCALE_GUIDE: name
// every valid enum value so Claude never invents one, and forbid defaulting
// out of uncertainty rather than genuinely reasoning from the text.
const CLASSIFICATION_GUIDE = `For each proposed communication, pick the single best-fit value for each of these three fields - never default to one value out of uncertainty:

Type (what the communication is about) - exactly one of:
Status Update, Milestone/Deliverable Report, Risk/Issue Escalation, Budget Review, Decision Request, Stakeholder Check-in, Kickoff/Onboarding, Project Close-out

Format (how it's delivered) - exactly one of:
Email, Meeting, Status Report

Frequency (how often it recurs) - exactly one of:
Daily, Weekly, Biweekly, Monthly, Ad hoc

"audience" must be an array of exact names taken only from the Stakeholder Registry list below - never invent a name, never include a stakeholder not in that list, and it's fine to propose an empty array if no specific stakeholder from the list is clearly implied for that item.`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, stakeholders, items } = await req.json()

    if (action === "suggest") {
      const charterText = [charter?.purpose, charter?.scope].filter(Boolean).join("\n\n").trim()

      // Cheap early exit - mirrors stakeholder-registry's own empty-input
      // guard: nothing worth spending a Claude call on if there's no
      // Charter context and no stakeholders to plan communications around.
      if (!charterText && (!stakeholders || stakeholders.length === 0)) {
        return new Response(JSON.stringify({ items: [] }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const system =
        "You are a project management assistant proposing additional entries for an existing Communication Plan, based on a project's Charter and its Stakeholder Registry. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Charter context (Purpose + Scope):
${charterText || "(no Charter Purpose/Scope text available)"}

Stakeholder Registry (reference these by exact name in "audience"):
${stakeholdersText(stakeholders)}

Communication plan items already logged (do not repeat these):
${existingItemsText(items)}

Propose communication plan items that are NOT already logged, appropriate for this project's stakeholders and phase. Only propose items genuinely supported by the context above - do not invent audiences or purposes with no basis in it. If nothing new is worth proposing, return an empty array.

${CLASSIFICATION_GUIDE}

Return ONLY this JSON shape:
{"items": [${COMM_PLAN_ITEM_SHAPE_HINT}]}`

      const { result, usage } = await callClaude(system, user)
      await logUsage(req, project, usage)
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
