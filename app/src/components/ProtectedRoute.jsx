import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function ResetPasswordForm({ onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(err.message); return }
    onDone()
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/sheepdog-stacked-white.svg" alt="Sheepdog" className="login-logo" />
        <h1>Set New Password</h1>
        <p className="login-sub">Enter your new password below</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="new-pw">New Password</label>
            <input id="new-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div className="login-field">
            <label htmlFor="confirm-pw">Confirm Password</label>
            <input id="confirm-pw" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button type="submit" className="login-btn" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    // Detect recovery from URL hash (e.g. #access_token=...&type=recovery)
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      setRecovery(true)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (recovery) return <ResetPasswordForm onDone={() => setRecovery(false)} />
  return children
}
