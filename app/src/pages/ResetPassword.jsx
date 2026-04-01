import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase will have exchanged the code and created a session by now
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        // No session = user navigated here directly without a reset link
        navigate('/login')
      } else {
        setReady(true)
      }
    })
  }, [navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
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
