import { initialsFromEmail } from '../initials'

const TONES = ['#e5b79a', '#a9c9e8', '#d9c38a', '#c3b0e0', '#a8d5c2', '#e3a8b4']

function toneFor(email) {
  let h = 0
  for (const ch of email || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TONES[h % TONES.length]
}

// Overlapping initials circles for a project's people, owner first.
function AvatarStack({ emails, max = 4 }) {
  const unique = [...new Set((emails || []).filter(Boolean))]
  if (unique.length === 0) return null
  const shown = unique.slice(0, max)
  const extra = unique.length - shown.length

  return (
    <span className="avatar-stack" aria-label={`${unique.length} ${unique.length === 1 ? 'person' : 'people'} on this project`}>
      {shown.map((email) => (
        <span key={email} className="avatar-stack-item" title={email} style={{ background: toneFor(email) }}>
          {initialsFromEmail(email)}
        </span>
      ))}
      {extra > 0 && <span className="avatar-stack-item avatar-stack-more">+{extra}</span>}
    </span>
  )
}

export default AvatarStack
