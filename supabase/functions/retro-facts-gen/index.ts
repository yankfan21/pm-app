// Deploy this via the Supabase Dashboard: Edge Functions -> Deploy a new function -> name it "retro-facts-gen"
// Set the ANTHROPIC_API_KEY secret under Edge Functions -> retro-facts-gen -> Secrets before invoking.
//
// NOT free-form generation like task-gen/backlog-gen - this surfaces
// observable facts about a sprint's actual data (velocity, items stuck in
// progress, epics left incomplete) and asks Claude only to phrase them as
// candidate retro bullets, split into "went well" / "didn't go well". No
// action items are ever produced here - those require judgment the data
// alone can't provide, and stay manual. No discovery Q&A phase either
// (unlike task-gen/backlog-gen) - there's nothing to ask the PM, since
// every candidate is a direct restatement of a computed fact, not a
// creative proposal. Every candidate is reviewed, edited, and explicitly
// accepted by the PM client-side before anything is written to
// sprint_retros - this function only ever returns candidates, it never
// writes to the database itself. Mirrors task-gen/backlog-gen's structure
// (same callClaude helper) since each edge function in this project is a
// self-contained deploy unit - no shared module between them.
//
// "Items removed mid-sprint" was considered but is NOT computable here:
// removing an item from a sprint (see SprintBoardView.jsx) just nulls
// sprint_id/board_status with no history log, so there's no way to tell
// what used to be in this sprint. Skipped per product decision.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const MODEL = "claude-sonnet-5"

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
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })

  if (!resp.ok) {
    const errText = await resp.text()
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
    return extractJson(text)
  } catch {
    if (attempt < 3) return callClaude(system, user, attempt + 1)
    const blockTypes = (data.content || []).map((b) => b.type).join(", ")
    throw new Error(
      `Could not parse Claude's response as JSON after ${attempt} attempts. ` +
        `stop_reason=${data.stop_reason}, content block types=[${blockTypes}], text="${text.slice(0, 200)}"`
    )
  }
}

function projectContext(project) {
  return `Project name: ${project.name}
Goal: ${project.goal}
Methodology: ${project.methodology}`
}

function sprintContext(sprint) {
  const range = sprint.start_date && sprint.end_date ? `${sprint.start_date} to ${sprint.end_date}` : "no dates set"
  return `Sprint: ${sprint.name} (${range})${sprint.goal ? `\nSprint goal: ${sprint.goal}` : ""}`
}

// Every fact here is directly computed from sprintTasks - nothing inferred,
// nothing interpreted. This is the entire factual basis Claude is allowed
// to phrase into candidates; the prompt tells it not to go beyond this.
function computeFacts(sprintTasks, isHybrid) {
  const committed = sprintTasks.reduce((sum, t) => sum + (t.story_points || 0), 0)
  const completed = sprintTasks
    .filter((t) => t.board_status === "done")
    .reduce((sum, t) => sum + (t.story_points || 0), 0)

  const stuckInProgress = sprintTasks.filter((t) => t.board_status === "in_progress")

  const incompleteSharedEpics = []
  if (isHybrid) {
    const byEpic = new Map()
    for (const t of sprintTasks) {
      if (!t.epic_name) continue
      if (!byEpic.has(t.epic_name)) byEpic.set(t.epic_name, [])
      byEpic.get(t.epic_name).push(t)
    }
    for (const [epic, items] of byEpic) {
      const incompleteCount = items.filter((t) => t.board_status !== "done").length
      if (items.length > 1 && incompleteCount > 0) {
        incompleteSharedEpics.push({ epic, total: items.length, incomplete: incompleteCount })
      }
    }
  }

  return { committed, completed, stuckInProgress, incompleteSharedEpics }
}

function factsText(facts) {
  const lines = []
  lines.push(`Points committed: ${facts.committed}`)
  lines.push(`Points completed: ${facts.completed}`)
  if (facts.committed > 0) {
    lines.push(
      facts.completed >= facts.committed
        ? "All committed points were completed."
        : `${facts.committed - facts.completed} committed point(s) were not completed.`
    )
  }
  lines.push(
    facts.stuckInProgress.length > 0
      ? `Item(s) that reached "In Progress" but never reached "Done": ${facts.stuckInProgress.map((t) => `"${t.title}"`).join(", ")}`
      : 'No items were left stuck in "In Progress".'
  )
  if (facts.incompleteSharedEpics.length > 0) {
    lines.push(
      "Epic(s) with more than one item in this sprint where not all items completed: " +
        facts.incompleteSharedEpics
          .map((e) => `"${e.epic}" (${e.incomplete} of ${e.total} incomplete)`)
          .join("; ")
    )
  }
  return lines.join("\n")
}

function existingListText(label, items) {
  if (!items || items.length === 0) return null
  return `${label}:\n${items.map((t) => `- ${t}`).join("\n")}`
}

const CANDIDATE_SHAPE_HINT =
  '{"candidates": [{"temp_id": "c1", "text": "All 21 committed points were completed this sprint.", "category": "went_well"}, {"temp_id": "c2", "text": "\\"Build inventory tracking module\\" reached In Progress but never reached Done.", "category": "didnt_go_well"}]}'

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { project, sprint, sprintTasks, existingWentWell, existingDidntGoWell } = await req.json()
    const isHybrid = project?.methodology === "hybrid"

    const facts = computeFacts(sprintTasks || [], isHybrid)
    const existingText = [
      existingListText("Already logged under \"went well\" (do not duplicate)", existingWentWell),
      existingListText("Already logged under \"didn't go well\" (do not duplicate)", existingDidntGoWell),
    ]
      .filter(Boolean)
      .join("\n\n")

    const system =
      "You are a project management assistant that phrases OBSERVABLE FACTS about a sprint into short retro bullet points - you do not interpret, speculate about causes, suggest process changes, recommend fixes, or add any opinion or judgment beyond the literal facts given to you. Every candidate you produce must be a direct, factual restatement of one of the facts provided, nothing else. You never propose action items - those require judgment the data alone can't provide and are out of scope for you. Respond with ONLY a JSON object, no markdown fences, no other text."

    const user = `${projectContext(project)}

${sprintContext(sprint)}

Observable facts from this sprint's data (this is the ONLY factual basis you may use - do not add anything beyond it):
${factsText(facts)}

${existingText ? `${existingText}\n` : ""}
For each fact above that is genuinely notable, produce one candidate retro bullet. Categorize each as "went_well" (positive/neutral fact, e.g. full completion, nothing stuck) or "didnt_go_well" (negative fact, e.g. points missed, an item stuck, an epic left incomplete). Do not invent facts beyond what's listed above, do not propose action items, and do not duplicate anything already logged above. If nothing above is genuinely notable, return an empty candidates array rather than manufacturing filler.

Return ONLY this JSON shape:
${CANDIDATE_SHAPE_HINT}`

    const result = await callClaude(system, user)
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    })
  }
})
