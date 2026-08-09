import { useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Modal from './components/Modal'
import { DOCUMENT_TYPES, groupDocumentTypes } from './documentTypes'

// The Documents checklist - Phase 2 extraction out of ProjectOverviewRoute.jsx
// (which was its Phase 1 interim home; see projectSections.js), now routed
// at /projects/:projectId/documents. Not methodology-gated (every doc type
// is available regardless of Waterfall/Agile/Hybrid). Unlike the sections
// under Planning/Execution, this one keeps its internal accordion behavior
// (expandedSection/activeFlowKey/expandedGroup below) - that's a real,
// still-useful per-doc-type/per-group collapse, not the page-level "which
// section am I looking at" toggle that got removed elsewhere; the outer
// "Documents" heading itself was never a collapsible button to begin with.
//
// Rendered as a tight-row <table> (matching TaskListView's density) rather
// than a card-style <ul>/<li> checklist - SprintRetroView's own checklist
// still uses that card style/.doc-checklist* classes, so those stay in
// App.css untouched; this file only ever used its own .doc-table* classes.
// Each doc/group contributes one or more <tr>s via renderDocRow, flattened
// into a single <tbody> with .flatMap().
//
// Opening a doc used to push an extra .doc-table-expand-row <tr> underneath
// the clicked row, rendering the View/Flow inline in the table. That surface
// was capped by the table's own width (and by .doc-table-expand-cell's
// max-width: 0 layout hack), which is a poor fit for the wider doc types -
// RiskLogView/IssueLogView/BudgetView all render tables, and .risk-log-table
// alone carries min-width: 760px. Both now render in a portal-backed wide
// modal (components/Modal.jsx) instead. The state driving it is unchanged:
// expandedSection/activeFlowKey still mean exactly what they did, only the
// render target moved, which is what keeps the ?riskFilter / ?issueFilter
// arrival effects below working untouched.

function isDocDone(docType, doc) {
  return docType.repeatable ? (doc?.length ?? 0) > 0 : doc != null
}

function DocumentsRoute() {
  const {
    project,
    canEdit,
    tasks,
    taskDependencies,
    sprints,
    retros,
    milestones,
    phases,
    docs,
    setDocs,
    docsLoading,
  } = useOutletContext()

  const [expandedSection, setExpandedSection] = useState(null)
  const [activeFlowKey, setActiveFlowKey] = useState(null)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const riskFilter = searchParams.get('riskFilter')
  const issueFilter = searchParams.get('issueFilter')
  const riskId = searchParams.get('riskId')

  // Arrival from an Overview risk link (see KeyMetricsDashboard.jsx's
  // KeyRisksCard) - land straight on the already-expanded Risk Log row
  // instead of making the PM click it open. Note this keys off riskFilter,
  // not riskId, which is why KeyRisksCard sends both.
  useEffect(() => {
    if (riskFilter) setExpandedSection('risk_log')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [riskFilter])

  // Same arrival behavior for the Issue Summary card (KeyMetricsDashboard.jsx's
  // IssueSummaryCard) - lands straight on the already-expanded Issues Log row.
  useEffect(() => {
    if (issueFilter) setExpandedSection('issue_log')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issueFilter])

  // Keeps the URL in sync with whatever severity RiskLogView is currently
  // showing - both explicit "Clear" (back to All) and switching to a
  // different severity chip while already on this page - so refresh/back
  // don't leave a stale filter behind.
  function setRiskFilter(level) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (level === 'All') next.delete('riskFilter')
      else next.set('riskFilter', level)
      return next
    })
  }

  // Fired once RiskLogView has scrolled to and flashed the target row (see
  // its highlightRiskId effect) - drops just riskId, keeping riskFilter so
  // the severity view the Hotspot landed on stays put. `replace: true` so
  // this doesn't add a second back-button stop on top of the navigation
  // that brought the PM here.
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

  // Same URL-sync behavior for IssueLogView's status filter.
  function setIssueFilter(status) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (status === 'All') next.delete('issueFilter')
      else next.set('issueFilter', status)
      return next
    })
  }

  function toggleSection(key) {
    setExpandedSection((prev) => (prev === key ? null : key))
  }

  function toggleGroup(key) {
    setExpandedGroup((prev) => (prev === key ? null : key))
  }

  async function handleDocGenerated(docType, result, answerList) {
    const { data, error } = await supabase
      .from(docType.table)
      .insert({
        project_id: project.id,
        ...docType.buildInsert(result),
        ...(docType.repeatable ? {} : { qa_answers: answerList }),
      })
      .select()
      .single()

    if (error) {
      return error.message
    }

    setDocs((prev) => ({
      ...prev,
      [docType.key]: docType.repeatable ? [data, ...(prev[docType.key] || [])] : data,
    }))
    setActiveFlowKey(null)
    setExpandedSection(docType.key)
    return null
  }

  function handleDocUpdated(docType, updatedRow) {
    setDocs((prev) => ({ ...prev, [docType.key]: updatedRow }))
  }

  // Ignores keydown events that bubble up from a nested interactive child
  // (e.g. the repeatable-type "+ Log..." button in the Actions cell) so
  // pressing Enter/Space on that button doesn't also toggle the row.
  function rowKeyGuard(e, activate) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }

  // Returns an array of <tr>s for one doc type - one row, but still an array
  // so the .flatMap() below can splice a group's children in alongside it.
  // `indented` marks a row rendered as a group's child (Communications' three
  // items). The doc itself opens in the modal at the bottom of this file.
  function renderDocRow(docType, { indented = false } = {}) {
    const doc = docs[docType.key]
    const isRepeatable = !!docType.repeatable
    const isDone = isDocDone(docType, doc)
    const isLocked = !!docType.available && !docType.available(project) && !isDone
    const nameCellClass = `doc-table-name-cell ${indented ? 'doc-table-name-cell--indented' : ''}`

    if (isLocked) {
      return [
        <tr
          key={docType.key}
          className="doc-table-row doc-table-row-locked"
          title="Available once the project is archived"
        >
          <td className={nameCellClass}>{docType.label}</td>
          <td>
            <span className="status-dot pending" aria-hidden="true" /> Locked
          </td>
          <td className="doc-table-action-cell" />
        </tr>,
      ]
    }

    const isViewOpen = expandedSection === docType.key
    const isFlowOpen = activeFlowKey === docType.key
    const isExpanded = isViewOpen || isFlowOpen
    const customBadge = docType.badgeFor ? docType.badgeFor(doc) : null
    const badgeColorClass = customBadge ? customBadge.colorClass : isDone ? 'done' : 'pending'
    const badgeLabel = customBadge
      ? customBadge.label
      : isRepeatable
        ? `${doc?.length ?? 0} logged`
        : isDone
          ? 'Generated'
          : 'Not started'

    function activateRow() {
      if (isRepeatable || isDone) {
        toggleSection(docType.key)
      } else if (canEdit) {
        setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))
      }
    }

    // aria-haspopup rather than the aria-expanded this row used to carry:
    // clicking it opens a dialog now, it doesn't expand a region below itself.
    const rows = [
      <tr
        key={docType.key}
        className={`doc-table-row ${isExpanded ? 'selected' : ''}`}
        onClick={activateRow}
        onKeyDown={(e) => rowKeyGuard(e, activateRow)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
      >
        <td className={nameCellClass}>
          <span className={`chevron doc-table-chevron ${isExpanded ? '' : 'collapsed'}`} aria-hidden="true">
            ▾
          </span>
          {docType.label}
        </td>
        <td>
          <span className={`status-dot ${badgeColorClass}`} aria-hidden="true" /> {badgeLabel}
        </td>
        <td className="doc-table-action-cell">
          {isRepeatable && canEdit && (
            <button
              type="button"
              className="btn-secondary status-update-log-trigger"
              onClick={(e) => {
                e.stopPropagation()
                setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))
              }}
            >
              + {docType.actionLabel}
            </button>
          )}
        </td>
      </tr>,
    ]

    return rows
  }

  // Which doc the modal is showing. Both state vars can point at the same doc
  // at once (open Status Update's history, then hit "+ Log Status Update") -
  // that used to stack the View and the Flow in one expand cell, and it still
  // stacks them in one modal. When they point at *different* docs the Flow
  // wins, since it's the more recent, mid-task thing.
  const flowDocType = activeFlowKey ? DOCUMENT_TYPES.find((d) => d.key === activeFlowKey) : null
  const viewDocType = expandedSection ? DOCUMENT_TYPES.find((d) => d.key === expandedSection) : null
  const modalDocType = flowDocType || viewDocType
  const modalDoc = modalDocType ? docs[modalDocType.key] : null
  const showModalView = modalDocType != null && modalDocType === viewDocType && modalDoc != null
  const showModalFlow = modalDocType != null && modalDocType === flowDocType && canEdit
  const ModalViewComponent = modalDocType?.ViewComponent
  const ModalFlowComponent = modalDocType?.FlowComponent

  // Dismissing the modal clears both, so closing out of a Flow that was
  // opened on top of an already-open View lands back on the checklist rather
  // than dropping the PM onto the View underneath it.
  function closeModal() {
    setExpandedSection(null)
    setActiveFlowKey(null)
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading">Documents</h2>

      {docsLoading && <p className="charter-status">Loading...</p>}

      {!docsLoading && (
        <div className="risk-table-wrap">
          <table className="risk-log-table doc-table">
            <thead>
              <tr>
                <th>Doc Name</th>
                <th>Status</th>
                <th className="doc-table-action-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupDocumentTypes(DOCUMENT_TYPES).flatMap((row) => {
                if (row.type === 'doc') return renderDocRow(row.docType)

                const isGroupOpen = expandedGroup === row.key
                const doneCount = row.items.filter((docType) => isDocDone(docType, docs[docType.key])).length
                const groupStatus =
                  doneCount === 0 ? 'pending' : doneCount === row.items.length ? 'done' : 'partial'
                const groupStatusLabel =
                  groupStatus === 'done' ? 'Generated' : groupStatus === 'partial' ? 'In Progress' : 'Not started'

                const groupRow = (
                  <tr
                    key={row.key}
                    className="doc-table-row doc-table-group-row"
                    onClick={() => toggleGroup(row.key)}
                    onKeyDown={(e) => rowKeyGuard(e, () => toggleGroup(row.key))}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isGroupOpen}
                  >
                    <td className="doc-table-name-cell">
                      <span
                        className={`chevron doc-table-chevron ${isGroupOpen ? '' : 'collapsed'}`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                      {row.label}
                    </td>
                    <td>
                      <span className={`status-dot ${groupStatus}`} aria-hidden="true" /> {groupStatusLabel}
                    </td>
                    <td className="doc-table-action-cell" />
                  </tr>
                )

                const childRows = isGroupOpen
                  ? row.items.flatMap((docType) => renderDocRow(docType, { indented: true }))
                  : []

                return [groupRow, ...childRows]
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Both guards matter, not just modalDocType: the ?riskFilter /
          ?issueFilter arrival effects set expandedSection before loadDocs()
          has resolved (and on a project that has no risk/issue log at all,
          never resolve to a row) - without this the PM would get an empty
          modal instead of nothing, which is what the old expand row did. */}
      {(showModalView || showModalFlow) && (
        <Modal size="wide" onClose={closeModal}>
          <h3 className="modal-doc-title">{modalDocType.label}</h3>

          {showModalView && (
            <ModalViewComponent
              project={project}
              {...{ [modalDocType.docProp]: modalDoc }}
              {...modalDocType.context(docs, tasks, { sprints, retros, milestones, phases, taskDependencies })}
              canEdit={canEdit}
              onUpdate={(updatedRow) => handleDocUpdated(modalDocType, updatedRow)}
              {...(modalDocType.key === 'risk_log'
                ? {
                    initialSeverityFilter: riskFilter,
                    onSeverityFilterChange: setRiskFilter,
                    highlightRiskId: riskId,
                    onRiskHighlightDone: clearRiskId,
                  }
                : {})}
              {...(modalDocType.key === 'issue_log'
                ? { initialStatusFilter: issueFilter, onStatusFilterChange: setIssueFilter }
                : {})}
            />
          )}

          {showModalFlow && (
            <ModalFlowComponent
              project={project}
              {...modalDocType.context(docs, tasks, { sprints, retros, milestones, phases, taskDependencies })}
              onGenerated={(result, answerList) => handleDocGenerated(modalDocType, result, answerList)}
              onClose={() => setActiveFlowKey(null)}
            />
          )}
        </Modal>
      )}
    </div>
  )
}

export default DocumentsRoute
