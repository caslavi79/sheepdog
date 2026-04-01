import { useLocation } from 'react-router-dom'

export default function Placeholder() {
  const location = useLocation()
  const raw = location.pathname.replace('/', '').replace(/-/g, ' ')
  const name = raw.replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div className="placeholder">
      <h1>{name}</h1>
      <p>This module is being built. Check back soon.</p>
    </div>
  )
}
