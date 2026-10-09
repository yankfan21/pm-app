import { useState } from 'react'
import { CALMSKY } from './redesign'

function QaQuestion({ question, value, onChange }) {
  const [dismissed, setDismissed] = useState(false)
  const showSuggestion =
    !!question.suggested_answer && !dismissed && value !== question.suggested_answer
  // CalmSky_Redesign: a free-text suggestion shows as ghost text inside the
  // answer field (a placeholder, so it is never submitted until accepted).
  const ghost = CALMSKY && question.type !== 'choice'

  return (
    <label>
      <span className="qa-question-text">{question.text}</span>

      {showSuggestion && !ghost && (
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
        <div className={ghost ? 'qa-field' : undefined}>
          <textarea
            className="qa-answer-input"
            rows={3}
            value={value || ''}
            placeholder={ghost && showSuggestion ? question.suggested_answer : undefined}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Tab accepts the ghost suggestion only while the field is empty;
              // otherwise Tab keeps its normal focus-moving job.
              if (ghost && showSuggestion && e.key === 'Tab' && !e.shiftKey && !value) {
                e.preventDefault()
                onChange(question.suggested_answer)
              }
            }}
          />
          {ghost && showSuggestion && (
            <span className="qa-field-hint">
              <button type="button" className="qa-suggestion-link" onClick={() => onChange(question.suggested_answer)}>
                {!value && <kbd>Tab</kbd>} Use suggestion
              </button>
              <button type="button" className="qa-suggestion-link" onClick={() => setDismissed(true)}>
                Dismiss
              </button>
            </span>
          )}
        </div>
      )}
    </label>
  )
}

export default QaQuestion
