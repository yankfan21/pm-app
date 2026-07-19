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

  // Each row's status-dot (green/gray/amber/red) used to sit in front of
  // docType.label, duplicating the exact same badgeColorClass the
  // doc-status-badge on the right already carries - same visual language as
  // the vestigial chevron/dot chrome removed from Phases/Gantt/etc, even
  // though this dot's color was genuinely meaningful. Since the badge
  // already fully carries that same color-coded status on its own, the dot
  // was pure duplication - removed rather than restyled, since there's
  // nothing left for a restyled dot to add that the badge doesn't already
  // show.
  function renderDocRow(docType) {
    const doc = docs[docType.key]
    const isRepeatable = !!docType.repeatable
    const isDone = isDocDone(docType, doc)
    const isLocked = !!docType.available && !docType.available(project) && !isDone

    if (isLocked) {
      return (
        <li key={docType.key} className="doc-checklist-item">
          <div
            className="doc-checklist-row doc-checklist-row-locked"
            title="Available once the project is archived"
          >
            <span className="doc-checklist-label">{docType.label}</span>
            <span className="doc-status-badge pending">Locked</span>
          </div>
        </li>
      )
    }

    const isViewOpen = expandedSection === docType.key
    const isFlowOpen = activeFlowKey === docType.key
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

    return (
      <li key={docType.key} className="doc-checklist-item">
        {isRepeatable ? (
          <div className="doc-checklist-row-group">
            <button
              type="button"
              className={`doc-checklist-row ${badgeColorClass} ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
              onClick={() => toggleSection(docType.key)}
            >
              <span className="doc-checklist-label">{docType.label}</span>
              <span className={`doc-status-badge ${badgeColorClass}`}>
                {badgeLabel}
              </span>
            </button>
            {canEdit && (
              <button
                type="button"
                className="btn-secondary status-update-log-trigger"
                onClick={() => setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))}
              >
                + {docType.actionLabel}
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className={`doc-checklist-row ${badgeColorClass} ${isViewOpen || isFlowOpen ? 'selected' : ''}`}
            onClick={() => {
              if (isDone) {
                toggleSection(docType.key)
              } else if (canEdit) {
                setActiveFlowKey((prev) => (prev === docType.key ? null : docType.key))
              }
            }}
          >
            <span className="doc-checklist-label">{docType.label}</span>
            <span className={`doc-status-badge ${badgeColorClass}`}>
              {badgeLabel}
            </span>
          </button>
        )}

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
            onGenerated={(result, answerList) =>
              handleDocGenerated(docType, result, answerList)
            }
            onClose={() => setActiveFlowKey(null)}
          />
        )}
      </li>
    )
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading">Documents</h2>

      {docsLoading && <p className="charter-status">Loading...</p>}

      {!docsLoading && (
        <ul className="doc-checklist">
          {groupDocumentTypes(DOCUMENT_TYPES).map((row) => {
            if (row.type === 'doc') return renderDocRow(row.docType)

            const isGroupOpen = expandedGroup === row.key
            const doneCount = row.items.filter((docType) => isDocDone(docType, docs[docType.key])).length
            const groupStatus =
              doneCount === 0 ? 'pending' : doneCount === row.items.length ? 'done' : 'partial'
            const groupStatusLabel =
              groupStatus === 'done' ? 'Generated' : groupStatus === 'partial' ? 'In Progress' : 'Not started'

            return (
              <li key={row.key} className="doc-checklist-item doc-group">
                <button
                  type="button"
                  className={`collapsible-toggle doc-group-header toggle-header-with-badge ${groupStatus}`}
                  onClick={() => toggleGroup(row.key)}
                  aria-expanded={isGroupOpen}
                >
                  <span className="toggle-header-main">
                    <span className={`chevron ${isGroupOpen ? '' : 'collapsed'}`} aria-hidden="true">
                      ▾
                    </span>
                    <span className="doc-checklist-label">{row.label}</span>
                  </span>
                  <span className={`doc-status-badge ${groupStatus}`}>{groupStatusLabel}</span>
                </button>

                {isGroupOpen && (
                  <ul className="doc-checklist doc-group-items">
                    {row.items.map((docType) => renderDocRow(docType))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default DocumentsRoute
