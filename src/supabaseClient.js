import { createClient } from '@supabase/supabase-js'
import { devSupabase } from './dev/devSupabase'

// Local-only: lets the redesign be previewed without credentials (see
// AuthContext.jsx). import.meta.env.DEV is false in production builds, so
// this can never be true on a deployed site.
export const DEV_BYPASS_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Bypass mode uses the in-memory fake (sample data, no network); otherwise the real client.
export const supabase = DEV_BYPASS_AUTH ? devSupabase : createClient(supabaseUrl, supabaseAnonKey)
