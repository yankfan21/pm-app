import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import ConfidantLogo from './ConfidantLogo'
import createImg from './assets/tour/create.jpg'
import qaImg from './assets/tour/qa.jpg'
import tasksImg from './assets/tour/tasks.jpg'
import ganttImg from './assets/tour/gantt.jpg'
import statusImg from './assets/tour/status.jpg'

// Same destination as the home page's CTAs (see Marketing.jsx).
const SIGN_UP_PATH = '/login?mode=signup'

// Screenshots come from the app itself (dev preview sample data). `narrow`
// steps are tall modal crops, shown at a modal's natural width instead of
// stretched across the frame.
const STEPS = [
  {
    title: 'Create a project in four short steps',
    body: 'Choose Waterfall, Agile or Hybrid, name it, set a priority and a go-live date. Pick Guided setup and the assistant drafts your Charter and Risk Log from a few questions.',
    img: createImg,
    alt: 'The New Project review step, offering Guided setup or Quick create',
    label: 'New project',
    narrow: true,
  },
  {
    title: 'Answer one question at a time',
    body: 'No blank chat box and no long forms. One question per screen, a progress bar, and a suggested answer drawn from what you have already told it. Press Tab to accept it.',
    img: qaImg,
    alt: 'A guided question screen with a progress bar and an answer box',
    label: 'Guided questions',
    narrow: true,
  },
  {
    title: 'Review the tasks it proposes',
    body: 'The assistant turns your Charter into a task list. Edit anything, untick what you do not want, and only the tasks you accept are saved. Accepted tasks are yours: the AI never changes them.',
    img: tasksImg,
    alt: 'The Tasks and Milestones page with Generate Tasks and Import buttons',
    label: 'Tasks and milestones',
  },
  {
    title: 'See the plan on a Gantt chart',
    body: 'Dependencies, milestones, a Today line and the critical path in amber. Export to Excel or PDF to share with stakeholders.',
    img: ganttImg,
    alt: 'A Gantt chart with the critical path highlighted',
    label: 'Gantt chart',
  },
  {
    title: 'Keep everyone informed',
    body: 'Log a weekly status update in three boxes, and let the assistant propose Exec and Team comms. You accept or discard every version, and old versions are kept.',
    img: statusImg,
    alt: 'The Status Update page with a Log Status Update button and history',
    label: 'Communications',
  },
]

function Tour() {
  useEffect(() => {
    const previous = document.title
    document.title = 'See how ConfidantPM works'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <div className="marketing-page tour-page">
      <header className="marketing-nav">
        <Link to="/" className="marketing-nav-brand">
          <ConfidantLogo size={32} />
          <span className="marketing-nav-name">Confidant<span className="brand-name-accent">PM</span></span>
        </Link>
        <Link to="/login" className="marketing-nav-signin">
          Sign in
        </Link>
      </header>

      <main className="marketing-main">
        <section className="tour-intro">
          <h1 className="marketing-hero-headline">See how ConfidantPM works</h1>
          <p className="marketing-hero-sub">
            Five steps from a blank page to a plan you trust. Every screen below is the real app.
          </p>
          <Link to={SIGN_UP_PATH} className="marketing-cta">
            Try ConfidantPM free
          </Link>
        </section>

        <ol className="tour-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="tour-step">
              <div className="tour-copy">
                <span className="tour-num" aria-hidden="true">{i + 1}</span>
                <h2 className="tour-title">{step.title}</h2>
                <p className="tour-body">{step.body}</p>
              </div>
              <figure className="tour-frame">
                <div className="tour-frame-bar" aria-hidden="true">
                  <i /><i /><i />
                  <span>{step.label}</span>
                </div>
                <div className={step.narrow ? 'tour-shot tour-shot-narrow' : 'tour-shot'}>
                  <img src={step.img} alt={step.alt} loading="lazy" />
                </div>
              </figure>
            </li>
          ))}
        </ol>
      </main>

      <section className="tour-close">
        <h2 className="tour-close-title">Ready to try it on your own project?</h2>
        <p className="tour-close-body">Free to start. Nothing the assistant drafts is final until you accept it.</p>
        <Link to={SIGN_UP_PATH} className="marketing-cta">
          Try ConfidantPM free
        </Link>
      </section>

      <footer className="marketing-footer">
        <p className="marketing-footer-links">
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy Policy</Link>
        </p>
      </footer>
    </div>
  )
}

export default Tour
