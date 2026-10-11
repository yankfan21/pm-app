// Initials from an email's local part: one letter from each of the first two
// pieces split on . _ - + , else the first two characters. Never blank for a
// non-empty email. Shared by the sidebar avatar and the project-card avatars.
export function initialsFromEmail(email) {
  const localPart = (email || '').split('@')[0]
  const parts = localPart.split(/[.\-_+]+/).filter(Boolean)

  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return '?'
}
