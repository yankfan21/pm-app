// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "send-contact-notification"
// Set the RESEND_API_KEY secret under Edge Functions -> send-contact-notification -> Secrets before invoking
// (shared with any other function that sends email - same secret name everywhere).
// Remember to manually disable JWT verification for this function in Supabase Settings, same as every other
// Edge Function in this project.
//
// This function only sends the admin notification email - it does not touch the database. The
// contact_submissions row is inserted directly from the frontend via the shared Supabase client
// (see create_contact_submissions.sql for the RLS policy that allows that), before this function is called.
// No Claude call here (unlike project-eval, task-gen, etc.) - just a Resend API POST.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const ADMIN_EMAIL = "admin@confidantpm.com"

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { name, email, contactReason, message, submittedByEmail } = await req.json()

    if (!name || !email || !contactReason || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      })
    }

    const apiKey = Deno.env.get("RESEND_API_KEY")
    if (!apiKey) throw new Error("RESEND_API_KEY secret is not set")

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "ConfidantPM <noreply@confidantpm.com>",
        to: [ADMIN_EMAIL],
        reply_to: email,
        subject: `Contact Support: ${contactReason} - ${name}`,
        text: `Name: ${name}
Email: ${email}
Contact Reason: ${contactReason}
Submitted by (logged-in account): ${submittedByEmail ?? "(unknown)"}

Message:
${message}`,
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
