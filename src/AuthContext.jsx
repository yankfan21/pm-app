import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, DEV_BYPASS_AUTH } from './supabaseClient'

// Fake signed-in user for DEV_BYPASS_AUTH (local redesign preview only).
const DEV_SESSION = {
  access_token: 'dev-bypass',
  user: { id: 'dev-bypass-user', email: 'alex.morgan@example.com', user_metadata: { full_name: 'Alex Morgan' } },
}

const AuthContext = createContext(undefined)

// Single source of truth for the current Supabase Auth session - mounted
// once around the whole app in main.jsx. Every existing supabase-js call
// (including supabase.functions.invoke) already reads its access token off
// this same client instance, so once a session exists here every existing
// request automatically starts authenticating as that user - no other code
// needs to change to "start using" auth.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(DEV_BYPASS_AUTH ? DEV_SESSION : null)
  const [loading, setLoading] = useState(!DEV_BYPASS_AUTH)

  useEffect(() => {
    if (DEV_BYPASS_AUTH) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    loading,
    signOut: () => (DEV_BYPASS_AUTH ? Promise.resolve() : supabase.auth.signOut()),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
