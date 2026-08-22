import ScopingFlow from './ScopingFlow'
import ScopingView from './ScopingView'
import CharterFlow from './CharterFlow'
import CharterView from './CharterView'
import RequirementsFlow from './RequirementsFlow'
import RequirementsView from './RequirementsView'
import RiskLogFlow from './RiskLogFlow'
import RiskLogView from './RiskLogView'
import IssueLogFlow from './IssueLogFlow'
import IssueLogView from './IssueLogView'
import CommsFlow from './CommsFlow'
import CommsView from './CommsView'
import BudgetFlow from './BudgetFlow'
import BudgetView from './BudgetView'
import StatusUpdateFlow from './StatusUpdateFlow'
import StatusUpdateHistory from './StatusUpdateHistory'
import PostMortemFlow from './PostMortemFlow'
import PostMortemView from './PostMortemView'
import ProjectEvalFlow from './ProjectEvalFlow'
import ProjectEvalView from './ProjectEvalView'

// Single source of truth for every AI-generated project document type.
// The Documents checklist, the tracking-group nav sections (Risk Log, Issues
// Log, Communications, Budget Tracker - see ProjectDocSectionRoutes.jsx),
// Overview's Project Evaluation section, and ProjectDetailLayout's docs
// loading are all driven from this list - add a new entry (plus its own
// Flow/View components) to add a document type, nothing else needs to
// hardcode the list of doc types.
//
// This stays the full registry of doc types even though the Documents page
// now shows only three of them. It's what ProjectDetailLayout.jsx's
// loadDocs() iterates to populate `docs` (which every consumer, including
// Overview's risk/issue cards and each tracking route, reads out of), so
// dropping an entry here would stop that doc type loading at all rather than
// just removing it from a page. Which entries the Documents page renders is
// the `documentsPage` flag below / DOCUMENTS_PAGE_TYPES at the bottom.
//
// - table: the Supabase table (one row per project, project_id column)
// - docProp: the prop name the View/Flow components use for "this document"
// - context(docs, tasks, extra): extra props (other already-generated
//   docs, the project's live task list, and - via the third `extra` arg -
//   { sprints, retros, milestones }) the Flow/View components need for
//   cross-document context. Most entries only need docs/tasks and ignore
//   the third arg.
// - buildInsert(result): maps what the Flow's onGenerated callback receives
//   into the column(s) to insert
// - documentsPage (optional): true for the doc types that render as rows on
//   the Documents checklist (DocumentsRoute.jsx). Everything else here is
//   reached through its own nav section or Overview instead
// - repeatable (optional): true for doc types with many rows per project
//   (e.g. a dated log) rather than the default one-row-per-project/upsert
//   shape - ProjectDetail.jsx loads/appends these as an array instead of
//   loading/replacing a single row
// - available(project) (optional): gates whether the PM can *start* this
//   doc type yet - ProjectDetail.jsx renders a locked, non-interactive row
//   instead when this returns false. Only applies before anything has been
//   generated; a doc that already exists always renders normally regardless
//   of what available() returns later (e.g. if the project gets unarchived)
// - actionLabel (repeatable types only): the text after "+ " on the
//   always-visible trigger button (e.g. "Log Status Update")
export const DOCUMENT_TYPES = [
  {
    key: 'scoping',
    label: 'Scoping',
    table: 'scopings',
    docProp: 'scoping',
    // ScopingFlow predates this registry (it's also used standalone by
    // NewProjectFlow.jsx's wizard) and calls onGenerated(answerList,
    // sufficient) - the reverse of every other Flow's onGenerated(result,
    // answerList) convention insertDoc (ProjectDocSectionRoutes.jsx) expects.
    // This wrapper reshapes the call instead of changing ScopingFlow itself,
    // so the wizard's own handleScopingGenerated doesn't need to change too.
    FlowComponent: (props) => (
      <ScopingFlow
        {...props}
        onGenerated={(answerList, sufficient) => props.onGenerated({ sufficient }, answerList)}
      />
    ),
    ViewComponent: ScopingView,
    // Scoping runs first in the wizard - no prior docs to fold in.
    context: () => ({}),
    buildInsert: (result) => result,
  },
  {
    key: 'charter',
    label: 'Charter',
    table: 'charters',
    docProp: 'charter',
    documentsPage: true,
    FlowComponent: CharterFlow,
    ViewComponent: CharterView,
    context: (docs) => ({ scoping: docs.scoping }),
    buildInsert: (result) => result,
  },
  {
    key: 'requirements_brief',
    label: 'Requirements Brief',
    table: 'requirements_briefs',
    docProp: 'brief',
    documentsPage: true,
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
    context: (docs) => ({ charter: docs.charter, brief: docs.requirements_brief, scoping: docs.scoping }),
    buildInsert: (result) => ({ risks: result }),
  },
  {
    key: 'issue_log',
    label: 'Issues Log',
    table: 'issue_logs',
    docProp: 'issueLog',
    FlowComponent: IssueLogFlow,
    ViewComponent: IssueLogView,
    context: () => ({}),
    buildInsert: (result) => ({ issues: result }),
  },
  {
    key: 'exec_comms_plan',
    label: 'Exec Comms Plan',
    table: 'exec_comms_plans',
    docProp: 'doc',
    FlowComponent: (props) => <CommsFlow variant="exec" {...props} />,
    ViewComponent: (props) => <CommsView variant="exec" {...props} />,
    context: (docs) => ({
      charter: docs.charter,
      brief: docs.requirements_brief,
      riskLog: docs.risk_log,
      issueLog: docs.issue_log,
      statusUpdates: docs.status_update || [],
    }),
    buildInsert: (result) => result,
  },
  {
    key: 'team_newsletter',
    label: 'Team Newsletter',
    table: 'team_newsletters',
    docProp: 'doc',
    FlowComponent: (props) => <CommsFlow variant="newsletter" {...props} />,
    ViewComponent: (props) => <CommsView variant="newsletter" {...props} />,
    context: (docs) => ({
      charter: docs.charter,
      brief: docs.requirements_brief,
      riskLog: docs.risk_log,
      issueLog: docs.issue_log,
      statusUpdates: docs.status_update || [],
    }),
    buildInsert: (result) => result,
  },
  {
    key: 'status_update',
    label: 'Status Update',
    table: 'status_updates',
    docProp: 'entries',
    // Many rows per project, no upsert/replace semantics - the checklist
    // and ProjectDetail.jsx branch on this flag to load/append an array
    // instead of loading/replacing a single row.
    repeatable: true,
    actionLabel: 'Log Status Update',
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
    key: 'project_evaluation',
    label: 'Project Evaluation',
    table: 'project_evaluations',
    docProp: 'evaluations',
    repeatable: true,
    actionLabel: 'Evaluate Project',
    // Had a badgeFor() here (latest evaluation's health status as the
    // checklist row's pill) - dropped along with the checklist row itself now
    // that this renders as a section on Overview, where ProjectEvalView's own
    // health badge is right there in the card.
    FlowComponent: ProjectEvalFlow,
    ViewComponent: ProjectEvalView,
    context: (docs, tasks, extra) => ({
      charter: docs.charter,
      riskLog: docs.risk_log,
      budget: docs.budget_tracker,
      tasks: tasks || [],
      statusUpdates: docs.status_update || [],
      sprints: extra?.sprints || [],
      retros: extra?.retros || [],
      milestones: extra?.milestones || [],
      phases: extra?.phases || [],
      taskDependencies: extra?.taskDependencies || [],
    }),
    buildInsert: (result) => result,
  },
  {
    key: 'post_mortem',
    label: 'Post-Mortem',
    table: 'post_mortems',
    docProp: 'postMortem',
    documentsPage: true,
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

// The three doc types the Documents checklist renders, in DOCUMENT_TYPES
// order: Charter, Requirements Brief, Post-Mortem. Everything else in the
// registry above is reached through its own nav section (Risk Log, Issues
// Log, Communications' three items, Budget Tracker) or through Overview
// (Project Evaluation) instead of being a row here.
//
// DOCUMENT_GROUPS/groupDocumentTypes() are gone with the same change - the
// only group that ever existed was Communications, which is a nav category
// with real children now (SECTIONS_BY_CATEGORY in projectSections.js) rather
// than a collapsible row nesting three checklist items. Nothing consumed
// either export besides DocumentsRoute.jsx; mobile/MobileProjectDocuments.jsx
// has always had its own local copy of the grouping pass.
export const DOCUMENTS_PAGE_TYPES = DOCUMENT_TYPES.filter((d) => d.documentsPage)
