import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { HEALTH_LABELS, HEALTH_COLOR_CLASS, formatEvalMetric } from '../projectEvalHealth'

// Read-only Documents (/m/projects/:projectId/more/documents). Purpose-built
// mobile component - does NOT import documentTypes.jsx (that file's
// DOCUMENT_TYPES pulls in every desktop Flow/View component at module load,
// which this screen must never touch). MOBILE_DOC_TYPES below is its own
// minimal metadata list covering just what a read-only render needs
// (table, doc shape, methodology/status gating) - kept in sync with
// documentTypes.jsx by hand if a doc type is ever added there. Risk Log and
// Issues Log are deliberately absent - they're now owned by their own tab-
// bar tabs (MobileProjectRisks.jsx, MobileProjectIssues.jsx) rather than
// living under Documents.

const CHARTER_SECTIONS = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'scope', label: 'Scope' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'success_metrics', label: 'Success Metrics' },
  { key: 'risks', label: 'Risks' },
  { key: 'timeline', label: 'Timeline' },
]

const REQUIREMENTS_SECTIONS = [
  { key: 'problem_statement', label: 'Problem Statement' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'scope_in', label: 'Scope (In)' },
  { key: 'scope_out', label: 'Scope (Out)' },
  { key: 'functional_requirements', label: 'Functional Requirements' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'assumptions', label: 'Assumptions' },
]

const EXEC_COMMS_SECTIONS = [
  { key: 'status_summary', label: 'Status Summary' },
  { key: 'key_decisions', label: 'Key Decisions Needed' },
  { key: 'risks_blockers', label: 'Risks & Blockers' },
  { key: 'ask', label: 'The Ask' },
]

const NEWSLETTER_SECTIONS = [
  { key: 'highlights', label: 'Highlights & Wins' },
  { key: 'upcoming_milestones', label: 'Upcoming Milestones' },
  { key: 'shoutouts', label: 'Shoutouts' },
  { key: 'links', label: 'Links & Resources' },
]

const POST_MORTEM_SECTIONS = [
  { key: 'objectives_met', label: 'Objectives Met' },
  { key: 'what_went_well', label: 'What Went Well' },
  { key: 'variances', label: "What Didn't Go Well / Variances" },
  { key: 'root_causes', label: 'Root Causes' },
  { key: 'lessons_learned', label: 'Lessons Learned' },
  { key: 'recommendations', label: 'Recommendations for Future Projects' },
]

const MOBILE_DOC_TYPES = [
  { key: 'charter', label: 'Charter', table: 'charters', kind: 'sections', sections: CHARTER_SECTIONS },
  {
    key: 'requirements_brief',
    label: 'Requirements Brief',
    table: 'requirements_briefs',
    kind: 'sections',
    sections: REQUIREMENTS_SECTIONS,
  },
  {
    key: 'exec_comms_plan',
    label: 'Exec Comms Plan',
    table: 'exec_comms_plans',
    kind: 'sections',
    sections: EXEC_COMMS_SECTIONS,
    group: 'communications',
  },
  {
    key: 'team_newsletter',
    label: 'Team Newsletter',
    table: 'team_newsletters',
    kind: 'sections',
    sections: NEWSLETTER_SECTIONS,
    group: 'communications',
  },
  { key: 'status_update', label: 'Status Update', table: 'status_updates', repeatable: true, kind: 'status' },
  { key: 'budget_tracker', label: 'Budget Tracker', table: 'budget_trackers', kind: 'budget' },
  {
    key: 'project_evaluation',
    label: 'Project Evaluation',
    table: 'project_evaluations',
    repeatable: true,
    kind: 'eval',
  },
  {
    key: 'post_mortem',
    label: 'Post-Mortem',
    table: 'post_mortems',
    kind: 'sections',
    sections: POST_MORTEM_SECTIONS,
    // Mirrors documentTypes.jsx's post_mortem gate - only worth writing (and
    // reading) once the project is archived.
    available: (project) => project.status === 'Archived',
  },
]

const GROUP_LABELS = { communications: 'Communications' }

// Same flat-list -> ordered-rows reduction as documentTypes.jsx's
// groupDocumentTypes, reimplemented locally so this file never imports that
// module (see file header).
function groupDocTypes(types) {
  const rows = []
  const byGroup = {}
  types.forEach((docType) => {
    if (!docType.group) {
      rows.push({ type: 'doc', docType })
      return
    }
    let row = byGroup[docType.group]
    if (!row) {
      row = { type: 'group', key: docType.group, label: GROUP_LABELS[docType.group] || docType.group, items: [] }
      byGroup[docType.group] = row
      rows.push(row)
    }
    row.items.push(docType)
  })
  return rows
}

function isDocDone(docType, doc) {
  return docType.repeatable ? (doc?.length ?? 0) > 0 : doc != null
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatCurrency(amount) {
  return (Number(amount) || 0).toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}

function SectionsDetail({ sections, doc }) {
  return (
    <>
      {sections.map(({ key, label }) =>
        doc[key] ? (
          <div className="mobile-doc-section" key={key}>
            <h4 className="mobile-doc-section-heading">{label}</h4>
            <p className="mobile-doc-section-body">{doc[key]}</p>
          </div>
        ) : null
      )}
    </>
  )
}

function BudgetDetail({ doc }) {
  const items = doc.line_items || []
  const estimated = items.reduce((sum, r) => sum + (Number(r.estimated_amount) || 0), 0)
  const actual = items.reduce((sum, r) => sum + (Number(r.actual_amount) || 0), 0)
  const variance = actual - estimated

  return (
    <>
      <div className="mobile-doc-budget-summary">
        <div className="mobile-doc-budget-stat">
          <span className="mobile-doc-budget-stat-label">Total Budget</span>
          <span className="mobile-doc-budget-stat-value">{formatCurrency(estimated)}</span>
        </div>
        <div className="mobile-doc-budget-stat">
          <span className="mobile-doc-budget-stat-label">Total Actual</span>
          <span className="mobile-doc-budget-stat-value">{formatCurrency(actual)}</span>
        </div>
        <div className="mobile-doc-budget-stat">
          <span className="mobile-doc-budget-stat-label">Variance</span>
          <span className="mobile-doc-budget-stat-value">
            {variance >= 0 ? '+' : ''}
            {formatCurrency(variance)}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="mobile-screen-stub">No line items yet.</p>
      ) : (
        <div className="mobile-doc-card-list">
          {items.map((item, i) => (
            <div className="mobile-doc-risk-card" key={i}>
              <p className="mobile-doc-section-body">{item.name || '(unnamed item)'}</p>
              <p className="mobile-doc-risk-meta">
                {item.category ? `${item.category} · ` : ''}
                {formatCurrency(item.estimated_amount)} est. &middot; {formatCurrency(item.actual_amount)} actual
              </p>
              {item.notes && <p className="mobile-doc-section-body">{item.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

const STATUS_FIELDS = [
  { key: 'what_got_done', label: 'What got done' },
  { key: 'whats_blocked', label: "What's blocked" },
  { key: 'whats_coming_up', label: "What's coming up" },
]

function StatusUpdateDetail({ doc }) {
  const entries = doc || []
  if (entries.length === 0) return <p className="mobile-screen-stub">No status updates logged yet.</p>

  return (
    <div className="mobile-doc-card-list">
      {entries.map((entry) => (
        <div className="mobile-doc-status-entry" key={entry.id}>
          <p className="mobile-doc-risk-meta">{formatDate(entry.created_at)}</p>
          {STATUS_FIELDS.map(({ key, label }) =>
            entry[key] ? (
              <div className="mobile-doc-section" key={key}>
                <h4 className="mobile-doc-section-heading">{label}</h4>
                <p className="mobile-doc-section-body">{entry[key]}</p>
              </div>
            ) : null
          )}
        </div>
      ))}
    </div>
  )
}

function EvalCard({ evaluation }) {
  const metricText = formatEvalMetric(evaluation.metrics, { longer: true })

  return (
    <div className="mobile-doc-status-entry">
      <span className={`mobile-health-badge mobile-health-${evaluation.health_status}`}>
        {HEALTH_LABELS[evaluation.health_status] || evaluation.health_status}
      </span>
      <p className="mobile-doc-risk-meta">{formatDate(evaluation.created_at)}</p>
      {metricText && <p className="mobile-doc-section-body">{metricText}</p>}
      {evaluation.rationale && <p className="mobile-doc-section-body">{evaluation.rationale}</p>}
      {(evaluation.recommendations || []).length > 0 && (
        <div className="mobile-doc-section">
          <h4 className="mobile-doc-section-heading">Recommended Actions</h4>
          <ul className="mobile-doc-recs-list">
            {evaluation.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function EvalDetail({ doc }) {
  const evaluations = doc || []
  if (evaluations.length === 0) return <p className="mobile-screen-stub">No evaluations yet.</p>
  const [latest, ...older] = evaluations

  return (
    <div className="mobile-doc-card-list">
      <EvalCard evaluation={latest} />
      {older.map((evaluation) => (
        <EvalCard key={evaluation.id} evaluation={evaluation} />
      ))}
    </div>
  )
}

function renderDetail(docType, doc) {
  switch (docType.kind) {
    case 'budget':
      return <BudgetDetail doc={doc} />
    case 'status':
      return <StatusUpdateDetail doc={doc} />
    case 'eval':
      return <EvalDetail doc={doc} />
    default:
      return <SectionsDetail sections={docType.sections} doc={doc} />
  }
}

function DocRow({ docType, doc, expanded, onToggle, indented }) {
  const isRepeatable = !!docType.repeatable
  const isDone = isDocDone(docType, doc)
  const lastUpdated = isRepeatable ? doc?.[0]?.created_at : doc?.updated_at

  let badgeLabel
  let badgeClass
  if (docType.key === 'project_evaluation' && isDone) {
    const status = doc[0].health_status
    badgeLabel = HEALTH_LABELS[status] || 'Evaluated'
    badgeClass = HEALTH_COLOR_CLASS[status] || 'pending'
  } else if (isRepeatable) {
    badgeLabel = `${doc?.length ?? 0} logged`
    badgeClass = isDone ? 'done' : 'pending'
  } else {
    badgeLabel = isDone ? 'Generated' : 'Not started'
    badgeClass = isDone ? 'done' : 'pending'
  }

  return (
    <div className={`mobile-doc-card ${indented ? 'mobile-doc-card--indented' : ''}`}>
      <button
        type="button"
        className="mobile-doc-row"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="mobile-doc-row-main">
          <span className="mobile-doc-row-label">{docType.label}</span>
          {lastUpdated && <span className="mobile-doc-row-meta">Updated {formatDate(lastUpdated)}</span>}
        </div>
        <span className={`mobile-doc-badge ${badgeClass}`}>{badgeLabel}</span>
        <span className={`mobile-doc-chevron ${expanded ? '' : 'collapsed'}`} aria-hidden="true">
          &#9662;
        </span>
      </button>

      {expanded && (
        <div className="mobile-doc-detail">
          {isDone ? (
            renderDetail(docType, doc)
          ) : (
            <p className="mobile-screen-stub">{docType.label} hasn't been created yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function LockedDocRow({ docType }) {
  return (
    <div className="mobile-doc-card">
      <div className="mobile-doc-row mobile-doc-row-locked" title="Available once the project is archived">
        <div className="mobile-doc-row-main">
          <span className="mobile-doc-row-label">{docType.label}</span>
        </div>
        <span className="mobile-doc-badge pending">Locked</span>
      </div>
    </div>
  )
}

function MobileProjectDocuments() {
  const { project } = useOutletContext()
  const { projectId } = useParams()

  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedKey, setExpandedKey] = useState(null)
  const [expandedGroup, setExpandedGroup] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      const results = await Promise.all(
        MOBILE_DOC_TYPES.map((docType) => {
          const query = supabase.from(docType.table).select('*').eq('project_id', projectId)
          return docType.repeatable ? query.order('created_at', { ascending: false }) : query.maybeSingle()
        })
      )

      if (cancelled) return

      const firstError = results.find((r) => r.error)?.error
      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const next = {}
      results.forEach((r, i) => {
        next[MOBILE_DOC_TYPES[i].key] = r.data
      })
      setDocs(next)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading) {
    return (
      <div>
        <h1 className="mobile-screen-title">Documents</h1>
        <p className="mobile-screen-stub">Loading documents...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h1 className="mobile-screen-title">Documents</h1>
        <p className="mobile-error">{error}</p>
      </div>
    )
  }

  function toggleRow(key) {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  function toggleGroup(key) {
    setExpandedGroup((prev) => (prev === key ? null : key))
  }

  return (
    <div>
      <h1 className="mobile-screen-title">Documents</h1>

      <div className="mobile-doc-list">
        {groupDocTypes(MOBILE_DOC_TYPES).map((row) => {
          if (row.type === 'doc') {
            const docType = row.docType
            const doc = docs[docType.key]
            const locked = !!docType.available && !docType.available(project) && !isDocDone(docType, doc)

            if (locked) return <LockedDocRow key={docType.key} docType={docType} />

            return (
              <DocRow
                key={docType.key}
                docType={docType}
                doc={doc}
                expanded={expandedKey === docType.key}
                onToggle={() => toggleRow(docType.key)}
              />
            )
          }

          const isGroupOpen = expandedGroup === row.key
          const doneCount = row.items.filter((docType) => isDocDone(docType, docs[docType.key])).length
          const groupStatus = doneCount === 0 ? 'pending' : doneCount === row.items.length ? 'done' : 'partial'
          const groupLabel = groupStatus === 'done' ? 'Generated' : groupStatus === 'partial' ? 'In Progress' : 'Not started'

          return (
            <div className="mobile-doc-card" key={row.key}>
              <button
                type="button"
                className="mobile-doc-row"
                onClick={() => toggleGroup(row.key)}
                aria-expanded={isGroupOpen}
              >
                <div className="mobile-doc-row-main">
                  <span className="mobile-doc-row-label">{row.label}</span>
                </div>
                <span className={`mobile-doc-badge ${groupStatus}`}>{groupLabel}</span>
                <span className={`mobile-doc-chevron ${isGroupOpen ? '' : 'collapsed'}`} aria-hidden="true">
                  &#9662;
                </span>
              </button>

              {isGroupOpen &&
                row.items.map((docType) => (
                  <DocRow
                    key={docType.key}
                    docType={docType}
                    doc={docs[docType.key]}
                    expanded={expandedKey === docType.key}
                    onToggle={() => toggleRow(docType.key)}
                    indented
                  />
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default MobileProjectDocuments
