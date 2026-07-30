// Vercel Cron endpoint replacing the broken pg_net drainer
// (drain_task_reminder_queue(), disabled - see fix_pg_net_deprecated_wrapper.sql
// history). Scanner (send_task_due_reminders(), Postgres, daily) is unchanged and
// still populates task_reminder_queue - this endpoint only drains it.
//
// Scheduled via vercel.json "crons" - every 30 min. Vercel signs cron requests
// with an Authorization: Bearer header matching CRON_SECRET when that env var is
// set; checked below. See https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
//
// Required Vercel env vars (set in dashboard, not in this file):
//   CRON_SECRET               - shared secret, must match what Vercel sends
//   SUPABASE_URL               - same project URL as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  - service-role key (bypasses RLS to read/update
//                                 task_reminder_queue; anon key can't - RLS is on
//                                 with zero policies per split_task_reminder_scanner_and_drainer.sql)

const EDGE_FUNCTION_URL = 'https://ihualqkokgchmzoeumxo.supabase.co/functions/v1/send-task-notification'
const BATCH_SIZE = 25

export default async function handler(req, res) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' })
  }

  const restHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  }

  const pendingResp = await fetch(
    `${supabaseUrl}/rest/v1/task_reminder_queue?status=eq.pending&order=created_at.asc&limit=${BATCH_SIZE}`,
    { headers: restHeaders },
  )
  if (!pendingResp.ok) {
    const errText = await pendingResp.text()
    return res.status(500).json({ error: `task_reminder_queue lookup failed (${pendingResp.status}): ${errText}` })
  }
  const rows = await pendingResp.json()

  let sent = 0
  let failed = 0

  for (const row of rows) {
    let statusCode = null
    try {
      const sendResp = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event_type: row.event_type,
          recipient_user_id: row.recipient_user_id,
          recipient_email: row.recipient_email,
          task_id: row.task_id,
          task_title: row.task_title,
          project_id: row.project_id,
          project_name: row.project_name,
          due_date: row.due_date,
          reminder_label: row.reminder_label,
        }),
      })
      statusCode = sendResp.status
    } catch (err) {
      console.error(`drain-task-reminders: row ${row.id} network error - ${err.message || err}`)
    }

    const ok = statusCode !== null && statusCode >= 200 && statusCode < 300
    const update = ok
      ? { status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 }
      : { status: 'failed', attempts: row.attempts + 1 }

    const updateResp = await fetch(
      `${supabaseUrl}/rest/v1/task_reminder_queue?id=eq.${row.id}`,
      {
        method: 'PATCH',
        headers: restHeaders,
        body: JSON.stringify(update),
      },
    )

    if (!updateResp.ok) {
      console.error(`drain-task-reminders: row ${row.id} status-update failed (${updateResp.status})`)
    }

    if (ok) {
      sent++
    } else {
      failed++
      console.error(`drain-task-reminders: row ${row.id} send failed - http status=${statusCode}`)
    }
  }

  return res.status(200).json({ ok: true, total: rows.length, sent, failed })
}
