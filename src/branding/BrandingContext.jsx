import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../AuthContext'
import { deriveBrand } from './color'

// White-label branding for the signed-in user's organization. Loads the
// organization (oldest membership wins; there is no switcher yet), derives the
// colour tokens in color.js - which guarantees contrast whatever was stored -
// and applies them as --brand-* custom properties on <html>. theme-paper.css
// reads those with the stock teal as the fallback, so a user with no
// organization, a failed lookup, or no migration applied yet sees the default.
//
// Only active on the Paper theme: the legacy theme has no --brand-* mapping.

const DEFAULT_BRAND = { appName: null, logoUrl: null }
const BrandingContext = createContext(DEFAULT_BRAND)

async function loadOrganization(userId) {
  const { data: membership, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (memberError || !membership) return null

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('app_name, logo_path, accent_color, rail_color')
    .eq('id', membership.organization_id)
    .maybeSingle()
  return orgError ? null : org
}

export function BrandingProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [org, setOrg] = useState(null)

  useEffect(() => {
    if (!userId || document.documentElement.getAttribute('data-theme') !== 'paper') {
      setOrg(null)
      return undefined
    }
    let cancelled = false
    loadOrganization(userId)
      .then((row) => !cancelled && setOrg(row))
      .catch(() => !cancelled && setOrg(null))
    return () => {
      cancelled = true
    }
  }, [userId])

  const tokens = useMemo(
    () => (org ? deriveBrand({ accent: org.accent_color, rail: org.rail_color }).tokens : {}),
    [org],
  )

  useEffect(() => {
    const root = document.documentElement
    const names = Object.keys(tokens)
    names.forEach((name) => root.style.setProperty(name, tokens[name]))
    return () => names.forEach((name) => root.style.removeProperty(name))
  }, [tokens])

  const value = useMemo(() => {
    if (!org) return DEFAULT_BRAND
    const logoUrl = org.logo_path
      ? supabase.storage.from('org-logos').getPublicUrl(org.logo_path).data?.publicUrl || null
      : null
    return { appName: org.app_name || null, logoUrl }
  }, [org])

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}
