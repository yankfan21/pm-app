import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'theme'
export const availableThemes = ['light', 'dark', 'system']

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function resolveTheme(theme) {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme))
}

// Mirrors the inline snippet in index.html that runs before paint - kept in
// sync so a hard refresh and an in-app change land on the same value.
function readStoredTheme() {
  const stored = localStorage.getItem(STORAGE_KEY)
  return availableThemes.includes(stored) ? stored : 'system'
}

export function useTheme() {
  const [theme, setThemeState] = useState(readStoredTheme)

  const setTheme = useCallback((next) => {
    if (!availableThemes.includes(next)) return
    localStorage.setItem(STORAGE_KEY, next)
    setThemeState(next)
    applyTheme(next)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  return { theme, setTheme, availableThemes }
}

export default useTheme
