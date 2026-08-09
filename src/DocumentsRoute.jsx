import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Modal from './components/Modal'
import { DOCUMENTS_PAGE_TYPES } from './documentTypes'

// The Documents checklist, routed at /projects/:projectId/documents. Not
// methodology-gated (every doc type here is available regardless of
// Waterfall/Agile/Hybrid).
//
// Three rows now - Charter, Requirements Brief, Post-Mortem
// (DOCUMENTS_PAGE_TYPES in documentTypes.jsx). The other eight doc types that
// used to be rows here moved out to their own nav sections
// (ProjectDocSectionRoutes.jsx) or to Overview (Project Evaluation); what's
// left is exactly the generate-once-and-read-later docs, which is what a
// checklist shape suits. Two things went with them: the Communications group
// row (the only group that ever existed, now a nav category with real
// children) and the ?riskFilter / ?issueFilter arrival effects that used to
// auto-open the Risk/Issues Log rows from Overview's deep links - those params
// are read by the Risk Log and Issues Log routes themselves now, which is
// where the Overview links point.
//
// Rendered as a tight-row <table> (matching TaskListView's density) rather
// than a card-style <ul>/<li> checklist - SprintRetroView's own checklist
// still uses that card style/.doc-checklist* classes, so those stay in
// App.css untouched; this file only ever used its own .doc-table* classes.
//
// Opening a doc used to push an extra .doc-table-expand-row <tr> underneath
// the clicked row, rendering the View/Flow inline in the table. That surface
// was capped by the table's own width (and by .doc-table-expand-cell's
// max-width: 0 layout hack), which was a poor fit for the wider doc types.
// Both now render in a portal-backed wide modal (components/Modal.jsx)
// instead. The state driving it is unchanged: expandedSection/activeFlowKey
// still mean exactly what they did, only the render target moved.

function isDocDone(docType, doc) {
  return docType.repeatable ? (doc?.length ?? 0) > 0 : doc != null
}

function DocumentsRoute() {
  const { project, canEdit, tasks, docs, setDocs, docsLoading } = useOutletContext()

  const [expandedSection, setExpandedSection] = useState(null)
  const [activeFlowKey, setActiveFlowKey] = useState(null)

  function toggleSection(key) {
    setExpandedSection((prev) => (prev === key ? null : key))
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

  function renderDocRow(docType) {
    const doc = docs[docType.key]
    const isRepeatable = !!docType.repeatable
    const isDone = isDocDone(docType, doc)
    const isLocked = !!docType.available && !docType.available(project) && !isDone

    if (isLocked) {
      return (
        <tr
          key={docType.key}
          className="doc-table-row doc-table-row-locked"
          title="Available once the project is archived"
        >
          <td className="doc-table-name-cell">{docType.label}</td>
          <td>
            <span className="status-dot pending" aria-hidden="true" /> Locked
          </td>
          <td className="doc-table-action-cell" />
        </tr>
      )
    }

    const isViewOpen = expandedSection === docType.key
    const isFlowOpen = activeFlowKey === docType.key
    const isExpanded = isViewOpen || isFlowOpen
    const badgeLabel = isRepeatable
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
    return (
      <tr
        key={docType.key}
        className={`doc-table-row ${isExpanded ? 'selected' : ''}`}
        onClick={activateRow}
        onKeyDown={(e) => rowKeyGuard(e, activateRow)}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
      >
        <td className="doc-table-name-cell">{docType.label}</td>
        <td>
          <span className={`status-dot ${isDone ? 'done' : 'pending'}`} aria-hidden="true" />{' '}
          {badgeLabel}
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
      </tr>
    )
  }

  // Which doc the modal is showing. Both state vars can point at the same doc
  // at once - that used to stack the View and the Flow in one expand cell, and
  // it still stacks them in one modal. When they point at *different* docs the
  // Flow wins, since it's the more recent, mid-task thing.
  const flowDocType = activeFlowKey
    ? DOCUMENTS_PAGE_TYPES.find((d) => d.key === activeFlowKey)
    : null
  const viewDocType = expandedSection
    ? DOCUMENTS_PAGE_TYPES.find((d) => d.key === expandedSection)
    : null
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
            <tbody>{DOCUMENTS_PAGE_TYPES.map((docType) => renderDocRow(docType))}</tbody>
          </table>
        </div>
      )}

      {(showModalView || showModalFlow) && (
        <Modal size="wide" onClose={closeModal}>
          <h3 className="modal-doc-title">{modalDocType.label}</h3>

          {showModalView && (
            <ModalViewComponent
              project={project}
              {...{ [modalDocType.docProp]: modalDoc }}
              {...modalDocType.context(docs, tasks)}
              canEdit={canEdit}
              onUpdate={(updatedRow) => handleDocUpdated(modalDocType, updatedRow)}
            />
          )}

          {showModalFlow && (
            <ModalFlowComponent
              project={project}
              {...modalDocType.context(docs, tasks)}
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
