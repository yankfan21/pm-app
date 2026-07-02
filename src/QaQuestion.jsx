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
          <span className="qa-suggestion-tag">AI suggestion:</span>
          <span className="qa-suggestion-text">{question.suggested_answer}</span>
          <button
            type="button"
            className="qa-suggestion-link"
            onClick={() => onChange(question.suggested_answer)}
          >
            Use
          </button>
          <button
            type="button"
            className="qa-suggestion-link"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>
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
