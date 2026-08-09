import { useState } from 'react'
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { DOCUMENT_TYPES } from './documentTypes'
import { visibleSectionsForCategory } from './projectSections'

// The doc types that used to be rows on the Documents checklist and are now
// top-level nav destinations of their own (Risk Log, Issues Log,
// Communications' three items, Budget Tracker) - see PRIMARY_CATEGORIES in
// projectSections.js. Nothing about the underlying doc types moved: these
// routes still read the same DOCUMENT_TYPES entry (table/docProp/context/
// buildInsert) and still render the same Flow/View components DocumentsRoute
// rendered in its modal. The only difference is the chrome around them - a
// full page in .detail-zone rather than a row plus a modal.
//
// DocSection below is the shared body of every route here. It's the modal's
// generate-then-view lifecycle unrolled into a page:
//
//   nothing generated yet -> a start button that mounts the Flow
//   generated             -> the View
//   repeatable type       -> the View plus a persistent "+ <actionLabel>"
//
// The start button matters: every Flow component fires its Edge Function
// question fetch from a mount effect, so rendering one unconditionally would
// mean merely navigating to Budget Tracker kicks off an AI call. The button
// keeps that an explicit PM action, same as clicking the checklist row was.

// Blank risk row shape matching RiskLogView.jsx's own newRow() (not exported
// from there) - kept in sync manually since this is the only other place
// that needs to originate a row rather than edit one. Feeds the Risk Log
// page's manual "+ Log a Risk" seed path (see RiskLogRoute).
function newRiskLogRow() {
  return {
    id: crypto.randomUUID(),
    risk: '',
    likelihood: null,
    severity: null,
    mitigation: '',
    owner: '',
  }
}

// `seed` (optional) adds a second, non-AI creation path for a doc type whose
// FlowComponent is an AI Q&A flow: { label, build() } inserts
// buildInsert(build()) directly and lands the PM straight in the View. Only
// Risk Log uses it - it's how the old Execution > "Log a Risk" entry point
// let a PM flag something without going through RiskLogFlow's Q&A first.
function DocSection({ docKey, title, viewProps, seed }) {
  const {
    project,
    canEdit,
    docs,
    setDocs,
    docsLoading,
    tasks,
    taskDependencies,
    sprints,
    retros,
    milestones,
    phases,
  } = useOutletContext()

  const [flowOpen, setFlowOpen] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState(null)

  const docType = DOCUMENT_TYPES.find((d) => d.key === docKey)
  const doc = docs[docKey]
  const isRepeatable = !!docType.repeatable
  const isDone = isRepeatable ? (doc?.length ?? 0) > 0 : doc != null

  // Identical prop assembly to DocumentsRoute's modal - the cross-doc context
  // these components expect comes off the layout's already-loaded docs/tasks,
  // so no route here loads anything of its own.
  const contextProps = docType.context(docs, tasks, {
    sprints,
    retros,
    milestones,
    phases,
    taskDependencies,
  })

  async function insertDoc(result, answerList) {
    const { data, error: insertError } = await supabase
      .from(docType.table)
      .insert({
        project_id: project.id,
        ...docType.buildInsert(result),
        ...(isRepeatable ? {} : { qa_answers: answerList }),
      })
      .select()
      .single()

    if (insertError) return insertError.message

    setDocs((prev) => ({
      ...prev,
      [docKey]: isRepeatable ? [data, ...(prev[docKey] || [])] : data,
    }))
    setFlowOpen(false)
    return null
  }

  async function handleSeed() {
    setSeeding(true)
    setError(null)
    const seedError = await insertDoc(seed.build(), [])
    setSeeding(false)
    if (seedError) setError(seedError)
  }

  const ViewComponent = docType.ViewComponent
  const FlowComponent = docType.FlowComponent
  const startLabel = isRepeatable ? `+ ${docType.actionLabel}` : `+ Generate ${docType.label}`
  // Repeatable types can always add another; single-row types only offer the
  // Flow until one exists (the PM-acceptance guardrail - see CLAUDE.md - is
  // why a generated doc has no regenerate-over-it button here).
  const canStart = canEdit && (isRepeatable || !isDone)
  // The Flow button demotes to secondary whenever it isn't the page's main
  // call to action: next to Risk Log's manual seed button, or above an
  // already-populated repeatable View.
  const showSeedButton = !!seed && !isDone
  const flowButtonClass = showSeedButton || isDone ? 'btn-secondary' : 'btn-primary'

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading">{title || docType.label}</h2>

      {docsLoading ? (
        <p className="charter-status">Loading...</p>
      ) : (
        <>
          {error && <p className="error">{error}</p>}

          {canStart && !flowOpen && (
            <div className="doc-page-actions">
              {showSeedButton && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSeed}
                  disabled={seeding}
                >
                  {seeding ? 'Starting...' : seed.label}
                </button>
              )}
              <button type="button" className={flowButtonClass} onClick={() => setFlowOpen(true)}>
                {showSeedButton ? 'Generate with AI' : startLabel}
              </button>
            </div>
          )}

          {flowOpen && canEdit && (
            <FlowComponent
              project={project}
              {...contextProps}
              onGenerated={insertDoc}
              onClose={() => setFlowOpen(false)}
            />
          )}

          {isDone && (
            <ViewComponent
              project={project}
              {...{ [docType.docProp]: doc }}
              {...contextProps}
              canEdit={canEdit}
              onUpdate={(updatedRow) => setDocs((prev) => ({ ...prev, [docKey]: updatedRow }))}
              {...viewProps}
            />
          )}

          {!isDone && !canEdit && <p className="charter-status">Nothing logged yet.</p>}
        </>
      )}
    </div>
  )
}

// Risk Log - full page, with the ?riskFilter / ?riskId query params
// KeyMetricsDashboard.jsx's Key Risks list links in with wired straight into
// RiskLogView's own filter/highlight props. The sync is two-way (the URL
// follows the severity chip the PM clicks on this page too), so a refresh or
// back-button never lands on a stale filter - same contract DocumentsRoute
// used to hold for the Risk Log modal.
export function RiskLogRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const riskFilter = searchParams.get('riskFilter')
  const riskId = searchParams.get('riskId')

  function setRiskFilter(level) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (level === 'All') next.delete('riskFilter')
      else next.set('riskFilter', level)
      return next
    })
  }

  // Fired once RiskLogView has scrolled to and flashed the target row - drops
  // just riskId, keeping riskFilter so the severity view the PM landed on
  // stays put. `replace: true` so this doesn't add a second back-button stop
  // on top of the navigation that brought them here.
  function clearRiskId() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('riskId')
        return next
      },
      { replace: true }
    )
  }

  return (
    <DocSection
      docKey="risk_log"
      seed={{ label: '+ Log a Risk', build: () => [newRiskLogRow()] }}
      viewProps={{
        initialSeverityFilter: riskFilter,
        onSeverityFilterChange: setRiskFilter,
        highlightRiskId: riskId,
        onRiskHighlightDone: clearRiskId,
      }}
    />
  )
}

// Issues Log - same URL-synced filter treatment for the ?issueFilter param
// the Overview Issue Summary badges link in with. No `seed` here: this doc
// type's FlowComponent (IssueLogFlow.jsx) is already a one-button
// seed-a-blank-row starter rather than an AI Q&A flow, so the default start
// button is the manual path.
export function IssuesLogRoute() {
  const [searchParams, setSearchParams] = useSearchParams()
  const issueFilter = searchParams.get('issueFilter')

  function setIssueFilter(status) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (status === 'All') next.delete('issueFilter')
      else next.set('issueFilter', status)
      return next
    })
  }

  return (
    <DocSection
      docKey="issue_log"
      title="Issues Log"
      viewProps={{ initialStatusFilter: issueFilter, onStatusFilterChange: setIssueFilter }}
    />
  )
}

export function BudgetTrackerRoute() {
  return <DocSection docKey="budget_tracker" />
}

// Bare /communications - same first-visible-section redirect the Planning and
// Execution index routes use (none of Communications' three children are
// methodology-gated, so in practice this always lands on Exec Comms Plan).
export function CommunicationsIndexRoute() {
  const { project } = useOutletContext()
  const sections = visibleSectionsForCategory('communications', project.methodology)
  return <Navigate to={sections[0] ? sections[0].path : '../overview'} replace />
}

export function ExecCommsRoute() {
  return <DocSection docKey="exec_comms_plan" />
}

export function TeamNewsletterRoute() {
  return <DocSection docKey="team_newsletter" />
}

export function StatusUpdateRoute() {
  return <DocSection docKey="status_update" />
}

// Project Evaluation - not a nav route of its own. Rendered inline on
// Overview (ProjectOverviewRoute.jsx) as the interim home for it after it
// came off the Documents checklist; final placement is a deferred call for a
// future Overview redesign.
export function ProjectEvalSection() {
  return <DocSection docKey="project_evaluation" title="Project Evaluation" />
}
