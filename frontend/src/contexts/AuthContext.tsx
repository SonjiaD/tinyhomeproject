import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Mirrors the public.profiles table in Supabase.
export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  occupation: string | null
  age_range: string | null
  household_type: string | null
  income_range: string | null
  goal: number | null
  neighborhood: string | null
  roles: string[] | null
  ownership_model: string | null
  ownership_other: string | null
}

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string | undefined) {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (!mounted) return
        setSession(session)
        setUser(session?.user ?? null)
        await loadProfile(session?.user?.id)
      })
      .catch(async (err) => {
        // A stale/invalid refresh token (e.g. the account was deleted) rejects here.
        // Purge the dead session so it stops erroring on every load, and fall through
        // to a clean logged-out state (AuthGuard then routes to login).
        console.warn('Auth session invalid, signing out:', err?.message ?? err)
        try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* already gone */ }
        if (!mounted) return
        setSession(null); setUser(null); setProfile(null)
      })
      .finally(() => { if (mounted) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      loadProfile(session?.user?.id)
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function refreshProfile() {
    await loadProfile(user?.id)
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email: string, password: string, name: string) {
    // Supabase doesn't return an error for a duplicate email (anti-enumeration) — it
    // signals this instead via an empty `identities` array on the raw /signup response,
    // present only on an existing, already-confirmed account. But supabase-js's own
    // signUp() can't be used to read this: its client-side response transform assumes
    // the raw body is wrapped as `{ user: {...} }`, while GoTrue's actual /signup response
    // (when no session is created yet, i.e. email confirmation is pending) is a FLAT user
    // object with no `user` key — so the SDK's parsed `data.user` is null for every
    // pending-confirmation signup, duplicate or brand-new, making the check silently no-op.
    // Call the REST endpoint directly instead and read the raw body ourselves.
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    let res: Response
    try {
      res = await fetch(`${supabaseUrl}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey },
        body: JSON.stringify({ email, password, data: { full_name: name } }),
      })
    } catch {
      return { error: new Error('Network error. Please check your connection and try again.') }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      return { error: new Error(body?.msg || body?.error_description || 'Something went wrong. Please try again.') }
    }
    if (Array.isArray(body?.identities) && body.identities.length === 0) {
      return { error: new Error('An account with this email already exists. Please sign in instead.') }
    }
    // If GoTrue returned an immediate session (e.g. email confirmation disabled on this
    // project in the future), sync it into the SDK's own store so getSession() /
    // onAuthStateChange stay consistent with what we just did via the raw fetch above.
    if (body?.access_token && body?.refresh_token) {
      await supabase.auth.setSession({ access_token: body.access_token, refresh_token: body.refresh_token })
    }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
