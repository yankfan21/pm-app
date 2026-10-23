import createImg from './assets/tour/create.jpg'
import qaImg from './assets/tour/qa.jpg'
import qaMp4 from './assets/tour/qa.mp4'
import qaWebm from './assets/tour/qa.webm'
import tasksImg from './assets/tour/tasks.jpg'
import ganttImg from './assets/tour/gantt.jpg'
import statusImg from './assets/tour/status.jpg'

// The five-step product walkthrough, shared by the home page's pop-up
// (components/HowItWorksModal.jsx) and the standalone /tour page (Tour.jsx).
// Screenshots come from the app itself (dev preview sample data). All five
// share one 3:2 landscape shape so the slides line up. A step may also carry a
// `video` ({ mp4, webm }): a short silent clip (recorded from the same sample data) that plays
// in place of the screenshot, which then serves as its poster.
export const TOUR_STEPS = [
  {
    title: 'Set up your project in minutes',
    body: 'Choose Waterfall, Agile or Hybrid, name it, set a priority and a go-live date. Pick Guided setup and the assistant drafts your Charter and Risk Log from a few questions.',
    img: createImg,
    alt: 'The New Project review step, offering Guided setup or Quick create',
    label: 'New project',
  },
  {
    title: 'Answer one question at a time',
    body: 'No blank chat box and no long forms. One question per screen, a progress bar, and a suggested answer drawn from what you have already told it. Press Tab to accept it.',
    img: qaImg,
    video: { mp4: qaMp4, webm: qaWebm },
    alt: 'A guided question screen with a progress bar and an answer box',
    label: 'Guided questions',
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
