// Sample data for the dev-only fake Supabase client (devSupabase.js).
// Every date is relative to today so the Gantt "Today" marker and Overdue
// logic look realistic whenever the preview is opened. Made-up content only.
const DAY = 86400000
const iso = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10)
const ts = (offset) => new Date(Date.now() + offset * DAY).toISOString()

export function makeFixtures() {
  const OWNER = 'dev-bypass-user'
  const projects = [
    { id: 'p-wms', name: 'Warehouse Management System Rollout', goal: 'Replace the legacy WMS across all four distribution centres.', priority: 'High', deadline: iso(75), methodology: 'waterfall', status: 'Active', is_demo: false, owner_id: OWNER, owner_email: 'dev@localhost', created_at: ts(-90) },
    { id: 'p-app', name: 'Mobile App Relaunch', goal: 'Ship the rebuilt customer app on iOS and Android.', priority: 'Medium', deadline: iso(140), methodology: 'hybrid', status: 'Active', is_demo: false, owner_id: OWNER, owner_email: 'dev@localhost', created_at: ts(-60) },
    { id: 'p-portal', name: 'Customer Portal Redesign', goal: 'Cut support tickets by moving self-service into the portal.', priority: 'Medium', deadline: iso(45), methodology: 'agile', status: 'Active', is_demo: true, owner_id: OWNER, owner_email: 'dev@localhost', created_at: ts(-40) },
    { id: 'p-old', name: 'Helpdesk Migration', goal: 'Move to the new ticketing tool.', priority: 'Low', deadline: iso(-20), methodology: 'waterfall', status: 'Archived', is_demo: false, owner_id: OWNER, owner_email: 'dev@localhost', created_at: ts(-200) },
  ]

  const phaseNames = ['Initiation', 'Planning', 'Execution', 'Closure']
  const phases = []
  ;[['p-wms', -80], ['p-app', -50]].forEach(([pid, start]) => {
    const spans = [[0, 14], [14, 40], [40, 130], [130, 150]]
    phaseNames.forEach((name, i) => {
      const s = iso(start + spans[i][0]), e = iso(start + spans[i][1])
      phases.push({ id: `${pid}-ph${i + 1}`, project_id: pid, phase_number: i + 1, phase_name: name, auto_start_date: s, auto_end_date: e, custom_start_date: null, custom_end_date: null, is_custom_mode: false, effective_start_date: s, effective_end_date: e, created_at: ts(-80) })
    })
  })

  const milestones = [
    { id: 'm1', project_id: 'p-wms', name: 'Vendor contract signed', start_date: iso(-70), end_date: iso(-70), description: 'Signed by procurement.', created_at: ts(-80) },
    { id: 'm2', project_id: 'p-wms', name: 'UAT complete', start_date: iso(35), end_date: iso(35), description: 'All four centres sign off.', created_at: ts(-80) },
    { id: 'm3', project_id: 'p-wms', name: 'Go live', start_date: iso(75), end_date: iso(75), description: 'Cutover weekend.', created_at: ts(-80) },
    { id: 'm4', project_id: 'p-app', name: 'Beta in TestFlight', start_date: iso(30), end_date: iso(30), description: '', created_at: ts(-50) },
  ]

  const T = (id, project_id, title, o) => ({
    id, project_id, title, description: o.description || '', status: o.status || 'not_started', completed: o.status === 'completed',
    start_date: iso(o.s), due_date: iso(o.e), phase_id: o.ph ? `${project_id}-ph${o.ph}` : null, milestone_id: o.m || null,
    assignee_name: o.who || null, assignee_user_id: null, task_type: o.type || 'task', story_points: o.pts ?? null,
    backlog_rank: o.rank ?? null, backlog_status: o.bs || null, sprint_id: o.sp || null, board_status: o.bd || null, epic_name: o.epic || null,
    depends_on: null, priority: o.pr || 'Medium', created_at: ts(-80 + (o.s || 0) / 10),
  })
  const tasks = [
    T('t1', 'p-wms', 'Confirm requirements with each centre', { s: -78, e: -62, ph: 1, status: 'completed', who: 'A. Patel' }),
    T('t2', 'p-wms', 'Select WMS vendor', { s: -70, e: -55, ph: 1, status: 'completed', who: 'J. Moreau', m: 'm1' }),
    T('t3', 'p-wms', 'Design data migration plan', { s: -50, e: -25, ph: 2, status: 'completed', who: 'A. Patel' }),
    T('t4', 'p-wms', 'Configure scanner hardware', { s: -30, e: 5, ph: 3, status: 'in_progress', who: 'R. Chen' }),
    T('t5', 'p-wms', 'Migrate item master data', { s: -20, e: 12, ph: 3, status: 'in_progress', who: 'A. Patel' }),
    T('t6', 'p-wms', 'Integrate with ERP', { s: -10, e: -2, ph: 3, status: 'delayed', who: 'J. Moreau', pr: 'High' }),
    T('t7', 'p-wms', 'Train floor staff (wave 1)', { s: 10, e: 30, ph: 3, who: 'S. Okafor' }),
    T('t8', 'p-wms', 'User acceptance testing', { s: 20, e: 35, ph: 3, who: 'R. Chen', m: 'm2' }),
    T('t9', 'p-wms', 'Cutover rehearsal', { s: 40, e: 55, ph: 3, who: 'A. Patel' }),
    T('t10', 'p-wms', 'Go-live cutover', { s: 70, e: 75, ph: 3, who: 'A. Patel', m: 'm3', pr: 'High' }),
    T('t11', 'p-wms', 'Hypercare support', { s: 75, e: 105, ph: 4, who: 'S. Okafor' }),
    T('t12', 'p-wms', 'Post-implementation review', { s: 105, e: 120, ph: 4 }),
    T('a1', 'p-app', 'Design system audit', { s: -45, e: -20, ph: 1, status: 'completed', who: 'L. Brandt' }),
    T('a2', 'p-app', 'Build onboarding flow', { s: -15, e: 14, ph: 3, status: 'in_progress', who: 'M. Silva', sp: 'sp-app1', bd: 'in_progress', pts: 8, bs: 'in_sprint', rank: 1 }),
    T('a3', 'p-app', 'Push notification service', { s: 0, e: 20, ph: 3, who: 'K. Osei', sp: 'sp-app1', bd: 'todo', pts: 5, bs: 'in_sprint', rank: 2 }),
    T('a4', 'p-app', 'Offline mode', { s: 20, e: 50, ph: 3, pts: 13, bs: 'backlog', rank: 3 }),
    T('c1', 'p-portal', 'Ticket history page', { s: -14, e: 3, status: 'in_progress', who: 'D. Rossi', sp: 'sp-por1', bd: 'in_progress', pts: 5, bs: 'in_sprint', rank: 1, epic: 'Self-service' }),
    T('c2', 'p-portal', 'Password reset flow', { s: -14, e: 0, status: 'completed', who: 'D. Rossi', sp: 'sp-por1', bd: 'done', pts: 3, bs: 'in_sprint', rank: 2, epic: 'Self-service' }),
    T('c3', 'p-portal', 'Knowledge base search', { s: 3, e: 17, sp: 'sp-por2', bd: 'todo', pts: 8, bs: 'in_sprint', rank: 3, epic: 'Self-service' }),
    T('c4', 'p-portal', 'Invoice downloads', { s: 17, e: 31, pts: 5, bs: 'backlog', rank: 4, epic: 'Billing' }),
  ]

  const task_dependencies = [
    { task_id: 't5', depends_on_id: 't3', created_at: ts(-50) },
    { task_id: 't6', depends_on_id: 't5', created_at: ts(-50) },
    { task_id: 't8', depends_on_id: 't6', created_at: ts(-50) },
    { task_id: 't9', depends_on_id: 't8', created_at: ts(-50) },
    { task_id: 't10', depends_on_id: 't9', created_at: ts(-50) },
  ]

  const sprints = [
    { id: 'sp-por1', project_id: 'p-portal', name: 'Sprint 1', start_date: iso(-14), end_date: iso(0), goal: 'Core self-service', created_at: ts(-15) },
    { id: 'sp-por2', project_id: 'p-portal', name: 'Sprint 2', start_date: iso(1), end_date: iso(14), goal: 'Search and billing', created_at: ts(-15) },
    { id: 'sp-app1', project_id: 'p-app', name: 'Sprint 1', start_date: iso(-7), end_date: iso(7), goal: 'Onboarding', created_at: ts(-10) },
  ]
  const sprint_retros = [{ id: 'r1', sprint_id: 'sp-por1', went_well: ['Shipped password reset early'], didnt_go_well: ['Ticket history estimate was off'], action_items: ['Split large stories'], is_locked: false, created_at: ts(-1), updated_at: ts(-1) }]

  const project_collaborators = [
    { id: 'pc1', project_id: 'p-wms', user_id: OWNER, email: 'dev@localhost', role: 'owner', hidden: false, created_at: ts(-90) },
    { id: 'pc2', project_id: 'p-wms', user_id: 'u2', email: 'a.patel@example.com', role: 'editor', hidden: false, created_at: ts(-80) },
    { id: 'pc3', project_id: 'p-app', user_id: OWNER, email: 'dev@localhost', role: 'owner', hidden: false, created_at: ts(-60) },
    { id: 'pc4', project_id: 'p-portal', user_id: OWNER, email: 'dev@localhost', role: 'owner', hidden: false, created_at: ts(-40) },
  ]

  const project_evaluations = [
    { id: 'e1', project_id: 'p-wms', health_status: 'at_risk', rationale: 'ERP integration is overdue and sits on the critical path to UAT.', recommendations: ['Add a second integration engineer', 'Re-baseline UAT dates'], metrics: { overdue_tasks: 1, completed_pct: 25 }, created_at: ts(-2) },
    { id: 'e2', project_id: 'p-app', health_status: 'on_track', rationale: 'Sprint 1 is on pace.', recommendations: [], metrics: { completed_pct: 12 }, created_at: ts(-3) },
  ]

  const charters = [{ id: 'ch1', project_id: 'p-wms', purpose: 'Replace the legacy WMS to cut pick errors and enable same-day shipping.', scope: 'Software migration, scanner hardware, staff training, cutover support.', stakeholders: 'Dana Whitfield (VP Operations, sponsor); centre managers; IT.', success_metrics: 'Pick accuracy above 99.5% within 60 days of go-live.', risks: 'Vendor integration slips; staff training capacity.', timeline: `Go live ${iso(75)}.`, created_at: ts(-85) }]
  const risk_logs = [{ id: 'rl1', project_id: 'p-wms', qa_answers: [], created_at: ts(-70) }]
  const risks = [
    { id: 'rk1', risk_log_id: 'rl1', project_id: 'p-wms', title: 'Vendor integration slips past UAT window', description: 'ERP connector is behind.', likelihood: 4, severity: 3, mitigation: 'Weekly integration checkpoint from sprint 4', owner: 'A. Patel', task_id: 't6', created_at: ts(-60), updated_at: ts(-5) },
    { id: 'rk2', risk_log_id: 'rl1', project_id: 'p-wms', title: 'Warehouse staff training capacity', description: '', likelihood: 3, severity: 2, mitigation: 'Backfill shifts during cutover week', owner: 'J. Moreau', task_id: null, created_at: ts(-60), updated_at: ts(-5) },
  ]
  const stakeholders = [
    { id: 's1', name: 'Dana Whitfield', role_title: 'VP Operations', org: 'Acme Logistics' },
    { id: 's2', name: 'Priya Nair', role_title: 'Centre Manager', org: 'Acme Logistics' },
  ]

  return {
    projects, phases, milestones, tasks, task_dependencies, sprints, sprint_retros, project_collaborators,
    project_evaluations, charters, risk_logs, risks, stakeholders,
    scopings: [], requirements_briefs: [], issue_logs: [], exec_comms_plans: [], team_newsletters: [], budget_trackers: [],
    status_updates: [], document_versions: [], post_mortems: [], communication_plans: [], comm_plan_items: [], comm_plan_audience: [],
    stakeholder_registries: [], task_comments: [], risk_notes: [], risk_tasks: [],
  }
}
