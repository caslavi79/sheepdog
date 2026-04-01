import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Only allow password reset if user arrived via PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      } else if (!session) {
        navigate('/login')
      }
    })

    // Also check if there's already a session (page refresh after recovery)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      else if (!ready) {
        // Give onAuthStateChange a moment to fire before redirecting
        setTimeout(() => {
          supabase.auth.getSession().then(({ data: { session: s } }) => {
            if (!s) navigate('/login')
          })
        }, 2000)
      }
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (err) { setError(err.message); return }
    navigate('/')
  }

  if (!ready) return <div className="loading">Loading...</div>

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/sheepdog-stacked-white.svg" alt="Sheepdog" className="login-logo" />
        <h1>Set New Password</h1>
        <p className="login-sub">Enter your new password below</p>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="new-pw">New Password</label>
            <div className="login-password-wrap">
              <input id="new-pw" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
              <button type="button" className="login-toggle-pw" onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide' : 'Show'}</button>
            </div>
          </div>
          <div className="login-field">
            <label htmlFor="confirm-pw">Confirm Password</label>
            <div className="login-password-wrap">
              <input id="confirm-pw" type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={8} />
            </div>
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
