import { useState } from 'react'
import { Link } from 'react-router-dom'
import { computeAttentionItems } from '../needsAttention'

const CAP = 3

function NeedsAttention({ projects, data, loading }) {
  const [showAll, setShowAll] = useState(false)

  if (loading || !data) return null

  const items = computeAttentionItems(projects, data)
  const shown = showAll ? items : items.slice(0, CAP)

  return (
    <section className="needs-attention" aria-labelledby="needs-attention-title">
      <h3 id="needs-attention-title" className="needs-attention-title">Needs your attention</h3>
      {items.length === 0 ? (
        <p className="needs-attention-clear">All caught up: nothing needs your attention.</p>
      ) : (
        <ul className="needs-attention-list">
          {shown.map((item) => (
            <li key={item.key}>
              <div className="needs-attention-text">
                <span className="needs-attention-project">{item.projectName}</span>
                <span>{item.text}</span>
              </div>
              <Link to={`/projects/${item.projectId}`} className="btn-secondary">Open</Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > CAP && (
        <button type="button" className="needs-attention-more" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `See all ${items.length}`}
        </button>
      )}
    </section>
  )
}

export default NeedsAttention
