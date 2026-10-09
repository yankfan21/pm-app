import { useState } from 'react'

function QaQuestion({ question, value, onChange }) {
  const [dismissed, setDismissed] = useState(false)
  const showSuggestion =
    !!question.suggested_answer && !dismissed && value !== question.suggested_answer

  return (
    <label>
      <span className="qa-question-text">{question.text}</span>

      {showSuggestion && (
        <div className="qa-suggestion">
          <span className="qa-suggestion-tag">Suggested answer:</span>
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
        // textarea rather than a one-line input: answers are sentences, and a
        // single-line box scrolls sideways once they run past its width.
        <textarea className="qa-answer-input" rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

export default QaQuestion
