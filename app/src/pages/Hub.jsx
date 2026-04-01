import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const icons = {
  resources: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h4"/></svg>,
  scheduling: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>,
  clients: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  financials: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  compliance: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>,
  reviews: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M8 12h.01"/><path d="M12 12h.01"/><path d="M16 12h.01"/></svg>,
  pipeline: <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
}

const modules = [
  {
    title: 'Resources',
    desc: 'Strategy docs, outreach templates, brand guides',
    path: '/resources',
    icon: icons.resources,
    ready: true,
  },
  {
    title: 'Clients',
    desc: 'Client records, contact info, service history',
    path: '/clients',
    icon: icons.clients,
    ready: true,
  },
  {
    title: 'Pipeline',
    desc: 'Sales funnel — track leads from first touch to signed contract',
    path: '/pipeline',
    icon: icons.pipeline,
    ready: true,
  },
  {
    title: 'Scheduling',
    desc: 'Events and staffing calendars',
    path: '/scheduling',
    icon: icons.scheduling,
    ready: false,
  },
  {
    title: 'Financials',
    desc: 'Revenue tracking, invoicing',
    path: '/financials',
    icon: icons.financials,
    ready: false,
  },
  {
    title: 'Compliance',
    desc: 'Licensing, TABC, contractor paperwork',
    path: '/compliance',
    icon: icons.compliance,
    ready: false,
  },
]

export default function Hub() {
  const [stats, setStats] = useState({ leads: '—', pipelineValue: '—', submissions7d: '—', activeClients: '—' })

  useEffect(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    Promise.all([
      supabase.from('pipeline').select('stage, value'),
      supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ]).then(([pipelineRes, subsRes, clientsRes]) => {
      const deals = pipelineRes.data || []
      const leads = deals.filter(d => d.stage === 'lead').length
      const pipelineValue = deals.filter(d => d.stage !== 'lost').reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0)
      setStats({
        leads,
        pipelineValue: pipelineValue > 0 ? `$${pipelineValue.toLocaleString()}` : '$0',
        submissions7d: subsRes.count ?? 0,
        activeClients: clientsRes.count ?? 0,
      })
    })
  }, [])

  return (
    <div className="hub">
      <div className="hub-header">
        <h1>Sheepdog HQ</h1>
        <p>Operations dashboard for Sheepdog Security LLC</p>
      </div>
      <div className="hub-stats">
        <div className="hub-stat-card">
          <div className="hub-stat-value">{stats.leads}</div>
          <div className="hub-stat-label">New Leads</div>
        </div>
        <div className="hub-stat-card">
          <div className="hub-stat-value">{stats.pipelineValue}</div>
          <div className="hub-stat-label">Pipeline Value</div>
        </div>
        <div className="hub-stat-card">
          <div className="hub-stat-value">{stats.submissions7d}</div>
          <div className="hub-stat-label">Submissions (7d)</div>
        </div>
        <div className="hub-stat-card">
          <div className="hub-stat-value">{stats.activeClients}</div>
          <div className="hub-stat-label">Active Clients</div>
        </div>
      </div>
      <div className="hub-grid">
        {modules.map((mod) => (
          <Link
            key={mod.title}
            to={mod.ready ? mod.path : '#'}
            className={`hub-card ${mod.ready ? '' : 'hub-card--locked'}`}
            onClick={(e) => !mod.ready && e.preventDefault()}
          >
            <div className="hub-card-icon" aria-hidden="true">{mod.icon}</div>
            <h2>{mod.title}</h2>
            <p>{mod.desc}</p>
            {!mod.ready && <span className="hub-card-badge">Coming Soon</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
