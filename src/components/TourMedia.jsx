import { useEffect, useState } from 'react'

// One walkthrough slide's picture: a short silent clip that loops when the
// step has one (poster = the still screenshot), else just the screenshot.
// Visitors who prefer reduced motion get the still image only.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function TourMedia({ step, lazy = false }) {
  const reduced = useReducedMotion()
  if (step.video && !reduced) {
    return (
      <video
        key={step.video.mp4}
        poster={step.img}
        aria-label={step.alt}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
      >
        <source src={step.video.mp4} type="video/mp4" />
        <source src={step.video.webm} type="video/webm" />
      </video>
    )
  }
  return <img src={step.img} alt={step.alt} loading={lazy ? 'lazy' : undefined} />
}

export default TourMedia
