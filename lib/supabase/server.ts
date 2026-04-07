import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/supabase'

/**
 * Server client using the service role key — bypasses RLS.
 * Safe to use in Server Actions and Route Handlers (never exposed to the browser).
 * Use this for all database writes/reads since the app uses custom auth,
 * not Supabase Auth, so auth.uid() is never populated.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set in environment variables.')
  }

  return createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Cookie-based client using the anon key — respects RLS.
 * Use this only for Supabase Auth flows (sign in, sign up, session refresh).
 */
export async function createAnonClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore.
          }
        },
      },
    }
  )
}  


