import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import Modal from './components/Modal'

const CONFIRM_WORD = 'DELETE'
const SUPPORT_EMAIL = 'contact@confidantpm.com'

// Backs the desktop Settings page's Danger Zone. Calls the already-deployed
// delete-account Edge Function (preview, then execute) - this component owns
// only the UI/flow state, no backend logic lives here. See
// src/mobile/MobileDeleteAccount.jsx for the phone-mode equivalent - a
// separate, purpose-built component (not shared with this one), matching how
// every other desktop/mobile pair in this app is built.

// supabase-js's own `error.message` on a non-2xx function response is just
// the generic "Edge Function returned a non-2xx status code" (FunctionsHttpError)
// - the actual JSON body the function returned (the real error text, and for
// "execute", partial_result) only lives on error.context, the raw Response.
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

function DeleteAccountFlow() {
  const navigate = useNavigate()
  const location = useLocation()
  const dangerZoneRef = useRef(null)
  // idle | loading-preview | preview-error | pick-successors | confirm | executing | execute-error
  const [step, setStep] = useState('idle')
  const [preview, setPreview] = useState(null)
  const [successors, setSuccessors] = useState({})
  const [confirmText, setConfirmText] = useState('')
  const [previewError, setPreviewError] = useState(null)
  const [executeError, setExecuteError] = useState(null)

  // Same pattern as Settings.jsx's own #contact-support effect - a plain
  // #danger-zone id alone doesn't reliably scroll on load in this app: this
  // is a client-rendered SPA and Settings is a lazy-loaded route (App.jsx),
  // so the browser's native on-load hash scroll fires before this element
  // exists in the DOM. Re-checking on mount/hash-change covers both a fresh
  // load at /settings#danger-zone and an in-app Link to the same hash.
  useEffect(() => {
    if (location.hash === '#danger-zone' && dangerZoneRef.current) {
      dangerZoneRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [location.hash])

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
      <h3 className="settings-section-title settings-section-title--danger">Danger Zone</h3>
      <div className="danger-zone" id="danger-zone" ref={dangerZoneRef}>
        <p className="danger-zone-text">
          Permanently delete your account. Projects only you own are deleted; projects you share
          with others are handed to a collaborator you pick first. This cannot be undone.
        </p>
        <button type="button" className="btn-danger" onClick={startFlow}>
          Delete Account
        </button>
      </div>

      {step !== 'idle' && (
        <Modal onClose={step === 'executing' ? undefined : reset}>
          {step === 'loading-preview' && (
            <p className="charter-status">Checking your projects...</p>
          )}

          {step === 'preview-error' && (
            <>
              <h3 className="modal-doc-title">Couldn&rsquo;t start account deletion</h3>
              <p className="error">{previewError}</p>
              <button type="button" className="btn-secondary" onClick={reset}>
                Close
              </button>
            </>
          )}

          {step === 'pick-successors' && preview && (
            <>
              <h3 className="modal-doc-title">Choose a new owner for each shared project</h3>
              <p className="dashboard-subtitle">
                These projects have other collaborators - pick who takes over ownership before
                your account can be deleted.
              </p>
              <ul className="collaborator-list">
                {preview.needs_successor.map((project) => (
                  <li key={project.id} className="collaborator-row">
                    <span className="collaborator-email">{project.name}</span>
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
                  </li>
                ))}
              </ul>
              {preview.will_be_deleted.length > 0 && (
                <p className="dashboard-subtitle">
                  {preview.will_be_deleted.length} other project(s) with no other collaborators
                  will also be deleted along with your account.
                </p>
              )}
              <button
                type="button"
                className="btn-danger"
                disabled={!allSuccessorsPicked}
                onClick={() => setStep('confirm')}
              >
                Continue
              </button>
            </>
          )}

          {step === 'confirm' && preview && (
            <>
              <h3 className="modal-doc-title">This will permanently delete your account</h3>

              {preview.needs_successor.length > 0 && (
                <>
                  <p className="dashboard-subtitle">Ownership transfers:</p>
                  <ul className="collaborator-list">
                    {preview.needs_successor.map((project) => {
                      const successor = project.collaborators.find(
                        (c) => c.id === successors[project.id],
                      )
                      return (
                        <li key={project.id} className="collaborator-row">
                          <span className="collaborator-email">
                            {project.name} &rarr; {successor?.email}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}

              <p className="dashboard-subtitle">
                {preview.will_be_deleted.length > 0
                  ? `This will permanently delete your account and ${preview.will_be_deleted.length} project(s):`
                  : 'This will permanently delete your account. You have no projects that will be deleted.'}
              </p>
              {preview.will_be_deleted.length > 0 && (
                <ul className="collaborator-list">
                  {preview.will_be_deleted.map((project) => (
                    <li key={project.id} className="collaborator-row">
                      <span className="collaborator-email">{project.name}</span>
                    </li>
                  ))}
                </ul>
              )}

              <label>
                Type DELETE to confirm
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                />
              </label>

              <button
                type="button"
                className="btn-danger"
                disabled={confirmText !== CONFIRM_WORD}
                onClick={handleExecute}
              >
                Delete My Account
              </button>
            </>
          )}

          {step === 'executing' && (
            <p className="charter-status">
              Deleting your account - this can take a few seconds (removing files, projects, and
              your account)...
            </p>
          )}

          {step === 'execute-error' && executeError && (
            <>
              <h3 className="modal-doc-title">Account deletion did not finish</h3>
              <p className="error">{executeError.message}</p>

              {executeError.partialResult && (
                <div className="danger-zone">
                  <p className="danger-zone-text">Here&rsquo;s what completed before the error:</p>
                  <ul className="collaborator-list">
                    <li className="collaborator-row">
                      <span className="collaborator-email">
                        Ownership transfers applied:{' '}
                        {executeError.partialResult.transfers_applied?.length ?? 0}
                      </span>
                    </li>
                    <li className="collaborator-row">
                      <span className="collaborator-email">
                        Projects deleted: {executeError.partialResult.projects_deleted?.length ?? 0}
                      </span>
                    </li>
                    <li className="collaborator-row">
                      <span className="collaborator-email">
                        Account deleted: {executeError.partialResult.user_deleted ? 'Yes' : 'No'}
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              <p className="dashboard-subtitle">
                Please contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for help
                finishing this - don&rsquo;t try this again on your own, to avoid double-deleting
                anything.
              </p>
              <button type="button" className="btn-secondary" onClick={reset}>
                Close
              </button>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

export default DeleteAccountFlow
