import { useEffect, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Modal from './components/Modal'
import LoadingButton from './LoadingButton'

// Communication Plan - manual CRUD screen, follows StakeholderRegistryRoute.jsx's
// pattern exactly (own route component, own data loading via direct supabase
// calls) rather than the DocSection/DOCUMENT_TYPES Flow/View pattern its
// Communications siblings (Exec Comms, Newsletter, Status Update) use - this
// feature has no AI Q&A intake and no generate-once-then-view lifecycle, so
// it isn't a DOCUMENT_TYPES entry (ProjectDetailLayout.jsx's loadDocs()
// never touches it, same as stakeholder-registry/tasks/milestones/phases
// don't).
//
// One communication_plans row per project (parent), real comm_plan_items
// rows (child) - see supabase/migrations/comm_plan_schema.sql. The parent
// row is auto-created on first visit by an editor, same lazy-create shape
// stakeholder_registries uses; a viewer who arrives before that's happened
// just sees an empty state.
//
// Audience is a many-to-many against the project's existing `stakeholders`
// rows (via the comm_plan_audience junction table) - Communication Plan
// depends on Stakeholder Registry, so an empty registry means an empty
// Audience picker until the PM populates it there first.

const TYPE_OPTIONS = [
  'Status Update',
  'Milestone/Deliverable Report',
  'Risk/Issue Escalation',
  'Budget Review',
  'Decision Request',
  'Stakeholder Check-in',
  'Kickoff/Onboarding',
  'Project Close-out',
]
const FORMAT_OPTIONS = ['Email', 'Meeting', 'Status Report']
const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Biweekly', 'Monthly', 'Ad hoc']

function emptyForm() {
  return { type: '', purpose: '', owner: '', format: '', frequency: '', audienceIds: [] }
}

function CommunicationPlanRoute() {
  const { project, canEdit, setError, docs, docsLoading } = useOutletContext()

  const [plan, setPlan] = useState(null)
  const [items, setItems] = useState([])
  const [audienceByItem, setAudienceByItem] = useState({})
  const [registryStakeholders, setRegistryStakeholders] = useState([])
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

      let { data: pl, error: planError } = await supabase
        .from('communication_plans')
        .select('*')
        .eq('project_id', project.id)
        .maybeSingle()

      if (cancelled) return
      if (planError) {
        setError(planError.message)
        setLoading(false)
        return
      }

      // Lazy-create: only an editor can insert (RLS), so a viewer who
      // arrives before any editor has visited this page just sees the
      // empty state below rather than an insert failing silently.
      if (!pl && canEdit) {
        const { data: created, error: createError } = await supabase
          .from('communication_plans')
          .insert({ project_id: project.id })
          .select()
          .single()

        if (cancelled) return
        if (createError) {
          setError(createError.message)
          setLoading(false)
          return
        }
        pl = created
      }

      setPlan(pl)

      const { data: stakeholderRows, error: stakeholderError } = await supabase
        .from('stakeholders')
        .select('id, name, role_title, org')
        .eq('project_id', project.id)
        .order('name', { ascending: true })

      if (cancelled) return
      if (stakeholderError) {
        setError(stakeholderError.message)
        setLoading(false)
        return
      }
      setRegistryStakeholders(stakeholderRows || [])

      if (pl) {
        const { data: rows, error: rowsError } = await supabase
          .from('comm_plan_items')
          .select('*')
          .eq('plan_id', pl.id)
          .order('created_at', { ascending: true })

        if (cancelled) return
        if (rowsError) {
          setError(rowsError.message)
          setLoading(false)
          return
        }
        setItems(rows || [])

        if ((rows || []).length > 0) {
          const { data: audienceRows, error: audienceError } = await supabase
            .from('comm_plan_audience')
            .select('item_id, stakeholder_id')
            .in('item_id', rows.map((r) => r.id))

          if (cancelled) return
          if (audienceError) {
            setError(audienceError.message)
            setLoading(false)
            return
          }

          const grouped = {}
          for (const row of audienceRows || []) {
            if (!grouped[row.item_id]) grouped[row.item_id] = []
            grouped[row.item_id].push(row.stakeholder_id)
          }
          setAudienceByItem(grouped)
        }
      }

      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [project.id, canEdit, setError])

  function stakeholderName(id) {
    return registryStakeholders.find((s) => s.id === id)?.name || 'Unknown'
  }

  // AI suggestions - proposes comm plan items from Charter + Stakeholder
  // Registry context. Same suggest/accept/dismiss shape as
  // StakeholderRegistryRoute.jsx: suggestions is null until a run has
  // happened at least once, each proposed row gets a client-only
  // crypto.randomUUID() id so dismiss/accept can address it before (accept)
  // or without (dismiss) ever touching the database. Proposed "audience"
  // names are resolved against registryStakeholders client-side after the
  // response comes back, since the Edge Function only knows names, not ids.
  async function handleSuggest() {
    setSuggestNotice(null)

    const hasContext = (docs.charter?.purpose || docs.charter?.scope || '').trim() || registryStakeholders.length > 0
    if (!hasContext) {
      // Client-side guard rather than relying on the edge function's own
      // {"items": []} early-exit - that response is indistinguishable from
      // "there's context but Claude found nothing new to propose", which
      // would render the wrong message here.
      setSuggestNotice('Add a Charter and/or Stakeholder Registry entries first.')
      return
    }

    setSuggestLoading(true)
    setError(null)

    const { data, error } = await supabase.functions.invoke('comm-plan', {
      body: {
        action: 'suggest',
        project,
        charter: docs.charter,
        stakeholders: registryStakeholders,
        items,
      },
    })

    setSuggestLoading(false)

    if (error || data?.error) {
      setError(error?.message || data.error)
      return
    }

    setSuggestions(
      (data.items || []).map((it) => ({
        ...it,
        id: crypto.randomUUID(),
        audienceIds: (it.audience || [])
          .map((name) => registryStakeholders.find((s) => s.name === name)?.id)
          .filter(Boolean),
      }))
    )
  }

  async function acceptSuggestion(suggestion) {
    setError(null)
    const { id: _id, audience: _audience, audienceIds, ...rest } = suggestion
    const { data, error } = await supabase
      .from('comm_plan_items')
      .insert({ plan_id: plan.id, source: 'assistant', ...rest })
      .select()
      .single()

    if (error) {
      setError(error.message)
      return
    }

    if (audienceIds.length > 0) {
      const { error: audienceError } = await supabase
        .from('comm_plan_audience')
        .insert(audienceIds.map((stakeholder_id) => ({ item_id: data.id, stakeholder_id })))

      if (audienceError) {
        setError(audienceError.message)
      } else {
        setAudienceByItem((prev) => ({ ...prev, [data.id]: audienceIds }))
      }
    }

    setItems((prev) => [...prev, data])
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id))
  }

  function dismissSuggestion(id) {
    setSuggestions((prev) => prev.filter((s) => s.id !== id))
  }

  // Auto-first-open trigger: fires handleSuggest() once, automatically, the
  // first time an editor opens an empty plan that already has Charter or
  // Stakeholder Registry context to work from. Gated on canEdit since the
  // completion write below (suggestions_run_at) needs editor RLS anyway,
  // same as the plan's own lazy-create above.
  useEffect(() => {
    if (!canEdit || loading || docsLoading || !plan) return
    if (plan.suggestions_run_at) return
    if (items.length > 0) return
    const hasContext = (docs.charter?.purpose || docs.charter?.scope || '').trim() || registryStakeholders.length > 0
    if (!hasContext) return
    if (autoFiredRef.current) return
    autoFiredRef.current = true

    async function autoFire() {
      await handleSuggest()

      // Marked regardless of whether that call produced suggestions or
      // failed outright - this column tracks "auto-fire has happened", not
      // "auto-fire succeeded", so it never re-fires on a later visit even if
      // the PM dismisses/rejects everything and the plan is back to zero
      // items. Manual "Re-run Suggestions" clicks never touch this column
      // (see StakeholderRegistryRoute.jsx's identical suggestions_run_at
      // convention).
      const { data } = await supabase
        .from('communication_plans')
        .update({ suggestions_run_at: new Date().toISOString() })
        .eq('id', plan.id)
        .select()
        .single()

      if (data) setPlan(data)
    }

    autoFire()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, loading, docsLoading, plan, items.length, registryStakeholders, docs.charter])

  function openAddForm() {
    setEditingId(null)
    setForm(emptyForm())
    setFormError(null)
    setFormOpen(true)
  }

  function openEditForm(item) {
    setEditingId(item.id)
    setForm({
      type: item.type || '',
      purpose: item.purpose || '',
      owner: item.owner || '',
      format: item.format || '',
      frequency: item.frequency || '',
      audienceIds: audienceByItem[item.id] || [],
    })
    setFormError(null)
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setEditingId(null)
  }

  function toggleAudience(id) {
    setForm((prev) => ({
      ...prev,
      audienceIds: prev.audienceIds.includes(id)
        ? prev.audienceIds.filter((existingId) => existingId !== id)
        : [...prev.audienceIds, id],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.type) {
      setFormError('Pick a type.')
      return
    }
    if (!form.format) {
      setFormError('Pick a format.')
      return
    }
    if (!form.frequency) {
      setFormError('Pick a frequency.')
      return
    }

    setSaving(true)
    setFormError(null)

    const payload = {
      type: form.type,
      purpose: form.purpose.trim() || null,
      owner: form.owner.trim() || null,
      format: form.format,
      frequency: form.frequency,
    }

    let itemId = editingId

    if (editingId) {
      const { data, error } = await supabase
        .from('comm_plan_items')
        .update(payload)
        .eq('id', editingId)
        .select()
        .single()

      if (error) {
        setSaving(false)
        setFormError(error.message)
        return
      }
      setItems((prev) => prev.map((i) => (i.id === editingId ? data : i)))

      // Junction rows have no update-in-place shape (see comm_plan_schema.sql
      // header note) - resync by deleting the existing set and inserting the
      // new one, same "delete then reinsert" as any other checkbox-style
      // many-to-many editor.
      await supabase.from('comm_plan_audience').delete().eq('item_id', editingId)
    } else {
      const { data, error } = await supabase
        .from('comm_plan_items')
        .insert({ plan_id: plan.id, source: 'manual', ...payload })
        .select()
        .single()

      if (error) {
        setSaving(false)
        setFormError(error.message)
        return
      }
      setItems((prev) => [...prev, data])
      itemId = data.id
    }

    if (form.audienceIds.length > 0) {
      const { error: audienceError } = await supabase
        .from('comm_plan_audience')
        .insert(form.audienceIds.map((stakeholder_id) => ({ item_id: itemId, stakeholder_id })))

      if (audienceError) {
        setSaving(false)
        setFormError(audienceError.message)
        return
      }
    }
    setAudienceByItem((prev) => ({ ...prev, [itemId]: form.audienceIds }))

    setSaving(false)
    closeForm()
  }

  async function deleteItem(id) {
    setError(null)
    const { error } = await supabase.from('comm_plan_items').delete().eq('id', id)
    if (error) {
      setError(error.message)
      return
    }
    setItems((prev) => prev.filter((i) => i.id !== id))
    setAudienceByItem((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return (
    <div className="detail-zone">
      <h2 className="tasks-heading section-heading-static">
        <span className="toggle-header-main">Communication Plan</span>
        <span className={`doc-status-badge ${items.length > 0 ? 'done' : 'pending'}`}>
          {items.length > 0 ? `${items.length} Item${items.length === 1 ? '' : 's'}` : 'Not started'}
        </span>
      </h2>

      {loading ? (
        <p className="charter-status">Loading...</p>
      ) : (
        <>
          {canEdit && (
            <div className="doc-page-actions">
              <button type="button" className="btn-primary" onClick={openAddForm}>
                + Add Item
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

          {!plan && !canEdit && <p className="charter-status">Nothing logged yet.</p>}

          {plan && (
            <div className="risk-table-wrap">
              <table className="risk-log-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Purpose</th>
                    <th>Owner</th>
                    <th>Format</th>
                    <th>Frequency</th>
                    <th>Audience</th>
                    {canEdit && <th aria-hidden="true"></th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.type}</td>
                      <td>{item.purpose || '—'}</td>
                      <td>{item.owner || '—'}</td>
                      <td>{item.format}</td>
                      <td>{item.frequency}</td>
                      <td>
                        {(audienceByItem[item.id] || []).length > 0
                          ? audienceByItem[item.id].map(stakeholderName).join(', ')
                          : '—'}
                      </td>
                      {canEdit && (
                        <td className="stakeholder-row-actions">
                          <button type="button" className="btn-secondary" onClick={() => openEditForm(item)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="risk-delete-btn"
                            aria-label="Delete communication plan item"
                            onClick={() => deleteItem(item.id)}
                          >
                            &times;
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={canEdit ? 7 : 6} className="empty">
                        No communication plan items yet
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
                  No additional communications identified beyond what's already logged.
                </p>
              ) : (
                <>
                  <p className="risk-suggestions-label">
                    Suggestions &mdash; not required, review and accept or dismiss each
                  </p>
                  {suggestions.map((s) => (
                    <div className="risk-suggestion-card" key={s.id}>
                      <div className="risk-suggestion-body">
                        <p className="risk-suggestion-title">{s.type}</p>
                        <p className="risk-suggestion-meta">
                          {s.format} · {s.frequency}
                          {s.owner ? ` · ${s.owner}` : ''}
                        </p>
                        {s.purpose && <p className="risk-suggestion-mitigation">{s.purpose}</p>}
                        {s.audienceIds.length > 0 && (
                          <p className="risk-suggestion-meta">
                            Audience: {s.audienceIds.map(stakeholderName).join(', ')}
                          </p>
                        )}
                      </div>
                      <div className="risk-suggestion-actions">
                        <button type="button" className="btn-secondary" onClick={() => dismissSuggestion(s.id)}>
                          Dismiss
                        </button>
                        <button type="button" className="btn-primary" onClick={() => acceptSuggestion(s)}>
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
          <h3 className="modal-doc-title">{editingId ? 'Edit Item' : 'Add Item'}</h3>
          <form onSubmit={handleSubmit} className="stakeholder-form">
            <label className="stakeholder-form-field">
              Type
              <select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="">Select type...</option>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="stakeholder-form-field">
              Purpose
              <input
                type="text"
                value={form.purpose}
                onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
              />
            </label>
            <label className="stakeholder-form-field">
              Owner
              <input
                type="text"
                value={form.owner}
                onChange={(e) => setForm((prev) => ({ ...prev, owner: e.target.value }))}
              />
            </label>
            <label className="stakeholder-form-field">
              Format
              <select value={form.format} onChange={(e) => setForm((prev) => ({ ...prev, format: e.target.value }))}>
                <option value="">Select format...</option>
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className="stakeholder-form-field">
              Frequency
              <select
                value={form.frequency}
                onChange={(e) => setForm((prev) => ({ ...prev, frequency: e.target.value }))}
              >
                <option value="">Select frequency...</option>
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>

            <div className="stakeholder-form-field">
              Audience
              {registryStakeholders.length === 0 ? (
                <p className="charter-status">
                  No stakeholders logged yet - add some in the Stakeholder Registry first.
                </p>
              ) : (
                <div className="comm-plan-audience-list">
                  {registryStakeholders.map((s) => (
                    <label key={s.id} className="comm-plan-audience-option">
                      <input
                        type="checkbox"
                        checked={form.audienceIds.includes(s.id)}
                        onChange={() => toggleAudience(s.id)}
                      />
                      {s.name}
                      {s.role_title ? ` (${s.role_title})` : ''}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {formError && <p className="error">{formError}</p>}

            <div className="stakeholder-form-actions">
              <button type="button" className="btn-secondary" onClick={closeForm} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default CommunicationPlanRoute
