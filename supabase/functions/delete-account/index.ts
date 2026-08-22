// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "delete-account"
// Remember to manually disable JWT verification for this function in Supabase Settings,
// same as every other Edge Function in this project - the caller's identity is checked
// in code below (via the caller's own JWT against auth.getUser()), not by the platform's
// JWT gate.
//
// Backs the (not-yet-built) Delete Account UI. Two actions in one function, both POST:
//
//   { action: "preview" }
//     Read-only. Returns every project the caller owns, split into
//     "needs_successor" (has other collaborators - caller must pick a new owner before
//     deleting) and "will_be_deleted" (no other collaborators - safe to hard-delete).
//
//   { action: "execute", transfers: [{ project_id, new_owner_id }, ...] }
//     Applies the ownership transfers, deletes every remaining owned project (Storage
//     attachments first, then the row - project_id cascades handle the ~17 related
//     tables), then calls auth.admin.deleteUser() on the caller.
//
// Requires supabase/migrations/loosen_auth_user_fks_for_account_deletion.sql to have
// been run first - without it, deleteUser() below fails on the invited_by/
// contact_submissions/ai_usage_log foreign keys even after every owned project is
// cleared. task_comments.author_id already cascades on its own (no code needed here);
// projects.owner_id is handled entirely by the transfer/delete logic below.
//
// The requesting user's id always comes from their own JWT (authClient.auth.getUser()),
// never from the request body - this function only ever acts on the caller's own
// account, by design.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const BUDGET_ATTACHMENTS_BUCKET = "budget-attachments"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  })
}

// Owned projects split into needs_successor / will_be_deleted, shared by both
// "preview" and the pre-mutation validation step of "execute" so the two can never
// disagree about what the client saw vs. what execute is about to act on.
async function computeOwnedProjectBreakdown(serviceClient: any, userId: string) {
  const { data: owned, error: ownedError } = await serviceClient
    .from("projects")
    .select("id, name")
    .eq("owner_id", userId)

  if (ownedError) throw ownedError

  const ownedProjects = owned ?? []
  if (ownedProjects.length === 0) {
    return { needsSuccessor: [], willBeDeleted: [] }
  }

  const ownedProjectIds = ownedProjects.map((p: any) => p.id)

  const { data: collaboratorRows, error: collabError } = await serviceClient
    .from("project_collaborators")
    .select("project_id, user_id, email, role")
    .in("project_id", ownedProjectIds)

  if (collabError) throw collabError

  // Defensive: the owner should never have their own project_collaborators row, but
  // exclude user_id === userId anyway rather than assume that invariant always holds.
  const collaboratorsByProject = new Map<string, any[]>()
  for (const row of collaboratorRows ?? []) {
    if (row.user_id === userId) continue
    const list = collaboratorsByProject.get(row.project_id) ?? []
    list.push({ id: row.user_id, email: row.email, role: row.role })
    collaboratorsByProject.set(row.project_id, list)
  }

  const needsSuccessor: any[] = []
  const willBeDeleted: any[] = []

  for (const project of ownedProjects) {
    const collaborators = collaboratorsByProject.get(project.id) ?? []
    if (collaborators.length > 0) {
      needsSuccessor.push({ id: project.id, name: project.name, collaborators })
    } else {
      willBeDeleted.push({ id: project.id, name: project.name })
    }
  }

  return { needsSuccessor, willBeDeleted }
}

// Deletes every object under {project_id}/ in the budget-attachments bucket. Row
// deletion (projects -> budget_trackers cascade) does NOT touch Storage - these are
// separate systems, and an orphaned Storage object would otherwise sit there forever
// with nothing left pointing at it.
async function deleteProjectAttachments(serviceClient: any, projectId: string) {
  const { data: files, error: listError } = await serviceClient.storage
    .from(BUDGET_ATTACHMENTS_BUCKET)
    .list(projectId, { limit: 1000 })

  if (listError) throw listError
  if (!files || files.length === 0) return { deleted: 0 }

  const paths = files.map((f: any) => `${projectId}/${f.name}`)
  const { error: removeError } = await serviceClient.storage
    .from(BUDGET_ATTACHMENTS_BUCKET)
    .remove(paths)

  if (removeError) throw removeError
  return { deleted: paths.length }
}

async function handlePreview(serviceClient: any, userId: string) {
  const { needsSuccessor, willBeDeleted } = await computeOwnedProjectBreakdown(serviceClient, userId)
  return jsonResponse({
    needs_successor: needsSuccessor,
    will_be_deleted: willBeDeleted,
  })
}

async function handleExecute(serviceClient: any, userId: string, transfers: any[]) {
  if (!Array.isArray(transfers)) {
    return jsonResponse({ error: "transfers must be an array" }, 400)
  }

  // Recompute from the database, not from whatever the client remembers from its
  // earlier "preview" call - the set of owned/shared projects could have changed since
  // (another owner transfer, a collaborator removed, etc.), and this is the request
  // that's about to delete data.
  const { needsSuccessor } = await computeOwnedProjectBreakdown(serviceClient, userId)

  // ── validate the whole request before mutating anything ────────────────────────

  const transfersByProject = new Map<string, string>()
  for (const t of transfers) {
    if (!t || typeof t.project_id !== "string" || typeof t.new_owner_id !== "string") {
      return jsonResponse({ error: "each transfer needs project_id and new_owner_id" }, 400)
    }
    if (transfersByProject.has(t.project_id)) {
      return jsonResponse({ error: `duplicate transfer for project ${t.project_id}` }, 400)
    }
    transfersByProject.set(t.project_id, t.new_owner_id)
  }

  // Every project that actually needs a successor must have exactly one transfer -
  // otherwise it's left owned by the caller, and step 4 below (deleteUser) would fail
  // on the projects.owner_id FK anyway, just later and less clearly.
  const missing = needsSuccessor.filter((p: any) => !transfersByProject.has(p.id))
  if (missing.length > 0) {
    return jsonResponse({
      error: "missing ownership transfer for project(s) with other collaborators",
      projects: missing.map((p: any) => ({ id: p.id, name: p.name })),
    }, 400)
  }

  const needsSuccessorIds = new Set(needsSuccessor.map((p: any) => p.id))
  const collaboratorsByProjectId = new Map<string, Set<string>>(
    needsSuccessor.map((p: any) => [p.id, new Set(p.collaborators.map((c: any) => c.id))]),
  )

  for (const t of transfers) {
    // A transfer for a project the caller doesn't (or no longer) own - reject outright
    // rather than silently reassigning someone else's project.
    if (!needsSuccessorIds.has(t.project_id)) {
      return jsonResponse({
        error: `project ${t.project_id} is not one of your owned projects with other collaborators`,
      }, 400)
    }
    const collaboratorIds = collaboratorsByProjectId.get(t.project_id)
    if (!collaboratorIds || !collaboratorIds.has(t.new_owner_id)) {
      return jsonResponse({
        error: `new_owner_id ${t.new_owner_id} is not a current collaborator on project ${t.project_id}`,
      }, 400)
    }
  }

  // ── mutate, tracking what actually happened so a mid-way failure is reported
  // precisely rather than surfacing as one opaque error ──────────────────────────

  const result: {
    transfers_applied: string[]
    projects_deleted: string[]
    storage_cleanup: Record<string, number>
    user_deleted: boolean
  } = {
    transfers_applied: [],
    projects_deleted: [],
    storage_cleanup: {},
    user_deleted: false,
  }

  // 1. Apply ownership transfers.
  for (const t of transfers) {
    const { error } = await serviceClient
      .from("projects")
      .update({ owner_id: t.new_owner_id })
      .eq("id", t.project_id)
      .eq("owner_id", userId) // belt-and-suspenders: only ever move a project this user still owns

    if (error) {
      return jsonResponse({
        error: `failed applying ownership transfer for project ${t.project_id}: ${error.message}`,
        partial_result: result,
      }, 500)
    }
    result.transfers_applied.push(t.project_id)
  }

  // 2 & 3. Recompute what's still owned with zero collaborators (post-transfer), clean
  // up its Storage attachments, then delete the project row.
  const { willBeDeleted: toDelete } = await computeOwnedProjectBreakdown(serviceClient, userId)

  for (const project of toDelete) {
    try {
      const { deleted } = await deleteProjectAttachments(serviceClient, project.id)
      result.storage_cleanup[project.id] = deleted
    } catch (err) {
      return jsonResponse({
        error: `failed deleting Storage attachments for project ${project.id}: ${String((err as Error).message || err)}`,
        partial_result: result,
      }, 500)
    }

    const { error: deleteError } = await serviceClient
      .from("projects")
      .delete()
      .eq("id", project.id)
      .eq("owner_id", userId)

    if (deleteError) {
      return jsonResponse({
        error: `failed deleting project ${project.id}: ${deleteError.message}`,
        partial_result: result,
      }, 500)
    }
    result.projects_deleted.push(project.id)
  }

  // 4. Every owned project is now either transferred or deleted - safe to delete the
  // auth.users row. Requires loosen_auth_user_fks_for_account_deletion.sql to have run
  // (invited_by / contact_submissions.user_id / ai_usage_log.user_id all ON DELETE SET
  // NULL); project_collaborators.user_id and notification_preferences.user_id already
  // cascade; task_comments.author_id already cascades.
  const { error: deleteUserError } = await serviceClient.auth.admin.deleteUser(userId)

  if (deleteUserError) {
    // 5. Do not pretend this succeeded - projects are already transferred/deleted at
    // this point and that's NOT rolled back (Storage deletes and cross-project owner
    // changes aren't safely reversible), so report exactly that plus the concrete
    // deleteUser failure, rather than a generic error.
    return jsonResponse({
      error: `account cleanup finished but deleteUser failed: ${deleteUserError.message}`,
      partial_result: result,
    }, 500)
  }

  result.user_deleted = true
  return jsonResponse({ success: true, ...result })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    })
    const { data: { user } } = await authClient.auth.getUser()

    if (!user) {
      return jsonResponse({ error: "unauthorized" }, 401)
    }

    const body = await req.json().catch(() => ({}))
    const serviceClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"))

    if (body.action === "preview") {
      return await handlePreview(serviceClient, user.id)
    }

    if (body.action === "execute") {
      return await handleExecute(serviceClient, user.id, body.transfers ?? [])
    }

    return jsonResponse({ error: "action must be 'preview' or 'execute'" }, 400)
  } catch (err) {
    return jsonResponse({ error: String((err as Error).message || err) }, 500)
  }
})
