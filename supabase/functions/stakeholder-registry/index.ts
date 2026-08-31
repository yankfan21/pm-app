// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "stakeholder-registry"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> stakeholder-registry -> Secrets before invoking.
// JWT verification must be manually disabled for this function in Supabase Settings, same as every other AI Edge Function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"
const FUNCTION_NAME = "stakeholder-registry"

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.trim())
}

// Copied verbatim from risk-log/index.ts - same retry/parse behavior needed
// here (429/5xx retry, truncated-body retry, JSON-parse retry), none of it
// specific to risks.
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

// Copied verbatim from risk-log/index.ts - fire-and-forget usage logging,
// never allowed to block or fail the actual AI response.
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

// "do not repeat these" context, same shape/purpose as risk-log's risksText.
function stakeholdersText(stakeholders) {
  if (!stakeholders || stakeholders.length === 0) return "(none yet)"
  return stakeholders
    .map(
      (s, i) =>
        `${i + 1}. ${s.name}${s.role_title ? ` - ${s.role_title}` : ""}${s.org ? ` (${s.org})` : ""} | Quadrant: ${s.quadrant}`
    )
    .join("\n")
}

const STAKEHOLDER_ROW_SHAPE_HINT =
  '{"name": "stakeholder\'s name", "role_title": "their role or title, or empty string if unknown", "org": "their organization/department, or empty string if unknown", "contact_info": "email or other contact detail only if the text gives one, otherwise empty string", "quadrant": "manage_closely" | "keep_satisfied" | "keep_informed" | "monitor"}'

// Same named-anchor + explicit anti-default-to-middle technique as risk-log's
// RISK_SCALE_GUIDE, adapted from a 1-5 scale to a 2x2 quadrant: name each of
// the 4 valid values, describe the two axes it's derived from (Influence x
// Interest, the standard stakeholder-matrix framing), and forbid defaulting
// to any one quadrant out of uncertainty rather than genuinely reasoning
// from the text.
const QUADRANT_GUIDE = `Classify each stakeholder into exactly one of these 4 quadrants, based on their Influence (power to affect the project's decisions and resources) and Interest (how much the project's outcome affects or concerns them) - pick the single best-fit quadrant for each stakeholder from the Charter text, never default to one quadrant out of uncertainty:
manage_closely: High Influence, High Interest - key decision-makers and champions, engage closely
keep_satisfied: High Influence, Low Interest - has power over the project but isn't closely tracking it day-to-day, keep satisfied
keep_informed: Low Influence, High Interest - cares about the outcome but limited power to affect it, keep informed
monitor: Low Influence, Low Interest - peripheral to the project, monitor with minimal effort`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { action, project, charter, stakeholders } = await req.json()

    if (action === "suggest") {
      const charterStakeholdersText = (charter?.stakeholders || "").trim()

      // Cheap early exit - an empty/missing Charter Stakeholders section
      // means there's nothing to extract from, so skip the AI call entirely
      // rather than spend tokens asking Claude to find stakeholders in
      // nothing. No other suggest action in this codebase has this exact
      // check (risk-log's suggest always has project context to reason from
      // even with an empty charter), but it's the same "don't give Claude a
      // pointless task" instinct behind risk-log's own empty-array return
      // when it finds nothing new to propose.
      if (!charterStakeholdersText) {
        return new Response(JSON.stringify({ stakeholders: [] }), {
          headers: { ...corsHeaders, "content-type": "application/json" },
        })
      }

      const system =
        "You are a project management assistant proposing additional entries for an existing Stakeholder Registry, extracted from a project charter's free-text Stakeholders section. Respond with ONLY a JSON object, no markdown fences, no other text."
      const user = `${projectContext(project)}

Charter's Stakeholders section (free text - may be prose or a bullet list):
${charterStakeholdersText}

Stakeholders already in the registry (do not repeat these):
${stakeholdersText(stakeholders)}

Extract the individual stakeholders named or clearly implied in the Charter text above who are NOT already in the registry. Skip anything too vague to name as a stakeholder (e.g. "the finance team" with no individual and no clear standalone role), unless the text plainly treats a named group as its own actor. For each stakeholder, provide their role/title, organization, and contact info only where the text actually gives one - do not invent details that aren't there. Only propose stakeholders genuinely supported by the text above. If you can't identify any new stakeholders, return an empty array.

${QUADRANT_GUIDE}

Return ONLY this JSON shape:
{"stakeholders": [${STAKEHOLDER_ROW_SHAPE_HINT}]}`

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
