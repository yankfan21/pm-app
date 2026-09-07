// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "send-task-notification"
// Set the RESEND_API_KEY secret under Edge Functions -> send-task-notification -> Secrets before invoking
// (shared secret name, same as send-contact-notification - see that function for the pattern this one follows).
// Remember to manually disable JWT verification for this function in Supabase Settings, same as every other
// Edge Function in this project. It's called from pg_net (DB trigger + cron job, not the frontend), so there's
// no logged-in user session to verify a JWT against anyway.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are NOT set manually - Supabase auto-injects both into every Edge
// Function's environment. Used here (PostgREST call, service-role key) only to read notification_preferences -
// this function never writes to the database.
//
// Callers (both write the same JSON shape):
//   - task_assignment_notification_trigger.sql, on assignee_user_id being set to a real user
//   - task_notification_cron.sql, daily, for due-soon/overdue tasks and backlog-in-sprint items
//
// Expected body:
//   {
//     event_type: 'task_assigned' | 'task_due_soon' | 'task_overdue',
//     recipient_user_id: string (uuid),
//     recipient_email: string,
//     task_id: string (uuid),
//     task_title: string,
//     project_id: string (uuid),
//     project_name: string,
//     due_date: string | null,          // ISO date, e.g. "2026-08-02"
//     reminder_label: string | null,    // e.g. "in 3 days", "tomorrow", "3 days overdue" - only for due_soon/overdue
//   }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const VALID_EVENT_TYPES = ["task_assigned", "task_due_soon", "task_overdue"]

const APP_LOGIN_URL = "https://confidantpm.com/login"
const IOS_APP_URL = "https://apps.apple.com/app/confidantpm/id6800421213"

const CTA_TEXT = `

Open in ConfidantPM: ${APP_LOGIN_URL}
Get the iOS App: ${IOS_APP_URL}`

const CTA_HTML = `
<div style="margin-top:24px;">
  <a href="${APP_LOGIN_URL}" style="display:inline-block;background-color:#2563eb;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-family:sans-serif;font-size:14px;margin-right:12px;">Open in ConfidantPM</a>
  <a href="${IOS_APP_URL}" style="display:inline-block;background-color:#000000;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-family:sans-serif;font-size:14px;">Get the iOS App</a>
</div>`

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function buildEmail(body: Record<string, unknown>) {
  const { event_type, task_title, project_name, due_date, reminder_label } = body
  const safeTaskTitle = escapeHtml(task_title)
  const safeProjectName = escapeHtml(project_name)
  const safeDueDate = escapeHtml(due_date)

  if (event_type === "task_assigned") {
    return {
      subject: `You've been assigned: ${task_title}`,
      text: `You've been assigned a task in ${project_name}.

Task: ${task_title}
${due_date ? `Due: ${due_date}` : "No due date set"}${CTA_TEXT}`,
      html: `<p>You've been assigned a task in ${safeProjectName}.</p>
<p>Task: ${safeTaskTitle}<br>
${due_date ? `Due: ${safeDueDate}` : "No due date set"}</p>${CTA_HTML}`,
    }
  }

  if (event_type === "task_due_soon") {
    return {
      subject: `Due ${reminder_label ?? "soon"}: ${task_title}`,
      text: `A task in ${project_name} is due ${reminder_label ?? "soon"}.

Task: ${task_title}
Due: ${due_date}${CTA_TEXT}`,
      html: `<p>A task in ${safeProjectName} is due ${escapeHtml(reminder_label ?? "soon")}.</p>
<p>Task: ${safeTaskTitle}<br>
Due: ${safeDueDate}</p>${CTA_HTML}`,
    }
  }

  // task_overdue
  return {
    subject: `Overdue: ${task_title}`,
    text: `A task in ${project_name} is overdue${reminder_label ? ` (${reminder_label})` : ""}.

Task: ${task_title}
Due: ${due_date}${CTA_TEXT}`,
    html: `<p>A task in ${safeProjectName} is overdue${reminder_label ? ` (${escapeHtml(reminder_label)})` : ""}.</p>
<p>Task: ${safeTaskTitle}<br>
Due: ${safeDueDate}</p>${CTA_HTML}`,
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { event_type, recipient_user_id, recipient_email, task_id, task_title, project_id } = body

    if (!VALID_EVENT_TYPES.includes(event_type)) {
      return new Response(JSON.stringify({ error: `Invalid event_type: ${event_type}` }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }
    if (!recipient_user_id || !recipient_email || !task_id || !task_title || !project_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !serviceRoleKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not available")

    // Preference check: a missing row (e.g. a user who signed up before the
    // backfill/trigger existed, or a race with it) defaults to enabled - see
    // notification_preferences_schema.sql's "default all events to enabled" intent.
    const prefResp = await fetch(
      `${supabaseUrl}/rest/v1/notification_preferences?user_id=eq.${recipient_user_id}&event_type=eq.${event_type}&channel=eq.email&select=enabled`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    )
    if (!prefResp.ok) {
      const errText = await prefResp.text()
      throw new Error(`notification_preferences lookup failed (${prefResp.status}): ${errText}`)
    }
    const prefRows = await prefResp.json()
    const enabled = prefRows.length === 0 ? true : prefRows[0].enabled

    if (!enabled) {
      return new Response(JSON.stringify({ ok: true, skipped: "preference_disabled" }), {
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const apiKey = Deno.env.get("RESEND_API_KEY")
    if (!apiKey) throw new Error("RESEND_API_KEY secret is not set")

    const { subject, text, html } = buildEmail(body)

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
        html,
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
