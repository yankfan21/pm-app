// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "admin-data"
// Remember to manually disable JWT verification for this function in Supabase Settings,
// same as every other Edge Function in this project - the caller's identity is checked
// in code below (against ADMIN_EMAIL), not by the platform's JWT gate.
//
// Backs the hidden /admin page: returns every user, their owned + collaborator
// projects, and their AI usage/cost rollup from ai_usage_log. Service-role only -
// this is the one place in the app allowed to read across every user's data, so
// the ADMIN_EMAIL check below is the entire access boundary. The service role key
// never reaches the frontend; this function is the only thing that holds it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Single source of truth for the admin gate on this side - the frontend has its
// own copy in src/adminConfig.js. Keep both in sync if this ever changes.
const ADMIN_EMAIL = "admin@confidantpm.com"

// Sonnet 5 standard pricing as of Aug 2026 (an introductory $2/$10 rate applies
// through 2026-08-31, not used here since it's expiring). Check
// https://platform.claude.com/docs/en/pricing before trusting these long-term -
// Anthropic pricing changes independent of this app.
const INPUT_COST_PER_MTOK = 3.0
const OUTPUT_COST_PER_MTOK = 15.0

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: { user } } = await authClient.auth.getUser()

    if (!user || user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))

    const [usersResult, projectsResult, collaboratorsResult, usageResult] = await Promise.all([
      serviceClient.auth.admin.listUsers({ perPage: 1000 }),
      serviceClient.from("projects").select("id, name, owner_id"),
      serviceClient.from("project_collaborators").select("project_id, user_id, role"),
      serviceClient.from("ai_usage_log").select("user_id, input_tokens, output_tokens"),
    ])

    if (usersResult.error) throw usersResult.error
    if (projectsResult.error) throw projectsResult.error
    if (collaboratorsResult.error) throw collaboratorsResult.error
    if (usageResult.error) throw usageResult.error

    const projects = projectsResult.data ?? []
    const collaborators = collaboratorsResult.data ?? []
    const usage = usageResult.data ?? []

    // Per-user usage rollup: call count, total tokens, $ cost from the pricing
    // constants above.
    const usageByUser = new Map()
    for (const row of usage) {
      if (!row.user_id) continue
      const entry = usageByUser.get(row.user_id) ?? {
        call_count: 0,
        input_tokens: 0,
        output_tokens: 0,
      }
      entry.call_count += 1
      entry.input_tokens += row.input_tokens ?? 0
      entry.output_tokens += row.output_tokens ?? 0
      usageByUser.set(row.user_id, entry)
    }

    const users = (usersResult.data.users ?? []).map((u) => {
      const owned = projects
        .filter((p) => p.owner_id === u.id)
        .map((p) => ({ id: p.id, name: p.name, role: "owner" }))
      const collaborating = collaborators
        .filter((c) => c.user_id === u.id)
        .map((c) => {
          const project = projects.find((p) => p.id === c.project_id)
          return { id: c.project_id, name: project?.name ?? "(unknown project)", role: c.role }
        })

      const rawUsage = usageByUser.get(u.id) ?? { call_count: 0, input_tokens: 0, output_tokens: 0 }
      const estimated_cost_usd =
        (rawUsage.input_tokens / 1_000_000) * INPUT_COST_PER_MTOK +
        (rawUsage.output_tokens / 1_000_000) * OUTPUT_COST_PER_MTOK

      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        projects: [...owned, ...collaborating],
        usage: {
          call_count: rawUsage.call_count,
          total_tokens: rawUsage.input_tokens + rawUsage.output_tokens,
          estimated_cost_usd,
        },
      }
    })

    return new Response(JSON.stringify({ users }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  }
})
