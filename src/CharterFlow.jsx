import { useState } from 'react'
import { supabase } from './supabaseClient'
import QaStepper from './QaStepper'
import Spinner from './Spinner'

const SECTIONS = [
  { key: 'purpose', label: 'Purpose' },
  { key: 'scope', label: 'Scope' },
  { key: 'stakeholders', label: 'Stakeholders' },
  { key: 'success_metrics', label: 'Success Metrics' },
  { key: 'risks', label: 'Risks' },
  { key: 'timeline', label: 'Timeline' },
]

async function extractDocumentText(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.txt')) {
    return file.text()
  }
  if (name.endsWith('.docx')) {
    // Lazy-loaded: mammoth is only needed if someone actually uploads a
    // .docx, matching how ganttExport.js lazy-loads exceljs/jspdf.
    const mammoth = await import('mammoth')
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }
  throw new Error('Unsupported file type - please upload a .txt or .docx file.')
}

// Two starting points for a Charter, converging on the same onGenerated
// callback ProjectDetail.jsx already expects - Q&A (unchanged) or an
// uploaded existing document. Either way the result lands as an editable
// preview before anything is saved, and the resulting charter row is
// identical either way (qa_answers just records what informed it), so the
// existing Ask Follow-up Questions/Regenerate/Revise flows work on it
// afterward exactly as if it had come from the Q&A path.
function CharterFlow({ project, onGenerated, onClose }) {
  const [phase, setPhase] = useState('choose-method')
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [error, setError] = useState(null)

  const [fileName, setFileName] = useState(null)
  const [docSections, setDocSections] = useState(null)
  const [savingDoc, setSavingDoc] = useState(false)

  async function loadQuestions() {
    setPhase('loading-questions')
    setError(null)

    const { data, error } = await supabase.functions.invoke('charter', {
      body: { action: 'questions', project },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('error')
      return
    }

    setQuestions(data.questions || [])
    setPhase('answering')
  }

  async function handleSubmit() {
    setPhase('generating')
    setError(null)

    const answerList = questions
      .filter((q) => (answers[q.id] || '').trim() !== '')
      .map((q) => ({
        question: q.text,
        answer: answers[q.id],
      }))

    const { data, error } = await supabase.functions.invoke('charter', {
      body: { action: 'generate', project, answers: answerList },
    })

    if (error || data?.error) {
      setError(error?.message || data.error)
      setPhase('answering')
      return
    }

    const saveError = await onGenerated(data, answerList)
    if (saveError) {
      setError(saveError)
      setPhase('answering')
    }
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setFileName(file.name)
    setPhase('extracting')

    try {
      const documentText = await extractDocumentText(file)

      const { data, error } = await supabase.functions.invoke('charter', {
        body: { action: 'from_document', project, documentText },
      })

      if (error || data?.error) {
        setError(error?.message || data.error)
        setPhase('upload')
        return
      }

      setDocSections(Object.fromEntries(SECTIONS.map((s) => [s.key, data[s.key] || ''])))
      setPhase('doc-review')
    } catch (err) {
      setError(err.message)
      setPhase('upload')
    }
  }

  async function handleAcceptDocument() {
    setSavingDoc(true)
    setError(null)

    const saveError = await onGenerated(docSections, [
      { question: 'Source', answer: `Uploaded document: ${fileName}` },
    ])

    setSavingDoc(false)
    if (saveError) setError(saveError)
  }

  return (
    <div className="charter">
      <div className="section-header">
        <h3 className="charter-heading">Generate Charter</h3>
        <div className="charter-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      <div className="modal-step">
        {phase === 'choose-method' && (
          <>
            <p className="charter-status">How would you like to create this Charter?</p>
            <div className="modal-actions">
              <button type="button" className="btn-primary" onClick={loadQuestions}>
                Answer a Few Questions
              </button>
              <button type="button" className="btn-primary" onClick={() => setPhase('upload')}>
                Upload Existing Document
              </button>
            </div>
          </>
        )}

        {phase === 'upload' && (
          <>
            <p className="charter-status">
              Upload an existing charter document (.txt or .docx). We&rsquo;ll extract a proposed
              Charter from it for you to review before anything is saved.
            </p>
            {error && <p className="error">{error}</p>}
            <input type="file" accept=".txt,.docx" onChange={handleFileSelect} />
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setPhase('choose-method')}>
                Back
              </button>
            </div>
          </>
        )}

        {phase === 'extracting' && (
          <p className="charter-status">
            <Spinner />
            Reading {fileName} and drafting a Charter from it...
          </p>
        )}

        {phase === 'doc-review' && docSections && (
          <>
            <p className="charter-status">
              Review and edit the Charter drafted from {fileName} below, then accept it.
            </p>

            {error && <p className="error">{error}</p>}

            <div className="charter-page">
              {SECTIONS.map(({ key, label }) => (
                <div className="charter-doc-section" key={key}>
                  <h4 className="charter-doc-heading">{label}</h4>
                  <textarea
                    className="charter-doc-body"
                    value={docSections[key]}
                    onChange={(e) => setDocSections((prev) => ({ ...prev, [key]: e.target.value }))}
                    rows={3}
                  />
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPhase('upload')}
                disabled={savingDoc}
              >
                Back
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={savingDoc}
                onClick={handleAcceptDocument}
              >
                {savingDoc ? 'Saving...' : 'Accept Charter'}
              </button>
            </div>
          </>
        )}

        {phase === 'loading-questions' && (
          <p className="charter-status">
            <Spinner />
            Thinking of a few questions...
          </p>
        )}

        {phase === 'error' && (
          <>
            <p className="error">{error}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
              >
                Close
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={loadQuestions}
              >
                Retry
              </button>
            </div>
          </>
        )}

        {(phase === 'answering' || phase === 'generating') && (
          <QaStepper
            questions={questions}
            answers={answers}
            onAnswerChange={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            onSubmit={handleSubmit}
            submitLabel="Generate Charter"
            loadingLabel="Generating..."
            submitting={phase === 'generating'}
            error={error}
            onCancel={onClose}
          />
        )}
      </div>
    </div>
  )
}

export default CharterFlow
