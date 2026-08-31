import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Modal from './components/Modal'
import LoadingButton from './LoadingButton'
import QuadrantPicker, { QUADRANTS } from './components/QuadrantPicker'

// Stakeholder Registry - manual CRUD screen, follows the Tasks/Phases
// pattern (own route component, own data loading via direct supabase calls)
// rather than the DocSection/DOCUMENT_TYPES Flow/View pattern every other
// tracking-group page (Risk Log, Issues Log, Budget Tracker) uses - this
// feature has no AI Q&A intake and no generate-once-then-view lifecycle, so
// it isn't a DOCUMENT_TYPES entry (ProjectDetailLayout.jsx's loadDocs()
// never touches it, same as tasks/milestones/phases don't).
//
// One stakeholder_registries row per project (parent), real stakeholders
// rows (child) - see stakeholder_registry_schema.sql. The parent row is
// auto-created on first visit by an editor, same lazy-create shape a PM
// never has to think about; a viewer who arrives before that's happened
// just sees an empty state.

function emptyForm() {
  return { name: '', role_title: '', org: '', contact_info: '', quadrant: '' }
}

function quadrantLabel(key) {
  return QUADRANTS.find((q) => q.key === key)?.label || key
}

function quadrantBadgeClass(key) {
  return QUADRANTS.find((q) => q.key === key)?.badgeClass || ''
}

function StakeholderRegistryRoute() {
  const { project, canEdit, setError, docs, docsLoading } = useOutletContext()

  const [registry, setRegistry] = useState(null)
  const [stakeholders, setStakeholders] = useState([])
  const [loading, setLoading] = useState(true)

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)

  const [suggestions, setSuggestions] = useState(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestNotice, setSuggestNotice] = useState(null)
  const autoFiredRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)

      let { data: reg, error: regError } = await supabase
        .from('stakeholder_registries')
        .select('*')
        .eq('project_id', project.id)
        .maybeSingle()

      if (cancelled) return
      if (regError) {
        setError(regError.message)
        setLoading(false)
        return
      }

      // Lazy-create: only an editor can insert (RLS), so a viewer who
      // arrives before any editor has visited this page just sees the
      // empty state below rather than an insert failing silently.
      if (!reg && canEdit) {
        const { data: created, error: createError } = await supabase
          .from('stakeholder_registries')
          .insert({ project_id: project.id })
          .select()
          .single()

        if (cancelled) return
        if (createError) {
          setError(createError.message)
          setLoading(false)
          return
        }
        reg = created
      }

      setRegistry(reg)

      if (reg) {
        const { data: rows, error: rowsError } = await supabase
          .from('stakeholders')
          .select('*')
          .eq('registry_id', reg.id)
          .order('created_at', { ascending: true })

        if (cancelled) return
        if (rowsError) {
          setError(rowsError.message)
          setLoading(false)
          return
        }
        setStakeholders(rows || [])
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [project.id, canEdit, setError])

  // AI suggestions - parses the Charter's free-text Stakeholders section and
  // proposes individual stakeholders for the PM to accept or dismiss. Same
  // suggest/accept/dismiss shape as RiskLogView.jsx's "Suggest Additional
  // Risks": suggestions is null until a run has happened at least once,
  // each proposed row gets a client-only crypto.randomUUID() id so
  // dismiss/accept can address it before (accept) or without (dismiss) ever
  // touching the database.
  async function handleSuggest() {
    setSuggestNotice(null)

    const charterStakeholdersText = (docs.charter?.stakeholders || '').trim()
    if (!charterStakeholdersText) {
      // Client-side guard rather than relying on the edge function's own
      // {"stakeholders": []} early-exit for empty input - that response is
      // indistinguishable from "the Charter has stakeholders but Claude
      // found nothing new to propose", which would render the wrong message
      // here. Catching it client-side skips the network round trip entirely
      // and shows the PM the actual reason nothing happened.
      setSuggestNotice('Add a Stakeholders section to the Charter first.')
      return
    }

    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('stakeholder-registry', {
      body: { action: 'suggest', project, charter: docs.charter, stakeholders },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setSuggestions((data.stakeholders || []).map((s) => ({ ...s, id: crypto.randomUUID() })))
  }

  async function acceptSuggestion(suggestion) {
    setError(null)
    const { id: _id, ...rest } = suggestion
    const { data, error } = await supabase
      .from('stakeholders')
      .insert({ registry_id: registry.id, source: 'assistant', ...rest })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    setStakeholders((prev) => [...prev, data])
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
  }

  function dismissSuggestion(id) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  // Auto-first-open trigger: fires handleSuggest() once, automatically, the
  // first time an editor opens an empty registry that already has Charter
  // Stakeholders text to work from. Gated on canEdit since the completion
  // write below (suggestions_run_at) needs editor RLS anyway, same as the
  // registry's own lazy-create above. autoFiredRef guards against a second
  // fire from this effect re-running (e.g. stakeholders.length changing)
  // while the first run is still in flight, before registry.suggestions_run_at
  // has come back from the DB to naturally close the gate itself.
  useEffect(() => {
    if (!canEdit || loading || docsLoading || !registry) return
    if (registry.suggestions_run_at) return
    if (stakeholders.length > 0) return
    if (!(docs.charter?.stakeholders || '').trim()) return
    if (autoFiredRef.current) return
    autoFiredRef.current = true

    async function autoFire() {
      await handleSuggest()

      // Marked regardless of whether that call produced suggestions or
      // failed outright - this column tracks "auto-fire has happened", not
      // "auto-fire succeeded", so it never re-fires on a later visit even if
      // the PM dismisses/rejects everything and the registry is back to zero
      // stakeholders. Manual "Re-run Suggestions" clicks never touch this
      // column (see add_stakeholder_suggestions_tracking.sql).
      const { data } = await supabase
        .from('stakeholder_registries')
        .update({ suggestions_run_at: new Date().toISOString() })
        .eq('id', registry.id)
        .select()
        .single()

      if (data) setRegistry(data)
    }

    autoFire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, loading, docsLoading, registry, stakeholders.length, docs.charter])

  function openAddForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEditForm(s) {
    setEditingId(s.id)
    setForm({
      name: s.name || '',
      role_title: s.role_title || '',
      org: s.org || '',
      contact_info: s.contact_info || '',
      quadrant: s.quadrant || '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmedName = form.name.trim()
    if (!trimmedName) {
      setFormError('Name is required.')
      return
    }
    if (!form.quadrant) {
      setFormError('Pick a quadrant.')
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      name: trimmedName,
      role_title: form.role_title.trim() || null,
      org: form.org.trim() || null,
      contact_info: form.contact_info.trim() || null,
      quadrant: form.quadrant,
    }

    if (editingId) {
      const { data, error } = await supabase
        .from('stakeholders')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()

      setSaving(false)
      if (error) {
        setFormError(error.message)
        return
      }
      setStakeholders((prev) => prev.map((s) => (s.id === editingId ? data : s)))
    } else {
      const { data, error } = await supabase
        .from('stakeholders')
        .insert({ registry_id: registry.id, source: 'manual', ...payload })
        .select()
        .single()

      setSaving(false)
      if (error) {
        setFormError(error.message)
        return
      }
      setStakeholders((prev) => [...prev, data])
    }

    closeForm()
  }

  async function deleteStakeholder(id) {
    setError(null)
    const { error } = await supabase.from('stakeholders').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setStakeholders((prev) => prev.filter((s) => s.id !== id))
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Stakeholder Registry</span>
        <span className={`doc-status-badge ${stakeholders.length > 0 ? 'done' : 'pending'}`}>
          {stakeholders.length > 0
            ? `${stakeholders.length} Stakeholder${stakeholders.length === 1 ? '' : 's'}`
            : 'Not started'}
        </span>
      </h2>

      {loading ? (
        <p className="charter-status">Loading...</p>
      ) : (
        <>
          {canEdit && (
            <div className="doc-page-actions">
              <button type="button" className="btn-primary" onClick={openAddForm}>
                + Add Stakeholder
              </button>
              <LoadingButton
                className="btn-secondary"
                loading={suggestLoading}
                loadingLabel="Thinking..."
                onClick={handleSuggest}
              >
                Re-run Suggestions
              </LoadingButton>
            </div>
          )}

          {suggestNotice && <p className="charter-status">{suggestNotice}</p>}

          {!registry && !canEdit && <p className="charter-status">Nothing logged yet.</p>}

          {registry && (
            <div className="risk-table-wrap">
              <table className="risk-log-table stakeholder-registry-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Org</th>
                    <th>Contact</th>
                    <th>Quadrant</th>
                    {canEdit && <th aria-hidden="true"></th>}
                  </tr>
                </thead>
                <tbody>
                  {stakeholders.map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.role_title || '—'}</td>
                      <td>{s.org || '—'}</td>
                      <td>{s.contact_info || '—'}</td>
                      <td>
                        <span className={`priority-badge ${quadrantBadgeClass(s.quadrant)}`}>
                          {quadrantLabel(s.quadrant)}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="stakeholder-row-actions">
                          <button type="button" className="btn-secondary" onClick={() => openEditForm(s)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="risk-delete-btn"
                            aria-label="Delete stakeholder"
                            onClick={() => deleteStakeholder(s.id)}
                          >
                            &times;
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {stakeholders.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 6 : 5} className="empty">
                        No stakeholders yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {suggestions != null && canEdit && (
            <div className="risk-suggestions">
              {suggestions.length === 0 ? (
                <p className="charter-status">
                  No additional stakeholders identified beyond what's already logged.
                </p>
              ) : (
                <>
                  <p className="risk-suggestions-label">
                    Suggestions &mdash; not required, review and accept or dismiss each
                  </p>
                  {suggestions.map((s) => (
                    <div className="risk-suggestion-card" key={s.id}>
                      <div className="risk-suggestion-body">
                        <p className="risk-suggestion-title">{s.name}</p>
                        <p className="risk-suggestion-meta">
                          {[s.role_title, s.org].filter(Boolean).join(' · ') || 'No role/org given'}
                          {' · '}
                          <span className={`priority-badge ${quadrantBadgeClass(s.quadrant)}`}>
                            {quadrantLabel(s.quadrant)}
                          </span>
                        </p>
                        {s.contact_info && <p className="risk-suggestion-mitigation">{s.contact_info}</p>}
                      </div>
                      <div className="risk-suggestion-actions">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => dismissSuggestion(s.id)}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => acceptSuggestion(s)}
                        >
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}

      {formOpen && (
        <Modal onClose={closeForm}>
          <h3 className="modal-doc-title">{editingId ? 'Edit Stakeholder' : 'Add Stakeholder'}</h3>
          <form onSubmit={handleSubmit} className="stakeholder-form">
            <label className="stakeholder-form-field">
              Name
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
            </label>
            <label className="stakeholder-form-field">
              Role
              <input
                type="text"
                value={form.role_title}
                onChange={(e) => setForm((prev) => ({ ...prev, role_title: e.target.value }))}
              />
            </label>
            <label className="stakeholder-form-field">
              Org
              <input
                type="text"
                value={form.org}
                onChange={(e) => setForm((prev) => ({ ...prev, org: e.target.value }))}
              />
            </label>
            <label className="stakeholder-form-field">
              Contact
              <input
                type="text"
                value={form.contact_info}
                onChange={(e) => setForm((prev) => ({ ...prev, contact_info: e.target.value }))}
              />
            </label>

            <QuadrantPicker
              value={form.quadrant}
              onChange={(quadrant) => setForm((prev) => ({ ...prev, quadrant }))}
            />

            {formError && <p className="error">{formError}</p>}

            <div className="stakeholder-form-actions">
              <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Stakeholder'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default StakeholderRegistryRoute
