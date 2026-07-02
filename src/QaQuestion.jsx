import { useState } from 'react'

function QaQuestion({ question, value, onChange }) {
  const [dismissed, setDismissed] = useState(false)
  const showSuggestion =
    !!question.suggested_answer && !dismissed && value !== question.suggested_answer

  return (
    <label>
      {question.text}

      {showSuggestion && (
        <div className="qa-suggestion">
          <p className="qa-suggestion-label">AI suggestion &mdash; not a requirement</p>
          <p className="qa-suggestion-text">{question.suggested_answer}</p>
          <div className="qa-suggestion-actions">
            <button type="button" onClick={() => setDismissed(true)}>
              Dismiss
            </button>
            <button type="button" onClick={() => onChange(question.suggested_answer)}>
              Use this
            </button>
          </div>
        </div>
      )}

      {question.type === 'choice' ? (
        <div className="priority-buttons">
          {question.choices.map((choice) => (
            <button
              type="button"
              key={choice}
              className={value === choice ? 'selected' : ''}
              onClick={() => onChange(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export default QaQuestion
