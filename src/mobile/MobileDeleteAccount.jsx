import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../supabaseClient'

const CONFIRM_WORD = 'DELETE'
const SUPPORT_EMAIL = 'contact@confidantpm.com'

// Mobile-native Danger Zone / delete-account flow (/m/settings), purpose-
// built for phone mode - not a reuse of src/DeleteAccountFlow.jsx, same
// convention as MobileSettings.jsx not reusing Settings.jsx. No existing
// mobile screen had a confirmation modal/overlay to match (checked
// MobileTaskDetail's comment delete - it has no confirmation step at all),
// so the overlay markup/CSS here (.mobile-modal-*) is new, sized for phone
// width rather than adapted from the desktop Modal component.

async function describeFunctionError(error, data) {
  if (data?.error) return { message: data.error, body: data }
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      return { message: body.error || error.message, body }
    } catch {
      return { message: error.message, body: null }
    }
  }
  return { message: error?.message || 'Something went wrong.', body: null }
}

function MobileDeleteAccount() {
  const navigate = useNavigate()
  // idle | loading-preview | preview-error | pick-successors | confirm | executing | execute-error
  const [step, setStep] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [successors, setSuccessors] = useState({})
  const [confirmText, setConfirmText] = useState('')
  const [previewError, setPreviewError] = useState(null)
  const [executeError, setExecuteError] = useState(null)

  function reset() {
    setStep('idle')
    setPreview(null)
    setSuccessors({})
    setConfirmText('')
    setPreviewError(null)
    setExecuteError(null)
  }

  async function startFlow() {
    setStep('loading-preview')
    setPreviewError(null)

    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { action: 'preview' },
    })

    if (error || data?.error) {
      const { message } = await describeFunctionError(error, data)
      setPreviewError(message)
      setStep('preview-error')
      return
    }

    setPreview(data)
    setStep(data.needs_successor.length > 0 ? 'pick-successors' : 'confirm')
  }

  function selectSuccessor(projectId, collaboratorId) {
    setSuccessors((prev) => ({ ...prev, [projectId]: collaboratorId }))
  }

  const allSuccessorsPicked =
    !preview || preview.needs_successor.every((p) => !!successors[p.id])

  async function handleExecute() {
    setStep('executing')

    const transfers = Object.entries(successors).map(([project_id, new_owner_id]) => ({
      project_id,
      new_owner_id,
    }))

    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: { action: 'execute', transfers },
    })

    if (error || data?.error) {
      const { message, body } = await describeFunctionError(error, data)
      setExecuteError({ message, partialResult: body?.partial_result || null })
      setStep('execute-error')
      return
    }

    await supabase.auth.signOut()
    navigate('/account-deleted', { replace: true })
  }

  return (
    <>
      <h2 className="mobile-section-title">Danger Zone</h2>
      <div className="mobile-danger-zone">
        <p className="mobile-screen-stub">
          Permanently delete your account. Projects only you own are deleted; projects you share
          with others are handed to a collaborator you pick first. This cannot be undone.
        </p>
        <button type="button" className="mobile-btn-danger-filled" onClick={startFlow}>
          Delete Account
        </button>
      </div>

      {step !== 'idle' && (
        <div className="mobile-modal-overlay">
          <div className="mobile-modal" role="dialog" aria-modal="true">
            {step === 'loading-preview' && (
              <p className="mobile-screen-stub">Checking your projects...</p>
            )}

            {step === 'preview-error' && (
              <>
                <h2 className="mobile-section-title">Couldn&rsquo;t start account deletion</h2>
                <p className="mobile-error">{previewError}</p>
                <button type="button" className="mobile-btn-secondary" onClick={reset}>
                  Close
                </button>
              </>
            )}

            {step === 'pick-successors' && preview && (
              <>
                <h2 className="mobile-section-title">Choose a new owner for each shared project</h2>
                <p className="mobile-screen-stub">
                  These projects have other collaborators - pick who takes over ownership before
                  your account can be deleted.
                </p>
                <div className="mobile-doc-card-list">
                  {preview.needs_successor.map((project) => (
                    <div className="mobile-doc-risk-card" key={project.id}>
                      <div className="mobile-select-field">
                        <label>{project.name}</label>
                        <select
                          value={successors[project.id] || ''}
                          onChange={(e) => selectSuccessor(project.id, e.target.value)}
                        >
                          <option value="" disabled>
                            Select new owner...
                          </option>
                          {project.collaborators.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.email}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                {preview.will_be_deleted.length > 0 && (
                  <p className="mobile-screen-stub">
                    {preview.will_be_deleted.length} other project(s) with no other collaborators
                    will also be deleted along with your account.
                  </p>
                )}
                <button
                  type="button"
                  className="mobile-btn-danger-filled"
                  disabled={!allSuccessorsPicked}
                  onClick={() => setStep('confirm')}
                >
                  Continue
                </button>
              </>
            )}

            {step === 'confirm' && preview && (
              <>
                <h2 className="mobile-section-title">This will permanently delete your account</h2>

                {preview.needs_successor.length > 0 && (
                  <>
                    <p className="mobile-screen-stub">Ownership transfers:</p>
                    <div className="mobile-doc-card-list">
                      {preview.needs_successor.map((project) => {
                        const successor = project.collaborators.find(
                          (c) => c.id === successors[project.id],
                        )
                        return (
                          <div className="mobile-doc-risk-card" key={project.id}>
                            {project.name} &rarr; {successor?.email}
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <p className="mobile-screen-stub">
                  {preview.will_be_deleted.length > 0
                    ? `This will permanently delete your account and ${preview.will_be_deleted.length} project(s):`
                    : 'This will permanently delete your account. You have no projects that will be deleted.'}
                </p>
                {preview.will_be_deleted.length > 0 && (
                  <div className="mobile-doc-card-list">
                    {preview.will_be_deleted.map((project) => (
                      <div className="mobile-doc-risk-card" key={project.id}>
                        {project.name}
                      </div>
                    ))}
                  </div>
                )}

                <div className="mobile-select-field">
                  <label>Type DELETE to confirm</label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoFocus
                  />
                </div>

                <button
                  type="button"
                  className="mobile-btn-danger-filled"
                  disabled={confirmText !== CONFIRM_WORD}
                  onClick={handleExecute}
                >
                  Delete My Account
                </button>
                <button type="button" className="mobile-btn-secondary" onClick={reset}>
                  Cancel
                </button>
              </>
            )}

            {step === 'executing' && (
              <p className="mobile-screen-stub">
                Deleting your account - this can take a few seconds (removing files, projects, and
                your account)...
              </p>
            )}

            {step === 'execute-error' && executeError && (
              <>
                <h2 className="mobile-section-title">Account deletion did not finish</h2>
                <p className="mobile-error">{executeError.message}</p>

                {executeError.partialResult && (
                  <div className="mobile-doc-card-list">
                    <div className="mobile-doc-risk-card">
                      Ownership transfers applied:{' '}
                      {executeError.partialResult.transfers_applied?.length ?? 0}
                    </div>
                    <div className="mobile-doc-risk-card">
                      Projects deleted: {executeError.partialResult.projects_deleted?.length ?? 0}
                    </div>
                    <div className="mobile-doc-risk-card">
                      Account deleted: {executeError.partialResult.user_deleted ? 'Yes' : 'No'}
                    </div>
                  </div>
                )}

                <p className="mobile-screen-stub">
                  Please contact{' '}
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for help finishing this -
                  don&rsquo;t try this again on your own, to avoid double-deleting anything.
                </p>
                <button type="button" className="mobile-btn-secondary" onClick={reset}>
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default MobileDeleteAccount
