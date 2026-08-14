// Vercel Cron endpoint that keeps the Supabase project from going idle.
// Supabase pauses free-tier projects after a stretch with no database
// activity, so this runs one trivial read-only query per day purely to
// register activity - it is not a health check and nothing consumes its
// result beyond the JSON below.
//
// Scheduled via vercel.json "crons" - once daily, 0 7 * * * (07:00 UTC),
// deliberately offset from the 13:00 UTC drain-task-reminders cron so the two
// never run in the same window.
//
// Gated on CRON_SECRET the same way drain-task-reminders is: Vercel signs cron
// requests with an Authorization: Bearer header matching CRON_SECRET when that
// env var is set. The query itself is harmless (read-only, no rows returned),
// but there is no reason to leave a service-role-backed path open to the
// public internet. See https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// Required Vercel env vars (set in dashboard, not in this file):
//   CRON_SECRET                - shared secret, must match what Vercel sends
//   SUPABASE_URL               - same project URL as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  - service-role key (bypasses RLS; contact_submissions
//                                 has RLS on with no SELECT policy per
//                                 create_contact_submissions.sql, so anon/authenticated
//                                 keys cannot read it at all)

// contact_submissions is the smallest, most inert table in the schema: rows
// only arrive from the Contact Support form, the app never reads it (reviewed
// via the Supabase table editor instead), and it is not on any hot path.
const KEEP_ALIVE_TABLE = 'contact_submissions'

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' })
  }

  // HEAD + Prefer: count=planned is the REST equivalent of supabase-js
  // .select('*', { count: 'planned', head: true }) - no rows in the response
  // body, and the count comes from the query planner rather than a scan, so
  // this stays O(1) no matter how large the table gets.
  let resp
  try {
    resp = await fetch(`${supabaseUrl}/rest/v1/${KEEP_ALIVE_TABLE}?select=id`, {
      method: 'HEAD',
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        prefer: 'count=planned',
      },
    })
  } catch (err) {
    console.error(`keep-alive: network error - ${err.message || err}`)
    return res.status(500).json({ ok: false, error: `network error: ${err.message || err}` })
  }

  if (!resp.ok) {
    console.error(`keep-alive: ${KEEP_ALIVE_TABLE} query failed (${resp.status})`)
    return res.status(500).json({ ok: false, error: `${KEEP_ALIVE_TABLE} query failed (${resp.status})` })
  }

  return res.status(200).json({ ok: true, timestamp: new Date().toISOString() })
}
