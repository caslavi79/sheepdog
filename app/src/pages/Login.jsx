import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setResetSent(false)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      navigate('/')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <img src="/sheepdog-stacked-white.svg" alt="Sheepdog" className="login-logo" />
        <h1>Sheepdog HQ</h1>
        <p className="login-sub">Internal operations portal</p>
        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=""
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="password">Password</label>
            <div className="login-password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=""
                required
              />
              <button
                type="button"
                className="login-toggle-pw"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          {error && <div className="login-error">{error}</div>}
          {resetSent && <div className="login-success">Password reset email sent. Check your inbox.</div>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button
            type="button"
            className="login-forgot"
            onClick={async () => {
              if (!email) { setError('Enter your email first.'); return }
              setError('')
              const { error: err } = await supabase.auth.resetPasswordForEmail(email)
              if (err) setError(err.message)
              else setResetSent(true)
            }}
          >
            Forgot password?
          </button>
        </form>
      </div>
    </div>
  )
}
