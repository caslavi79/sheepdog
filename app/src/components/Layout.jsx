import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import AssistantPanel from './AssistantPanel'

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  const currentPage = location.pathname === '/' ? 'hub' : location.pathname.slice(1)

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
          <NavLink to="/contracts" className="sidebar-link sidebar-link--secondary">Contracts</NavLink>
          <NavLink to="/scheduling" className="sidebar-link sidebar-link--secondary">Scheduling</NavLink>
          <NavLink to="/compliance" className="sidebar-link sidebar-link--secondary">Compliance</NavLink>

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
            <NavLink to="/contracts" className="sidebar-more-link">Contracts</NavLink>
            <NavLink to="/resources" className="sidebar-more-link">Resources</NavLink>
            <NavLink to="/scheduling" className="sidebar-more-link">Scheduling</NavLink>
            <NavLink to="/compliance" className="sidebar-more-link">Compliance</NavLink>
            <button onClick={handleLogout} className="sidebar-more-link sidebar-more-logout">Log Out</button>
          </div>
        )}

        <button onClick={handleLogout} className="sidebar-logout">Log Out</button>
      </aside>
      <main className="app-main" id="main-content">
        <Outlet />
      </main>
      <button
        className="assistant-fab"
        onClick={() => setAssistantOpen(true)}
        aria-label="Open AI assistant"
        title="Sheepdog AI"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
      {assistantOpen && (
        <AssistantPanel
          onClose={() => setAssistantOpen(false)}
          currentPage={currentPage}
        />
      )}
    </div>
  )
}
