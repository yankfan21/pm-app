// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "send-collaborator-invite"
// Set the RESEND_API_KEY secret under Edge Functions -> send-collaborator-invite -> Secrets before invoking
// (shared secret name/value as send-task-notification / send-contact-notification - see those functions for the
// pattern this one follows).
// Remember to manually disable JWT verification for this function in Supabase Settings, same as every other
// Edge Function in this project. It's called from pg_net (project_collaborators insert trigger, not the frontend),
// so there's no logged-in user session to verify a JWT against anyway.
//
// Unlike send-task-notification, this never checks notification_preferences - collaborator invites always send.
//
// Caller: notify_collaborator_invite() trigger, in
// supabase/migrations/add_pending_collaborator_invites_and_cap.sql, on every project_collaborators insert.
//
// Expected body:
//   {
//     event_type: 'collaborator_added' | 'collaborator_invite_signup',
//     recipient_email: string,
//     recipient_user_id: string (uuid) | null,   // null for collaborator_invite_signup
//     project_id: string (uuid),
//     project_name: string | null,
//     role: 'editor' | 'viewer',
//   }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_EVENT_TYPES = ["collaborator_added", "collaborator_invite_signup"]

function buildEmail(body: Record<string, unknown>) {
  const { event_type, project_name, role } = body
  const projectLabel = project_name || "a project"

  if (event_type === "collaborator_added") {
    return {
      subject: `You've been added to ${projectLabel}`,
      text: `You've been given ${role} access to ${projectLabel} on ConfidantPM.

Sign in to see it: https://confidantpm.com/login`,
    }
  }

  // collaborator_invite_signup
  return {
    subject: `You've been invited to ${projectLabel} on ConfidantPM`,
    text: `Someone invited you to collaborate on ${projectLabel} as a ${role} on ConfidantPM.

Create an account with this email address to get access: https://confidantpm.com/login?mode=signup`,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { event_type, recipient_email, project_id, role } = body

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return new Response(JSON.stringify({ error: `Invalid event_type: ${event_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }
    if (!recipient_email || !project_id || !role) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const apiKey = Deno.env.get("RESEND_API_KEY")
    if (!apiKey) throw new Error("RESEND_API_KEY secret is not set")

    const { subject, text } = buildEmail(body)

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "ConfidantPM <noreply@confidantpm.com>",
        to: [recipient_email],
        subject,
        text,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Resend API error (${resp.status}): ${errText}`)
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  }
})
