import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportCommsDocx, exportCommsPdf } from './commsExport'
import { COMMS_VARIANTS } from './commsSections'
import CommsFollowUp from './CommsFollowUp'

const REVISE_ACTIONS = [
  { instruction: 'shorter', label: 'Make shorter' },
  { instruction: 'detail', label: 'Add detail' },
  { instruction: 'rephrase', label: 'Rephrase' },
]

const DOC_TYPE_BY_VARIANT = {
  exec: 'exec_comms_plan',
  newsletter: 'team_newsletter',
}

function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Shared view/regenerate/revise/export component for both Stakeholder Comms
// Plan document types. See CommsFlow.jsx for why this is one parameterized
// component rather than two near-duplicate files.
//
// Whole-document regeneration (manual "Regenerate" or "Update from Latest
// Status") never writes straight to the DB - the edge function's draft is
// held as `proposedVersion` until the PM explicitly Accepts or Discards it,
// per the app's guardrail that AI output never silently replaces an
// accepted version. Accepting snapshots the row being superseded into the
// generic `document_versions` table before overwriting it, which backs the
// "History" panel below.
function CommsView({ variant, project, charter, brief, riskLog, statusUpdates, doc, canEdit, onUpdate }) {
  const { table, title, pageSubtitle, sections } = COMMS_VARIANTS[variant]
  const docTypeKey = DOC_TYPE_BY_VARIANT[variant]
  const [values, setValues] = useState(() =>
    Object.fromEntries(sections.map((s) => [s.key, doc[s.key] || '']))
  )
  const [regenerating, setRegenerating] = useState(null) // null | 'regenerate' | 'status'
  const [proposedVersion, setProposedVersion] = useState(null) // { content, fromStatus }
  const [error, setError] = useState(null)
  const [revisions, setRevisions] = useState({})
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState(null) // null = not loaded yet
  const [versionsLoading, setVersionsLoading] = useState(false)
  const textareaRefs = useRef({})

  const latestStatus = statusUpdates && statusUpdates.length > 0 ? statusUpdates[0] : null

  useEffect(() => {
    sections.forEach(({ key }) => autoResize(textareaRefs.current[key]))
  }, [values])

  async function saveSection(key) {
    if (values[key] === doc[key]) return

    const { data, error } = await supabase
      .from(table)
      .update({ [key]: values[key], updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onUpdate(data)
  }

  async function requestNewVersion(fromStatus) {
    setRegenerating(fromStatus ? 'status' : 'regenerate')
    setError(null)

    const { data: generated, error: genError } = await supabase.functions.invoke('comms-plan', {
      body: {
        action: 'generate',
        variant,
        project,
        charter,
        brief,
        riskLog,
        answers: doc.qa_answers || [],
        latestStatus: fromStatus || null,
      },
    })

    setRegenerating(null)

    if (genError || generated?.error) {
      setError(genError?.message || generated.error)
      return
    }

    setProposedVersion({ content: generated, fromStatus: !!fromStatus })
  }

  function discardProposedVersion() {
    setProposedVersion(null)
  }

  async function acceptProposedVersion() {
    if (!proposedVersion) return
    setError(null)

    // Snapshot the version being superseded before overwriting it, dated by
    // when it actually became current (not "now").
    const { error: snapshotError } = await supabase.from('document_versions').insert({
      project_id: project.id,
      doc_type: docTypeKey,
      content: {
        ...Object.fromEntries(sections.map((s) => [s.key, doc[s.key] || ''])),
        qa_answers: doc.qa_answers || [],
      },
      created_at: doc.updated_at,
    })

    if (snapshotError) {
      setError(snapshotError.message)
      return
    }

    const { data, error } = await supabase
      .from(table)
      .update({ ...proposedVersion.content, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setValues(Object.fromEntries(sections.map((s) => [s.key, data[s.key] || ''])))
    setRevisions({})
    setProposedVersion(null)
    setVersions(null) // stale - refetch next time History is opened
    onUpdate(data)
  }

  async function loadVersions() {
    setVersionsLoading(true)
    const { data, error } = await supabase
      .from('document_versions')
      .select('*')
      .eq('project_id', project.id)
      .eq('doc_type', docTypeKey)
      .order('created_at', { ascending: false })

    setVersionsLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setVersions(data)
  }

  function toggleHistory() {
    const opening = !historyOpen
    setHistoryOpen(opening)
    if (opening && versions == null) loadVersions()
  }

  async function handleExportPdf() {
    try {
      exportCommsPdf(project, values, variant)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
  }

  async function handleExportDocx() {
    try {
      await exportCommsDocx(project, values, variant)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
  }

  async function handleRevise(key, instruction) {
    setError(null)
    setRevisions((prev) => ({ ...prev, [key]: { loading: true, text: null } }))

    const { data, error } = await supabase.functions.invoke('comms-plan', {
      body: {
        action: 'revise',
        variant,
        project,
        sectionKey: key,
        sectionText: values[key],
        instruction,
      },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setRevisions((prev) => ({ ...prev, [key]: null }))
      return
    }

    setRevisions((prev) => ({ ...prev, [key]: { loading: false, text: data.revised } }))
  }

  async function acceptRevision(key) {
    const revisedText = revisions[key]?.text
    if (revisedText == null) return

    setValues((prev) => ({ ...prev, [key]: revisedText }))
    setRevisions((prev) => ({ ...prev, [key]: null }))

    const { data, error } = await supabase
      .from(table)
      .update({ [key]: revisedText, updated_at: new Date().toISOString() })
      .eq('id', doc.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onUpdate(data)
  }

  function discardRevision(key) {
    setRevisions((prev) => ({ ...prev, [key]: null }))
  }

  function handleFollowUpApplied(updatedRow) {
    setValues(Object.fromEntries(sections.map((s) => [s.key, updatedRow[s.key] || ''])))
    setRevisions({})
    onUpdate(updatedRow)
    setShowFollowUp(false)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">{title}</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={handleExportPdf}>
            Export PDF
          </button>
          <button type="button" className="btn-secondary" onClick={handleExportDocx}>
            Export Word
          </button>
          {canEdit && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowFollowUp(true)}
              >
                Ask Follow-up Questions
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!!regenerating}
                onClick={() => requestNewVersion(null)}
              >
                {regenerating === 'regenerate' ? 'Regenerating...' : 'Regenerate'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={!!regenerating || !latestStatus}
                title={!latestStatus ? 'Log a Status Update first' : undefined}
                onClick={() => requestNewVersion(latestStatus)}
              >
                {regenerating === 'status'
                  ? 'Drafting...'
                  : `Update ${variant === 'exec' ? 'Exec Comms' : 'Newsletter'} from Latest Status`}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {proposedVersion && (
        <div className="revision-preview version-proposal-preview">
          <p className="revision-label">
            Proposed new version{proposedVersion.fromStatus ? ' (from latest Status Update)' : ''} &mdash; review before it replaces the current version
          </p>
          {sections.map(({ key, label }) => (
            <div className="charter-doc-section" key={key}>
              <h4 className="charter-doc-heading">{label}</h4>
              <p className="revision-text">{proposedVersion.content[key] || String.fromCharCode(8212)}</p>
            </div>
          ))}
          <div className="revision-actions">
            <button type="button" className="btn-secondary" onClick={discardProposedVersion}>
              Discard
            </button>
            <button type="button" className="btn-primary" onClick={acceptProposedVersion}>
              Accept as New Version
            </button>
          </div>
        </div>
      )}

      <div className="charter-page">
        <h2 className="charter-page-title">{project.name}</h2>
        <p className="charter-page-subtitle">{pageSubtitle}</p>

        {sections.map(({ key, label }) => (
          <div className="charter-doc-section" key={key}>
            <div className="charter-doc-heading-row">
              <h4 className="charter-doc-heading">{label}</h4>
              {canEdit && (
                <div className="section-actions">
                  {REVISE_ACTIONS.map(({ instruction, label: actionLabel }) => (
                    <button
                      type="button"
                      key={instruction}
                      disabled={revisions[key]?.loading}
                      onClick={() => handleRevise(key, instruction)}
                    >
                      {actionLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <textarea
              ref={(el) => (textareaRefs.current[key] = el)}
              className="charter-doc-body"
              value={values[key]}
              readOnly={!canEdit}
              onChange={(e) => {
                setValues((prev) => ({ ...prev, [key]: e.target.value }))
                autoResize(e.target)
              }}
              onBlur={() => saveSection(key)}
              rows={1}
            />

            {revisions[key]?.loading && (
              <p className="revision-status">Revising...</p>
            )}

            {revisions[key]?.text != null && (
              <div className="revision-preview">
                <p className="revision-label">Suggested revision</p>
                <p className="revision-text">{revisions[key].text}</p>
                <div className="revision-actions">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => discardRevision(key)}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => acceptRevision(key)}
                  >
                    Accept
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="version-history">
        <button
          type="button"
          className="collapsible-toggle"
          onClick={toggleHistory}
          aria-expanded={historyOpen}
        >
          <span className={`chevron ${historyOpen ? '' : 'collapsed'}`} aria-hidden="true">
            ▾
          </span>
          History
        </button>

        {historyOpen && (
          <div className="version-history-list">
            {versionsLoading && <p className="charter-status">Loading...</p>}
            {!versionsLoading && versions && versions.length === 0 && (
              <p className="charter-status">No past versions yet.</p>
            )}
            {!versionsLoading &&
              versions &&
              versions.map((v) => (
                <div className="version-history-entry" key={v.id}>
                  <p className="version-history-date">Version from {formatDate(v.created_at)}</p>
                  {sections.map(({ key, label }) => (
                    <div className="charter-doc-section" key={key}>
                      <h4 className="charter-doc-heading">{label}</h4>
                      <p className="revision-text">{v.content?.[key] || String.fromCharCode(8212)}</p>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </div>

      {showFollowUp && (
        <CommsFollowUp
          variant={variant}
          project={project}
          doc={{ ...doc, ...values }}
          onApplied={handleFollowUpApplied}
          onClose={() => setShowFollowUp(false)}
        />
      )}
    </div>
  )
}

export default CommsView
