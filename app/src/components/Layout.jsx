import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error && import.meta.env.DEV) console.error('Logout error:', error.message)
    navigate('/login')
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/sheepdog-stacked-white.svg" alt="Sheepdog" className="sidebar-logo" />
        </div>
        <nav className="sidebar-nav">
          {/* Primary tabs — shown on mobile bottom nav */}
          <NavLink to="/" end className="sidebar-link">Dashboard</NavLink>
          <NavLink to="/clients" className="sidebar-link">Clients</NavLink>
          <NavLink to="/pipeline" className="sidebar-link">Pipeline</NavLink>
          <NavLink to="/financials" className="sidebar-link">Financials</NavLink>
          {/* Secondary tabs — hidden on mobile, shown in More menu */}
          <NavLink to="/resources" className="sidebar-link sidebar-link--secondary">Resources</NavLink>
          <NavLink to="/submissions" className="sidebar-link sidebar-link--secondary">Submissions</NavLink>
          <span className="sidebar-link sidebar-link--secondary sidebar-link--stub" aria-disabled="true">Scheduling</span>
          <span className="sidebar-link sidebar-link--secondary sidebar-link--stub" aria-disabled="true">Compliance</span>

          {/* Mobile "More" button — only visible on mobile via CSS */}
          <button
            className="sidebar-more-btn"
            onClick={() => setMoreOpen(!moreOpen)}
            aria-expanded={moreOpen}
          >
            <span className="sidebar-more-dots">•••</span>
            More
          </button>
        </nav>

        {/* Mobile overflow menu */}
        {moreOpen && (
          <div className="sidebar-more-menu" onClick={() => setMoreOpen(false)}>
            <NavLink to="/submissions" className="sidebar-more-link">Submissions</NavLink>
            <NavLink to="/resources" className="sidebar-more-link">Resources</NavLink>
            <span className="sidebar-more-link sidebar-link--stub" aria-disabled="true">Scheduling</span>
            <span className="sidebar-more-link sidebar-link--stub" aria-disabled="true">Compliance</span>
            <button onClick={handleLogout} className="sidebar-more-link sidebar-more-logout">Log Out</button>
          </div>
        )}

        <button onClick={handleLogout} className="sidebar-logout">Log Out</button>
      </aside>
      <main className="app-main" id="main-content">
        <Outlet />
      </main>
    </div>
  )
}
