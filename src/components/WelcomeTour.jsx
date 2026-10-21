import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'cpm_welcome_tour_seen'
export const START_TOUR_EVENT = 'cpm:start-tour'

// Each step points at an element tagged data-tour="<target>" on the Dashboard.
// A step without a target is shown as a centred card.
const STEPS = [
  {
    title: 'Welcome to ConfidantPM',
    body: 'A two-minute look around. The AI guides you one question at a time, and nothing it drafts is final until you accept it.',
  },
  {
    target: 'new-project',
    title: 'Start here',
    body: 'Click New project, pick Waterfall, Agile or Hybrid, and add a name and goal. Choose Guided setup and the assistant asks a few questions to draft your Charter and Risk Log.',
  },
  {
    target: 'filters',
    title: 'Find any project',
    body: 'Search by name or goal, filter by methodology, switch between Active and Archived, and sort by Deadline, Priority or Recently Updated.',
  },
  {
    target: 'projects',
    selector: '[data-tour="projects"] li',
    title: 'A project card',
    body: 'Each card shows milestones passed and coming, who is on the project, its health and Target Go Live date. Click a card to open it.',
  },
  {
    target: 'attention',
    title: 'Needs your attention',
    body: 'Overdue tasks, passed milestones with open work and late status updates appear here, each with an Open link.',
  },
  {
    target: 'account',
    title: 'Take the tour again any time',
    body: 'Open the Account menu and choose Take the tour. Settings and Support are in the footer.',
  },
]

function findTarget(step) {
  if (!step.target) return null
  return document.querySelector(step.selector || `[data-tour="${step.target}"]`)
}

function seen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // Storage blocked: the tour may show again next visit, which is harmless.
  }
}

const PAD = 8
const CARD_W = 340

function WelcomeTour({ ready }) {
  const [step, setStep] = useState(null) // null = closed
  const [rect, setRect] = useState(null)
  const [cardH, setCardH] = useState(240)
  const cardRef = useRef(null)

  // First visit: open once the Dashboard has finished loading.
  useEffect(() => {
    if (ready && step === null && !seen()) setStep(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  useEffect(() => {
    const start = () => setStep(0)
    window.addEventListener(START_TOUR_EVENT, start)
    return () => window.removeEventListener(START_TOUR_EVENT, start)
  }, [])

  const close = useCallback(() => {
    markSeen()
    setStep(null)
    setRect(null)
  }, [])

  const measure = useCallback(() => {
    if (step === null) return
    setRect(findTarget(STEPS[step])?.getBoundingClientRect() ?? null)
  }, [step])

  useLayoutEffect(() => {
    if (step === null) return undefined
    const el = findTarget(STEPS[step])
    if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' })
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, measure])

  useEffect(() => {
    if (step === null) return undefined
    function onKey(e) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [step, close])

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight)
  }, [step])

  if (step === null) return null

  const total = STEPS.length
  const current = STEPS[step]
  const isLast = step === total - 1

  // Below the target when there is room, else above it, always kept on screen.
  let cardStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: CARD_W }
  if (rect) {
    const below = rect.bottom + PAD + 12
    const above = rect.top - PAD - 12 - cardH
    const top = below + cardH + 16 < window.innerHeight ? below : Math.max(16, above)
    const left = Math.min(Math.max(16, rect.left), window.innerWidth - CARD_W - 16)
    cardStyle = { top, left, width: CARD_W }
  }

  return (
    <div className="welcome-tour" role="dialog" aria-modal="true" aria-label="ConfidantPM tour">
      {rect ? (
        <div
          className="welcome-tour-spot"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="welcome-tour-dim" />
      )}
      <div className="welcome-tour-card" style={cardStyle} ref={cardRef}>
        <p className="step-label">
          Step {step + 1} of {total}
        </p>
        <h3 className="welcome-tour-title">{current.title}</h3>
        <p className="welcome-tour-body">{current.body}</p>
        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={step === 0 ? close : () => setStep(step - 1)}>
            {step === 0 ? 'Skip' : 'Back'}
          </button>
          <button type="button" className="btn-primary" onClick={isLast ? close : () => setStep(step + 1)}>
            {isLast ? 'Done' : step === 0 ? 'Start tour' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default WelcomeTour
