import { createBrowserClient } from '@supabase/ssr'
// Create Supabase clients for different contexts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
export function createClient() {
  return createBrowserClient(
    supabaseUrl!,
    supabaseAnonKey!
  )
}