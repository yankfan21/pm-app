import { useEffect, useRef, useState } from 'react'

// One walkthrough slide's picture: a short silent clip when the step has one
// (poster = the still screenshot), else just the screenshot. Visitors who
// prefer reduced motion get the still image only.
export function useReducedMotion() {
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

// mp4 (H.264) where the browser plays it, webm otherwise.
export function pickVideoSrc(video) {
  if (typeof document === 'undefined') return video.mp4
  const probe = document.createElement('video')
  const canMp4 = probe.canPlayType && probe.canPlayType('video/mp4; codecs="avc1.42E01E"')
  return canMp4 ? video.mp4 : video.webm
}

// Callouts (step.callouts) are bubbles pointing at the app, timed to the clip.
// loop: replay forever (the /tour page). Otherwise onEnded fires once, and
// onProgress gets 0..1 as the clip plays. paused holds it; onBlocked fires if
// the browser refuses to autoplay. playWhenVisible only plays while on screen.
function TourMedia({
  step,
  lazy = false,
  loop = false,
  paused = false,
  playWhenVisible = false,
  onEnded,
  onProgress,
  onBlocked,
}) {
  const reduced = useReducedMotion()
  const ref = useRef(null)
  const [visible, setVisible] = useState(!playWhenVisible)
  const [active, setActive] = useState('')
  const hasVideo = Boolean(step.video) && !reduced
  const callouts = step.callouts

  useEffect(() => {
    if (!playWhenVisible || !hasVideo || !ref.current) return undefined
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.4 })
    io.observe(ref.current)
    return () => io.disconnect()
  }, [playWhenVisible, hasVideo])

  // Callbacks are read through a ref so a new function each render never
  // re-runs the play effect (which would restart a clip that has just ended).
  const blockedRef = useRef(onBlocked)
  useEffect(() => {
    blockedRef.current = onBlocked
  })

  const shouldPlay = !paused && visible
  useEffect(() => {
    const v = ref.current
    if (!v || !hasVideo) return
    if (shouldPlay) {
      if (v.ended) return
      const attempt = v.play()
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => blockedRef.current?.())
    } else {
      v.pause()
    }
  }, [shouldPlay, hasVideo, step.video])

  // Which callouts are showing, from the clip's own clock (a frame-rate loop,
  // so a bubble lands on the beat rather than up to 250ms late like timeupdate).
  useEffect(() => {
    const v = ref.current
    if (!v || !hasVideo || !callouts?.length) return undefined
    let raf = 0
    const tick = () => {
      const t = v.currentTime
      const next = callouts.map((c, i) => (t >= c.at && t < c.until ? i : '')).join(',')
      setActive((prev) => (prev === next ? prev : next))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [callouts, hasVideo, step.video])

  if (!hasVideo) {
    return <img src={step.img} alt={step.alt} loading={lazy ? 'lazy' : undefined} />
  }
  const showing = new Set(active.split(',').filter(Boolean).map(Number))
  return (
    <>
      <video
        ref={ref}
        key={step.video.mp4}
        src={pickVideoSrc(step.video)}
        poster={step.img}
        aria-label={step.alt}
        muted
        playsInline
        loop={loop}
        preload="auto"
        onEnded={onEnded}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (onProgress && v.duration) onProgress(v.currentTime / v.duration)
        }}
      />
      {callouts?.map((c, i) => (
        <span
          key={c.text}
          className={`how-callout place-${c.place} align-${c.align}${showing.has(i) ? ' on' : ''}`}
          style={{ left: `${c.x}%`, top: `${c.y}%` }}
          aria-hidden="true"
        >
          <span className="how-callout-text">{c.text}</span>
        </span>
      ))}
    </>
  )
}

export default TourMedia
