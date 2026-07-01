import { useState } from 'react'
import { supabase } from './supabaseClient'

const SECTIONS = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'scope', label: 'Scope' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'success_metrics', label: 'Success Metrics' },
  { key: 'risks', label: 'Risks' },
  { key: 'timeline', label: 'Timeline' },
]

function CharterView({ project, charter, onUpdate }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.key, charter[s.key] || '']))
  )
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(null)

  async function saveSection(key) {
    if (values[key] === charter[key]) return

    const { data, error } = await supabase
      .from('charters')
      .update({ [key]: values[key], updated_at: new Date().toISOString() })
      .eq('id', charter.id)
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
      'Regenerating will overwrite the current charter content with a new AI draft. Continue?'
    )
    if (!confirmed) return

    setRegenerating(true)
    setError(null)

    const { data: generated, error: genError } = await supabase.functions.invoke(
      'charter',
      {
        body: {
          action: 'generate',
          project,
          answers: charter.qa_answers || [],
        },
      }
    )

    if (genError || generated?.error) {
      setError(genError?.message || generated.error)
      setRegenerating(false)
      return
    }

    const { data, error } = await supabase
      .from('charters')
      .update({ ...generated, updated_at: new Date().toISOString() })
      .eq('id', charter.id)
      .select()
      .single()

    setRegenerating(false)

    if (error) {
      setError(error.message)
      return
    }

    setValues(Object.fromEntries(SECTIONS.map((s) => [s.key, data[s.key] || ''])))
    onUpdate(data)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Charter</h3>
        <button
          type="button"
          className="btn-secondary"
          disabled={regenerating}
          onClick={handleRegenerate}
        >
          {regenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {SECTIONS.map(({ key, label }) => (
        <div className="charter-section" key={key}>
          <h4>{label}</h4>
          <textarea
            value={values[key]}
            onChange={(e) =>
              setValues((prev) => ({ ...prev, [key]: e.target.value }))
            }
            onBlur={() => saveSection(key)}
            rows={3}
          />
        </div>
      ))}
    </div>
  )
}

export default CharterView
