import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { exportPostMortemDocx, exportPostMortemPdf } from './postMortemExport'
import PostMortemFollowUp from './PostMortemFollowUp'
import LoadingButton from './LoadingButton'

const SECTIONS = [
  { key: 'objectives_met', label: 'Objectives Met' },
  { key: 'what_went_well', label: 'What Went Well' },
  { key: 'variances', label: "What Didn't Go Well / Variances" },
  { key: 'root_causes', label: 'Root Causes' },
  { key: 'lessons_learned', label: 'Lessons Learned' },
  { key: 'recommendations', label: 'Recommendations for Future Projects' },
]

const REVISE_ACTIONS = [
  { instruction: 'shorter', label: 'Make shorter', loadingLabel: 'Making shorter...' },
  { instruction: 'detail', label: 'Add detail', loadingLabel: 'Adding detail...' },
  { instruction: 'rephrase', label: 'Rephrase', loadingLabel: 'Rephrasing...' },
]

function autoResize(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// Same view/regenerate/revise/export shape as CharterView - see that file
// for why this pattern (inline edit with autosave, per-section revise
// preview, whole-doc regenerate behind a confirm, a follow-up Q&A modal)
// is the established one. Post-Mortem doesn't get the Comms-style
// propose/accept versioning - that guardrail is specific to Exec
// Comms/Newsletter regeneration, not requested here.
function PostMortemView({ project, charter, riskLog, statusUpdates, budget, postMortem, canEdit, onUpdate }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, postMortem[s.key] || '']))
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
    if (values[key] === postMortem[key]) return

    const { data, error } = await supabase
      .from('post_mortems')
      .update({ [key]: values[key], updated_at: new Date().toISOString() })
      .eq('id', postMortem.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this post-mortem.')
      return
    }

    onUpdate(data[0])
  }

  async function handleRegenerate() {
    const confirmed = window.confirm(
      'Regenerating will overwrite the current post-mortem content with a new AI draft. Continue?'
    )
    if (!confirmed) return

    setRegenerating(true)
    setError(null)

    const { data: generated, error: genError } = await supabase.functions.invoke('post-mortem', {
      body: {
        action: 'generate',
        project,
        charter,
        riskLog,
        statusUpdates,
        budget,
        answers: postMortem.qa_answers || [],
      },
    })

    if (genError || generated?.error) {
      setError(genError?.message || generated.error)
      setRegenerating(false)
      return
    }

    const { data, error } = await supabase
      .from('post_mortems')
      .update({ ...generated, updated_at: new Date().toISOString() })
      .eq('id', postMortem.id)
      .select()

    setRegenerating(false)

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this post-mortem.')
      return
    }

    const updated = data[0]
    setValues(Object.fromEntries(SECTIONS.map((s) => [s.key, updated[s.key] || ''])))
    setRevisions({})
    onUpdate(updated)
  }

  async function handleExportPdf() {
    try {
      exportPostMortemPdf(project, values)
    } catch (err) {
      setError('Failed to export PDF: ' + err.message)
    }
  }

  async function handleExportDocx() {
    try {
      await exportPostMortemDocx(project, values)
    } catch (err) {
      setError('Failed to export Word document: ' + err.message)
    }
  }

  async function handleRevise(key, instruction) {
    setError(null)
    setRevisions((prev) => ({ ...prev, [key]: { loading: true, instruction, text: null } }))

    const { data, error } = await supabase.functions.invoke('post-mortem', {
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
      .from('post_mortems')
      .update({ [key]: revisedText, updated_at: new Date().toISOString() })
      .eq('id', postMortem.id)
      .select()

    if (error) {
      setError(error.message)
      return
    }

    if (!data || data.length === 0) {
      setError('Update failed — you may not have permission to edit this post-mortem.')
      return
    }

    onUpdate(data[0])
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
        <h3 className="charter-heading">Post-Mortem</h3>
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
              <LoadingButton
                className="btn-secondary"
                loading={regenerating}
                loadingLabel="Regenerating..."
                onClick={handleRegenerate}
              >
                Regenerate
              </LoadingButton>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="charter-page">
        <h2 className="charter-page-title">{project.name}</h2>
        <p className="charter-page-subtitle">Post-Mortem</p>

        {SECTIONS.map(({ key, label }) => (
          <div className="charter-doc-section" key={key}>
            <div className="charter-doc-heading-row">
              <h4 className="charter-doc-heading">{label}</h4>
              {canEdit && (
                <div className="section-actions">
                  {REVISE_ACTIONS.map(({ instruction, label: actionLabel, loadingLabel }) => (
                    <LoadingButton
                      key={instruction}
                      loading={revisions[key]?.loading && revisions[key]?.instruction === instruction}
                      loadingLabel={loadingLabel}
                      disabled={revisions[key]?.loading && revisions[key]?.instruction !== instruction}
                      onClick={() => handleRevise(key, instruction)}
                    >
                      {actionLabel}
                    </LoadingButton>
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
        <PostMortemFollowUp
          project={project}
          doc={{ ...postMortem, ...values }}
          onApplied={handleFollowUpApplied}
          onClose={() => setShowFollowUp(false)}
        />
      )}
    </div>
  )
}

export default PostMortemView
