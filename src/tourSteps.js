import createImg from './assets/tour/create.jpg'
import createMp4 from './assets/tour/create.mp4'
import createWebm from './assets/tour/create.webm'
import qaImg from './assets/tour/qa.jpg'
import qaMp4 from './assets/tour/qa.mp4'
import qaWebm from './assets/tour/qa.webm'
import tasksImg from './assets/tour/tasks.jpg'
import tasksMp4 from './assets/tour/tasks.mp4'
import tasksWebm from './assets/tour/tasks.webm'
import ganttImg from './assets/tour/gantt.jpg'
import ganttMp4 from './assets/tour/gantt.mp4'
import ganttWebm from './assets/tour/gantt.webm'
import statusImg from './assets/tour/status.jpg'
import statusMp4 from './assets/tour/status.mp4'
import statusWebm from './assets/tour/status.webm'

// The five-step product walkthrough, shared by the home page's pop-up
// (components/HowItWorksModal.jsx) and the standalone /tour page (Tour.jsx).
// Screenshots come from the app itself (dev preview sample data). All five
// share one 3:2 landscape shape so the slides line up. Every step also has a
// `video` ({ mp4, webm }): a short silent clip (scripted recordings of the dev
// preview sample data, about 50 seconds in all) that plays in place of the
// screenshot, which then serves as its poster. The pop-up plays them back to
// back; the /tour page loops each one.
export const TOUR_STEPS = [
  {
    title: 'Set up your project in minutes',
    body: 'Choose Waterfall, Agile or Hybrid, name it, set a priority and a go-live date. Pick Guided setup and the assistant drafts your Charter and Risk Log from a few questions.',
    img: createImg,
    video: { mp4: createMp4, webm: createWebm },
    alt: 'The New Project review step, offering Guided setup or Quick create',
    label: 'New project',
  },
  {
    title: 'Answer one question at a time',
    body: 'No blank chat box and no long forms. One question per screen, with a progress bar so you always know where you are. Suggestions draw on what you have already told it.',
    img: qaImg,
    video: { mp4: qaMp4, webm: qaWebm },
    alt: 'A guided question screen with a progress bar and an answer box',
    label: 'Guided questions',
  },
  {
    title: 'Review the tasks it proposes',
    body: 'The assistant turns your Charter into a task list. Filter by status, edit anything, and only the tasks you accept are saved. Accepted tasks are yours: the AI never changes them.',
    img: tasksImg,
    video: { mp4: tasksMp4, webm: tasksWebm },
    alt: 'The Tasks and Milestones page with Generate Tasks and Import buttons',
    label: 'Tasks and milestones',
  },
  {
    title: 'See the plan on a Gantt chart',
    body: 'Dependencies, milestones, a Today line and the critical path in amber. Export to Excel or PDF to share with stakeholders.',
    img: ganttImg,
    video: { mp4: ganttMp4, webm: ganttWebm },
    alt: 'A Gantt chart with the critical path highlighted',
    label: 'Gantt chart',
  },
  {
    title: 'Keep everyone informed',
    body: 'Log a weekly status update in three boxes, and let the assistant propose Exec and Team comms. You accept or discard every version, and old versions are kept.',
    img: statusImg,
    video: { mp4: statusMp4, webm: statusWebm },
    alt: 'The Status Update page with a Log Status Update button and history',
    label: 'Communications',
  },
]
