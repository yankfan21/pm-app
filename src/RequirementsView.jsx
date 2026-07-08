import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportRequirementsBriefDocx, exportRequirementsBriefPdf } from './requirementsExport'
import RequirementsFollowUp from './RequirementsFollowUp'

const SECTIONS = [
  { key: 'problem_statement', label: 'Problem Statement' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'scope_in', label: 'Scope (In)' },
  { key: 'scope_out', label: 'Scope (Out)' },
  { key: 'functional_requirements', label: 'Functional Requirements' },
  { key: 'constraints', label: 'Constraints' },
  { key: 'assumptions', label: 'Assumptions' },
]

const REVISE_ACTIONS = [
  { instruction: 'shorter', label: 'Make shorter' },
  { instruction: 'detail', label: 'Add detail' },
  { instruction: 'rephrase', label: 'Rephrase' },
]

function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function RequirementsView({ project, charter, brief, canEdit, onUpdate }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, brief[s.key] || '']))
  )
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(null)
  const [revisions, setRevisions] = useState({})
  const [showFollowUp, setShowFollowUp] = useState(false)
  const textareaRefs = useRef({})

  useEffect(() => {
    SECTIONS.forEach(({ key }) => autoResize(textareaRefs.current[key]))
  }, [values])

  async function saveSection(key) {
    if (values[key] === brief[key]) return

    const { data, error } = await supabase
      .from('requirements_briefs')
      .update({ [key]: values[key], updated_at: new Date().toISOString() })
      .eq('id', brief.id)
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    onUpdate(data)
  }

  async function handleRegenerate() {
    const confirmed = window.confirm(
      'Regenerating will overwrite the current brief content with a new AI draft. Continue?'
    )
    if (!confirmed) return

    setRegenerating(true)
    setError(null)

    const { data: generated, error: genError } = await supabase.functions.invoke(
      'requirements',
      {
        body: {
          action: 'generate',
          project,
          charter,
          answers: brief.qa_answers || [],
        },
      }
    )

    if (genError || generated?.error) {
      setError(genError?.message || generated.error)
      setRegenerating(false)
      return
    }

    const { data, error } = await supabase
      .from('requirements_briefs')
      .update({ ...generated, updated_at: new Date().toISOString() })
      .eq('id', brief.id)
      .select()
      .single()

    setRegenerating(false)

    if (error) {
      setError(error.message)
      return
    }

    setValues(Object.fromEntries(SECTIONS.map((s) => [s.key, data[s.key] || ''])))
    setRevisions({})
    onUpdate(data)
  }

  async function handleExportPdf() {
    try {
      exportRequirementsBriefPdf(project, values)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
  }

  async function handleExportDocx() {
    try {
      await exportRequirementsBriefDocx(project, values)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
  }

  async function handleRevise(key, instruction) {
    setError(null)
    setRevisions((prev) => ({ ...prev, [key]: { loading: true, text: null } }))

    const { data, error } = await supabase.functions.invoke('requirements', {
      body: {
        action: 'revise',
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
      .from('requirements_briefs')
      .update({ [key]: revisedText, updated_at: new Date().toISOString() })
      .eq('id', brief.id)
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
    setValues(Object.fromEntries(SECTIONS.map((s) => [s.key, updatedRow[s.key] || ''])))
    setRevisions({})
    onUpdate(updatedRow)
    setShowFollowUp(false)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Requirements Brief</h3>
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
                disabled={regenerating}
                onClick={handleRegenerate}
              >
                {regenerating ? 'Regenerating...' : 'Regenerate'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="charter-page">
        <h2 className="charter-page-title">{project.name}</h2>
        <p className="charter-page-subtitle">Requirements / Discovery Brief</p>

        {SECTIONS.map(({ key, label }) => (
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

      {showFollowUp && (
        <RequirementsFollowUp
          project={project}
          brief={{ ...brief, ...values }}
          onApplied={handleFollowUpApplied}
          onClose={() => setShowFollowUp(false)}
        />
      )}
    </div>
  )
}

export default RequirementsView
