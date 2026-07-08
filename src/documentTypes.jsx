import CharterFlow from './CharterFlow'
import CharterView from './CharterView'
import RequirementsFlow from './RequirementsFlow'
import RequirementsView from './RequirementsView'
import RiskLogFlow from './RiskLogFlow'
import RiskLogView from './RiskLogView'
import CommsFlow from './CommsFlow'
import CommsView from './CommsView'
import BudgetFlow from './BudgetFlow'
import BudgetView from './BudgetView'
import StatusUpdateFlow from './StatusUpdateFlow'
import StatusUpdateHistory from './StatusUpdateHistory'
import PostMortemFlow from './PostMortemFlow'
import PostMortemView from './PostMortemView'

// Single source of truth for every AI-generated project document type.
// The Documents checklist, generate flow, and view on the project detail
// page are all driven from this list - add a new entry (plus its own
// Flow/View components) to add a document type, nothing else needs to
// hardcode the list of doc types.
//
// - table: the Supabase table (one row per project, project_id column)
// - docProp: the prop name the View/Flow components use for "this document"
// - context(docs, tasks): extra props (other already-generated docs, plus
//   the project's live task list) the Flow/View components need for
//   cross-document context
// - buildInsert(result): maps what the Flow's onGenerated callback receives
//   into the column(s) to insert
// - group (optional): key into DOCUMENT_GROUPS below - entries sharing a
//   group are nested under one collapsible group row instead of rendering
//   as flat top-level checklist rows
// - repeatable (optional): true for doc types with many rows per project
//   (e.g. a dated log) rather than the default one-row-per-project/upsert
//   shape - ProjectDetail.jsx loads/appends these as an array instead of
//   loading/replacing a single row
// - available(project) (optional): gates whether the PM can *start* this
//   doc type yet - ProjectDetail.jsx renders a locked, non-interactive row
//   instead when this returns false. Only applies before anything has been
//   generated; a doc that already exists always renders normally regardless
//   of what available() returns later (e.g. if the project gets unarchived)
export const DOCUMENT_TYPES = [
  {
    key: 'charter',
    label: 'Charter',
    table: 'charters',
    docProp: 'charter',
    FlowComponent: CharterFlow,
    ViewComponent: CharterView,
    context: () => ({}),
    buildInsert: (result) => result,
  },
  {
    key: 'requirements_brief',
    label: 'Requirements Brief',
    table: 'requirements_briefs',
    docProp: 'brief',
    FlowComponent: RequirementsFlow,
    ViewComponent: RequirementsView,
    context: (docs) => ({ charter: docs.charter }),
    buildInsert: (result) => result,
  },
  {
    key: 'risk_log',
    label: 'Risk Log',
    table: 'risk_logs',
    docProp: 'riskLog',
    FlowComponent: RiskLogFlow,
    ViewComponent: RiskLogView,
    context: (docs) => ({ charter: docs.charter, brief: docs.requirements_brief }),
    buildInsert: (result) => ({ risks: result }),
  },
  {
    key: 'exec_comms_plan',
    label: 'Exec Comms Plan',
    table: 'exec_comms_plans',
    docProp: 'doc',
    group: 'communications',
    FlowComponent: (props) => <CommsFlow variant="exec" {...props} />,
    ViewComponent: (props) => <CommsView variant="exec" {...props} />,
    context: (docs) => ({
      charter: docs.charter,
      brief: docs.requirements_brief,
      riskLog: docs.risk_log,
      statusUpdates: docs.status_update || [],
    }),
    buildInsert: (result) => result,
  },
  {
    key: 'team_newsletter',
    label: 'Team Newsletter',
    table: 'team_newsletters',
    docProp: 'doc',
    group: 'communications',
    FlowComponent: (props) => <CommsFlow variant="newsletter" {...props} />,
    ViewComponent: (props) => <CommsView variant="newsletter" {...props} />,
    context: (docs) => ({
      charter: docs.charter,
      brief: docs.requirements_brief,
      riskLog: docs.risk_log,
      statusUpdates: docs.status_update || [],
    }),
    buildInsert: (result) => result,
  },
  {
    key: 'status_update',
    label: 'Status Update',
    table: 'status_updates',
    docProp: 'entries',
    group: 'communications',
    // Many rows per project, no upsert/replace semantics - the checklist
    // and ProjectDetail.jsx branch on this flag to load/append an array
    // instead of loading/replacing a single row.
    repeatable: true,
    FlowComponent: StatusUpdateFlow,
    ViewComponent: StatusUpdateHistory,
    context: () => ({}),
    buildInsert: (result) => result,
  },
  {
    key: 'budget_tracker',
    label: 'Budget Tracker',
    table: 'budget_trackers',
    docProp: 'budget',
    FlowComponent: BudgetFlow,
    ViewComponent: BudgetView,
    context: (docs, tasks) => ({
      charter: docs.charter,
      brief: docs.requirements_brief,
      tasks: tasks || [],
    }),
    buildInsert: (result) => ({ line_items: result }),
  },
  {
    key: 'post_mortem',
    label: 'Post-Mortem',
    table: 'post_mortems',
    docProp: 'postMortem',
    // Only worth writing once the project is done - starting one on an
    // active project would mean reflecting on a story that isn't over yet.
    available: (project) => project.status === 'Archived',
    FlowComponent: PostMortemFlow,
    ViewComponent: PostMortemView,
    context: (docs) => ({
      charter: docs.charter,
      riskLog: docs.risk_log,
      statusUpdates: docs.status_update || [],
      budget: docs.budget_tracker,
    }),
    buildInsert: (result) => result,
  },
]

// Labels for the groups referenced by DOCUMENT_TYPES entries' `group` field.
// A doc type with no `group` renders as a flat top-level checklist row.
export const DOCUMENT_GROUPS = {
  communications: { label: 'Communications' },
}

// Reduces the flat DOCUMENT_TYPES list into the ordered rows the checklist
// renders: ungrouped entries pass through as-is, and consecutive entries
// sharing a `group` are collected under one group row (in DOCUMENT_TYPES'
// order, so where a group's items are declared controls where the group
// header appears). Keeps DOCUMENT_TYPES itself flat - a single source of
// truth - while ProjectDetail.jsx does one grouping pass before rendering.
export function groupDocumentTypes(types) {
  const rows = []
  const groupRowByKey = {}

  types.forEach((docType) => {
    if (!docType.group) {
      rows.push({ type: 'doc', docType })
      return
    }

    let groupRow = groupRowByKey[docType.group]
    if (!groupRow) {
      groupRow = {
        type: 'group',
        key: docType.group,
        label: DOCUMENT_GROUPS[docType.group]?.label || docType.group,
        items: [],
      }
      groupRowByKey[docType.group] = groupRow
      rows.push(groupRow)
    }
    groupRow.items.push(docType)
  })

  return rows
}
