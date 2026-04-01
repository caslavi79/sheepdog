import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[Sheepdog] Missing Supabase environment variables.\n' +
    'Create app/.env with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'See app/.env.example for reference.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Catch PASSWORD_RECOVERY event before React mounts — Supabase strips the
// URL hash immediately on createClient, so React components miss it.
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    sessionStorage.setItem('password_recovery', 'true')
  }
})
