import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from './supabaseClient'
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

  // Returns an array of <tr>s for one doc type: the row itself, plus an
  // expand row underneath when its View and/or Flow is open. `indented`
  // marks a row rendered as a group's child (Communications' three items).
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
    const { ViewComponent, FlowComponent, docProp } = docType
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

    const rows = [
      <tr
        key={docType.key}
        className={`doc-table-row ${isExpanded ? 'selected' : ''}`}
        onClick={activateRow}
        onKeyDown={(e) => rowKeyGuard(e, activateRow)}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
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

    if (isViewOpen || isFlowOpen) {
      rows.push(
        <tr key={`${docType.key}-expand`} className="doc-table-expand-row">
          <td colSpan={3} className="doc-table-expand-cell">
            {isViewOpen && doc && (
              <ViewComponent
                project={project}
                {...{ [docProp]: doc }}
                {...docType.context(docs, tasks, { sprints, retros, milestones, phases, taskDependencies })}
                canEdit={canEdit}
                onUpdate={(updatedRow) => handleDocUpdated(docType, updatedRow)}
              />
            )}
            {isFlowOpen && canEdit && (
              <FlowComponent
                project={project}
                {...docType.context(docs, tasks, { sprints, retros, milestones, phases, taskDependencies })}
                onGenerated={(result, answerList) => handleDocGenerated(docType, result, answerList)}
                onClose={() => setActiveFlowKey(null)}
              />
            )}
          </td>
        </tr>
      )
    }

    return rows
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
    </div>
  )
}

export default DocumentsRoute
