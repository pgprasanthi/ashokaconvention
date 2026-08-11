import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' })
      setUser(res.ok ? await res.json() : null)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // Called with the Google ID token from the Sign in with Google button
  const loginWithGoogle = useCallback(async (credential) => {
    const res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential })
    })
    if (!res.ok) throw new Error('Sign-in failed')
    setUser(await res.json())
  }, [])

  const logout = useCallback(async () => {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    setUser(null)
  }, [])

  const value = {
    user,
    role: user?.role ?? null,
    isAdmin: user?.role === 'admin',
    isStaff: user?.role === 'staff',
    loginWithGoogle,
    logout
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
