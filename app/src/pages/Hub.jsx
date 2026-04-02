import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { daysUntil, daysSince } from '../lib/format'
import { askAssistant } from '../lib/assistant'

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
    desc: 'Events calendar, staff assignments, placements',
    path: '/scheduling',
    icon: icons.scheduling,
    ready: true,
  },
  {
    title: 'Financials',
    desc: 'Revenue tracking, invoicing',
    path: '/financials',
    icon: icons.financials,
    ready: true,
  },
  {
    title: 'Compliance',
    desc: 'Staff roster, licenses, TABC, contractor docs',
    path: '/compliance',
    icon: icons.compliance,
    ready: true,
  },
]

export default function Hub() {
  const [stats, setStats] = useState({ leads: '—', pipelineValue: '—', submissions7d: '—', activeClients: '—' })
  const [alerts, setAlerts] = useState([])
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [briefing, setBriefing] = useState(() => {
    try {
      const cached = localStorage.getItem('sheepdog_briefing')
      if (cached) {
        const { text, date } = JSON.parse(cached)
        if (date === new Date().toISOString().slice(0, 10)) return text
      }
    } catch { /* ignore */ }
    return null
  })
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingError, setBriefingError] = useState('')

  const [uploadResult, setUploadResult] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const uploadInputRef = useRef(null)

  const handleUpload = async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploadLoading(true)
    setUploadError('')
    setUploadResult(null)
    try {
      const base64 = await new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          let w = img.width, h = img.height
          if (w > 1024) { h = Math.round(h * (1024 / w)); w = 1024 }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1])
        }
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })
      const result = await askAssistant({ action: 'intake', context: { page: 'hub' }, imageBase64: base64, imageMediaType: 'image/jpeg' })
      setUploadResult({
        summary: result.reply,
        actions_taken: result.actions_taken || [],
        intake: true,
      })
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploadLoading(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer?.files?.[0]
    if (file) handleUpload(file)
  }

  const fetchBriefing = async () => {
    setBriefingLoading(true)
    setBriefingError('')
    try {
      const result = await askAssistant({ action: 'daily_briefing', context: { page: 'hub' } })
      const text = result.reply || ''
      setBriefing(text)
      localStorage.setItem('sheepdog_briefing', JSON.stringify({ text, date: new Date().toISOString().slice(0, 10) }))
    } catch (err) {
      setBriefingError(err.message)
    } finally {
      setBriefingLoading(false)
    }
  }

  useEffect(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    Promise.all([
      supabase.from('pipeline').select('stage, value, last_activity'),
      supabase.from('contact_submissions').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('invoices').select('status, total, due_date'),
      supabase.from('licenses').select('expiration_date, staff_id'),
      supabase.from('contractor_docs').select('status'),
      supabase.from('events').select('id, invoice_id, date, status').is('invoice_id', null).neq('status', 'cancelled'),
      supabase.from('contracts').select('id, status, sent_at').in('status', ['sent', 'viewed']),
    ]).then(([pipelineRes, subsRes, clientsRes, invoicesRes, licensesRes, docsRes, eventsRes, contractsRes]) => {
      const deals = pipelineRes.data || []
      const leads = deals.filter(d => d.stage === 'lead').length
      const pipelineValue = deals.filter(d => d.stage !== 'lost').reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0)
      setStats({
        leads,
        pipelineValue: pipelineValue > 0 ? `$${pipelineValue.toLocaleString()}` : '$0',
        submissions7d: subsRes.count ?? 0,
        activeClients: clientsRes.count ?? 0,
      })

      // Build alerts
      const a = []
      const invoices = invoicesRes.data || []
      const overdueInvoices = invoices.filter(i => {
        if (i.status === 'overdue') return true
        if (i.status === 'sent' && i.due_date) { const d = daysUntil(i.due_date); return d !== null && d < 0 }
        return false
      })
      const outstandingTotal = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
      if (overdueInvoices.length > 0) a.push({ color: '#D4483A', text: `${overdueInvoices.length} overdue invoice${overdueInvoices.length !== 1 ? 's' : ''}`, link: '/financials' })
      if (outstandingTotal > 0) a.push({ color: '#C9922E', text: `$${outstandingTotal.toLocaleString()} outstanding`, link: '/financials' })

      const lics = licensesRes.data || []
      const expiredLics = lics.filter(l => { const d = daysUntil(l.expiration_date); return d !== null && d < 0 })
      const expiringLics = lics.filter(l => { const d = daysUntil(l.expiration_date); return d !== null && d >= 0 && d <= 30 })
      if (expiredLics.length > 0) a.push({ color: '#D4483A', text: `${expiredLics.length} expired license${expiredLics.length !== 1 ? 's' : ''}`, link: '/compliance' })
      if (expiringLics.length > 0) a.push({ color: '#C9922E', text: `${expiringLics.length} license${expiringLics.length !== 1 ? 's' : ''} expiring soon`, link: '/compliance' })

      const missingDocs = (docsRes.data || []).filter(d => d.status === 'missing').length
      if (missingDocs > 0) a.push({ color: '#D4483A', text: `${missingDocs} missing contractor doc${missingDocs !== 1 ? 's' : ''}`, link: '/compliance' })

      // Stale pipeline deals (14+ days without activity)
      const staleDeals = deals.filter(d => {
        if (d.stage === 'lost' || d.stage === 'under_contract') return false
        if (!d.last_activity) return true
        const ds = daysSince(d.last_activity)
        return ds !== null && ds > 14
      })
      if (staleDeals.length > 0) a.push({ color: '#C9922E', text: `${staleDeals.length} stale pipeline deal${staleDeals.length !== 1 ? 's' : ''} (14+ days)`, link: '/pipeline' })

      // Unsigned contracts (sent 7+ days ago)
      const unsignedContracts = (contractsRes.data || []).filter(c => {
        if (!c.sent_at) return false
        const ds = daysSince(c.sent_at)
        return ds !== null && ds > 7
      })
      if (unsignedContracts.length > 0) a.push({ color: '#C9922E', text: `${unsignedContracts.length} unsigned contract${unsignedContracts.length !== 1 ? 's' : ''} (7+ days)`, link: '/contracts' })

      // Past events without invoices
      const pastEventsNoInvoice = (eventsRes.data || []).filter(e => {
        if (!e.date) return false
        const ds = daysSince(e.date)
        return ds !== null && ds > 0
      })
      if (pastEventsNoInvoice.length > 0) a.push({ color: '#C9922E', text: `${pastEventsNoInvoice.length} past event${pastEventsNoInvoice.length !== 1 ? 's' : ''} without invoices`, link: '/scheduling' })

      setAlerts(a)
      setAlertsLoading(false)
    }).catch(err => {
      if (import.meta.env.DEV) console.error('Hub stats error:', err)
      setAlertsLoading(false)
    })
  }, [])

  return (
    <div className="hub">
      <div className="hub-header">
        <h1>Sheepdog HQ</h1>
        <p>Operations dashboard for Sheepdog Security LLC</p>
      </div>
      <div className="hub-briefing-section">
        {briefing ? (
          <div className="hub-briefing">
            <div className="hub-briefing-header">
              <span className="hub-briefing-label">AI Briefing</span>
              <button className="hub-briefing-refresh" onClick={fetchBriefing} disabled={briefingLoading}>
                {briefingLoading ? 'Updating...' : 'Refresh'}
              </button>
            </div>
            <div className="hub-briefing-text">{briefing}</div>
          </div>
        ) : (
          <button className="hub-briefing-btn" onClick={fetchBriefing} disabled={briefingLoading}>
            {briefingLoading ? (
              <span>Generating briefing...</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 0 1 10 10c0 6-10 12-10 12S2 18 2 12A10 10 0 0 1 12 2z"/></svg>
                Get Today's Briefing
              </>
            )}
          </button>
        )}
        {briefingError && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 6 }}>{briefingError}</div>}
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
      {alertsLoading ? (
        <div style={{ color: 'var(--steel)', fontSize: 13, fontFamily: 'var(--fh)', padding: '8px 0' }}>Checking alerts...</div>
      ) : alerts.length > 0 ? (
        <div className="hub-alerts">
          {alerts.map((a, i) => (
            <Link key={i} to={a.link} className="hub-alert" style={{ borderLeftColor: a.color }}>
              <span style={{ color: a.color, fontWeight: 700 }}>●</span> {a.text}
            </Link>
          ))}
        </div>
      ) : null}
      <div
        className={`hub-upload-zone${dragOver ? ' hub-upload-zone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => uploadInputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Upload a photo for AI analysis"
      >
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
        />
        {uploadLoading ? (
          <span style={{ color: 'var(--steel)', fontSize: 14 }}>Analyzing image...</span>
        ) : (
          <>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--steel)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Drop a photo or click to upload — W-9, license, text message, business card, invoice</span>
          </>
        )}
      </div>
      {uploadError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{uploadError}</div>}
      {uploadResult && (
        <div className="ai-result-card" style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--white)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: uploadResult.actions_taken?.length ? 10 : 0 }}>
            {uploadResult.summary}
          </div>
          {uploadResult.actions_taken?.length > 0 && (
            <div className="intake-actions">
              {uploadResult.actions_taken.map((action, j) => (
                <Link key={j} to={action.table === 'pipeline' ? '/pipeline' : action.table === 'clients' ? '/clients' : action.table === 'events' ? '/scheduling' : action.table === 'invoices' ? '/financials' : action.table === 'contracts' ? '/contracts' : '/compliance'} className="intake-action-card" style={{ textDecoration: 'none' }}>
                  <span className="intake-action-badge" style={{ background: action.table === 'pipeline' ? '#3D5A80' : action.table === 'clients' ? '#357A38' : action.table === 'events' ? '#C9922E' : action.table === 'invoices' ? '#D4483A' : '#7A8490' }}>
                    {action.table === 'pipeline' ? 'LEAD' : action.table.toUpperCase()}
                  </span>
                  <span className="intake-action-label">{action.label}</span>
                  {action.extra && <span className="intake-action-extra">{action.extra}</span>}
                  <span className="intake-action-status">{action.status}</span>
                </Link>
              ))}
            </div>
          )}
          <button className="modal-btn-cancel" style={{ marginTop: 10, fontSize: 12 }} onClick={() => setUploadResult(null)}>Dismiss</button>
        </div>
      )}
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
