// Single source of truth for the admin-page access gate on the frontend side.
// The Edge Function (supabase/functions/admin-data/index.ts) keeps its own
// copy for the same constant, since it can't import from src/ - keep both in
// sync if this ever changes.
export const ADMIN_EMAIL = 'admin@confidantpm.com'
