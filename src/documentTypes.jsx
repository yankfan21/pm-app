import CharterFlow from './CharterFlow'
import CharterView from './CharterView'
import RequirementsFlow from './RequirementsFlow'
import RequirementsView from './RequirementsView'
import RiskLogFlow from './RiskLogFlow'
import RiskLogView from './RiskLogView'
import CommsFlow from './CommsFlow'
import CommsView from './CommsView'

// Single source of truth for every AI-generated project document type.
// The Documents checklist, generate flow, and view on the project detail
// page are all driven from this list - add a new entry (plus its own
// Flow/View components) to add a document type, nothing else needs to
// hardcode the list of doc types.
//
// - table: the Supabase table (one row per project, project_id column)
// - docProp: the prop name the View/Flow components use for "this document"
// - context(docs): extra props (other already-generated docs) the
//   Flow/View components need for cross-document context
// - buildInsert(result): maps what the Flow's onGenerated callback receives
//   into the column(s) to insert
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
    FlowComponent: (props) => <CommsFlow variant="exec" {...props} />,
    ViewComponent: (props) => <CommsView variant="exec" {...props} />,
    context: (docs) => ({ charter: docs.charter, brief: docs.requirements_brief, riskLog: docs.risk_log }),
    buildInsert: (result) => result,
  },
  {
    key: 'team_newsletter',
    label: 'Team Newsletter',
    table: 'team_newsletters',
    docProp: 'doc',
    FlowComponent: (props) => <CommsFlow variant="newsletter" {...props} />,
    ViewComponent: (props) => <CommsView variant="newsletter" {...props} />,
    context: (docs) => ({ charter: docs.charter, brief: docs.requirements_brief, riskLog: docs.risk_log }),
    buildInsert: (result) => result,
  },
]
