// Local-only stand-in for the Supabase client, used when DEV_BYPASS_AUTH is on
// (see supabaseClient.js). Reads come from devFixtures.js; writes change an
// in-memory copy only and vanish on reload. Supports just the query shapes the
// app uses: select, eq/neq/in/is/not/match/filter, order, limit, single,
// maybeSingle, insert/update/delete/upsert, rpc, functions.invoke.
import { makeFixtures } from './devFixtures'

const DEV_CHARTER_QUESTIONS = [
  { id: 'q1', text: 'What problem is this project solving, and for whom?', type: 'text', suggested_answer: 'Cut support tickets by moving self-service into the customer portal.' },
  { id: 'q2', text: 'How would you describe the scale of this project?', type: 'choice', choices: ['Small', 'Medium', 'Large', 'Enterprise'] },
  { id: 'q3', text: 'Who is the executive sponsor?', type: 'text' },
  { id: 'q4', text: 'What does success look like in the first 90 days after launch?', type: 'text', suggested_answer: 'Ticket volume down 20% and portal adoption above 60%.' },
  { id: 'q5', text: 'How firm is the target go-live date?', type: 'choice', choices: ['Fixed', 'Flexible', 'Not set'] },
]

let _db
// Lazy so nothing is built unless the fake client is actually used.
const getDb = () => (_db ??= withDevOrg(makeFixtures()))

// VITE_DEV_ORG=true previews white-label branding with a sample organization.
function withDevOrg(db) {
  if (import.meta.env.VITE_DEV_ORG !== 'true') return db
  db.organizations = [{ id: 'org-dev', app_name: 'Northwind Projects', logo_path: null, accent_color: '#b45309', rail_color: '#1f2a44' }]
  db.organization_members = [{ organization_id: 'org-dev', user_id: 'dev-bypass-user', created_at: new Date().toISOString() }]
  return db
}
let nextId = 1000
const uid = () => `dev-${nextId++}`

function matchesFilters(row, filters) {
  return filters.every(({ op, col, val }) => {
    const v = row[col]
    if (op === 'eq') return v === val
    if (op === 'neq') return v !== val
    if (op === 'in') return val.includes(v)
    if (op === 'is') return val === null ? v == null : v === val
    if (op === 'not') return !(val.op === 'is' ? (val.val === null ? v == null : v === val.val) : v === val.val)
    return true
  })
}

function embed(table, rows, selectStr) {
  // Handles "col, other(a, b)" embeds by FK convention: other.id = row.<other-singular>_id
  const m = selectStr && selectStr.match(/(\w+)\(([^)]*)\)/)
  if (!m) return rows
  const [, rel] = m
  const fk = rel === 'stakeholders' ? 'stakeholder_id' : `${rel.replace(/s$/, '')}_id`
  return rows.map((r) => ({ ...r, [rel]: (getDb()[rel] || []).find((x) => x.id === r[fk]) || null }))
}

function builder(table) {
  const state = { filters: [], order: null, limit: null, mode: 'select', payload: null, selectStr: '*', single: null }

  const run = () => {
    const db = getDb()
    const rows = db[table] || (db[table] = [])
    if (state.mode === 'insert') {
      const items = (Array.isArray(state.payload) ? state.payload : [state.payload]).map((p) => ({
        id: uid(), created_at: new Date().toISOString(), ...p,
      }))
      rows.push(...items)
      return { data: Array.isArray(state.payload) ? items : items[0], error: null }
    }
    if (state.mode === 'update' || state.mode === 'delete') {
      const hit = rows.filter((r) => matchesFilters(r, state.filters))
      if (state.mode === 'update') hit.forEach((r) => Object.assign(r, state.payload))
      else db[table] = rows.filter((r) => !hit.includes(r))
      return { data: hit, error: null }
    }
    let out = rows.filter((r) => matchesFilters(r, state.filters)).map((r) => ({ ...r }))
    if (state.order) {
      const { col, asc } = state.order
      out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1))
    }
    if (state.limit != null) out = out.slice(0, state.limit)
    out = embed(table, out, state.selectStr)
    if (state.single === 'single') return out.length ? { data: out[0], error: null } : { data: null, error: { message: 'No rows (dev fixtures)' } }
    if (state.single === 'maybe') return { data: out[0] ?? null, error: null }
    return { data: out, error: null }
  }

  const b = {
    select(s = '*') { state.selectStr = s; return b },
    insert(p) { state.mode = 'insert'; state.payload = p; return b },
    upsert(p) { state.mode = 'insert'; state.payload = p; return b },
    update(p) { state.mode = 'update'; state.payload = p; return b },
    delete() { state.mode = 'delete'; return b },
    eq: (col, val) => (state.filters.push({ op: 'eq', col, val }), b),
    neq: (col, val) => (state.filters.push({ op: 'neq', col, val }), b),
    in: (col, val) => (state.filters.push({ op: 'in', col, val }), b),
    is: (col, val) => (state.filters.push({ op: 'is', col, val }), b),
    not: (col, op, val) => (state.filters.push({ op: 'not', col, val: { op, val } }), b),
    match(obj) { Object.entries(obj).forEach(([col, val]) => state.filters.push({ op: 'eq', col, val })); return b },
    filter: () => b,
    order(col, { ascending = true } = {}) { state.order = { col, asc: ascending }; return b },
    limit(n) { state.limit = n; return b },
    single() { state.single = 'single'; return b },
    maybeSingle() { state.single = 'maybe'; return b },
    then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject) },
  }
  return b
}

const user = { id: 'dev-bypass-user', email: 'dev@localhost', user_metadata: { full_name: 'Dev Preview' } }

export const devSupabase = {
  from: builder,
  rpc: async () => ({ data: null, error: null }),
  functions: {
    // Dev preview only: canned Charter Q&A so the step-by-step flow can be
    // previewed. Every other function (and every other Charter action) stays
    // disabled, and nothing here calls a real AI service.
    invoke: async (name, opts) => {
      const body = opts?.body || {}
      if (name === 'charter' && body.action === 'questions') {
        return { data: { questions: DEV_CHARTER_QUESTIONS }, error: null }
      }
      return { data: null, error: { message: 'AI functions are disabled in dev preview mode.' } }
    },
  },
  storage: { from: () => ({ upload: async () => ({ data: null, error: { message: 'Storage disabled in dev preview.' } }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'dev-bypass', user } } }),
    getUser: async () => ({ data: { user } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signOut: async () => ({ error: null }),
  },
}
