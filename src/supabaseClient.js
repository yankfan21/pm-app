import { createClient } from '@supabase/supabase-js'

// Local-only: lets the redesign be previewed without credentials (see
// AuthContext.jsx). import.meta.env.DEV is false in production builds, so
// this can never be true on a deployed site.
export const DEV_BYPASS_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (DEV_BYPASS_AUTH ? 'http://127.0.0.1:54321' : undefined)
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (DEV_BYPASS_AUTH ? 'dev-bypass' : undefined)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
