import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { COLORS } from '../lib/format'

const CONTRACT_CATEGORIES = ['Client Contracts — Events', 'Client Contracts — Staffing', 'Staff & Contractor', 'Reporting & Operations']

const resources = [
  // ─── BRAND ───
  { title: 'Color Palette', desc: 'Primary, secondary, accent, and neutral colors with hex codes and usage guidance', file: '/docs/Sheepdog_01_Color_Palette.html', category: 'Brand' },
  { title: 'Typography System', desc: 'Heading and body fonts, type scale, sizes, weights, and spacing', file: '/docs/Sheepdog_02_Typography_System.html', category: 'Brand' },
  { title: 'Visual Standards Guide', desc: 'Logo usage, color application, imagery style, and file format rules', file: '/docs/Sheepdog_03_Visual_Standards_Guide.html', category: 'Brand' },
  { title: 'Events Brand Identity', desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Events', file: '/docs/Sheepdog_04_Events_Brand_Identity.html', category: 'Brand' },
  { title: 'Staffing Brand Identity', desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Staffing', file: '/docs/Sheepdog_05_Staffing_Brand_Identity.html', category: 'Brand' },
  // ─── GOOGLE BUSINESS ───
  { title: 'GBP Description & Keywords', desc: 'Google Business Profile description, category recommendations, and target keyword list', file: '/docs/deliverable-08-gbp-description-keywords.html', category: 'Google Business' },
  { title: 'GBP Photo Structure', desc: 'Photo categories, shot list, naming conventions, and upload cadence', file: '/docs/deliverable-09-gbp-photo-standards.html', category: 'Google Business' },
  // ─── OUTREACH ───
  { title: 'Instagram Cold Outreach Strategy', desc: 'DM scripts, target lists, follow-up sequences for Events and Staffing', file: '/docs/instagram-cold-outreach-strategy.html', category: 'Outreach' },
  { title: 'Events Outreach Targets', desc: 'Target accounts, hashtags, and venues for event security and bartending leads', file: '/docs/events-outreach-targets.html', category: 'Outreach' },
  { title: 'Staffing Outreach Targets', desc: 'Target companies, industries, and contacts for staffing leads', file: '/docs/staffing-outreach-targets.html', category: 'Outreach' },
  // ─── REVIEWS ───
  { title: 'Business Card (3.5 x 2)', desc: 'Front and back business card with review QR code. Standard wallet size.', file: '/docs/sheepdog-review-card.html', category: 'Reviews' },
  { title: 'Review Flyer (4 x 6)', desc: 'Larger print-ready review card for handouts and table displays.', file: '/docs/sheepdog-review-flyer.html', category: 'Reviews' },
  { title: 'Review Staff Script', desc: 'Word-for-word scripts for asking clients for Google reviews', file: '/docs/review-staff-script.html', category: 'Reviews' },
  { title: 'Review Response Templates', desc: 'Pre-built replies for positive, neutral, and negative Google reviews', file: '/docs/review-response-templates.html', category: 'Reviews' },
  { title: 'Review Momentum Strategy', desc: 'System for building and maintaining a steady flow of Google reviews', file: '/docs/review-momentum-strategy.html', category: 'Reviews' },
  // ─── CLIENT CONTRACTS (EVENTS) ───
  { title: 'Event Security Agreement', desc: 'Single-event security contract with liability, cancellation, and payment terms', file: '/docs/01-event-security-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Mobile Bartending Agreement', desc: 'Bartending contract with TABC compliance, alcohol liability, and tip policy', file: '/docs/02-mobile-bartending-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Combined Security & Bartending', desc: 'Merged contract for clients booking both security and bartending', file: '/docs/03-combined-security-bartending-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Recurring Event Contract', desc: 'Rolling contract for venues with ongoing weekly shifts and rate lock', file: '/docs/04-recurring-event-contract.html', category: 'Client Contracts — Events' },
  // ─── CLIENT CONTRACTS (STAFFING) ───
  { title: 'Staffing Services Agreement', desc: 'Master service agreement for B2B staffing with billing and non-solicitation terms', file: '/docs/05-staffing-services-agreement.html', category: 'Client Contracts — Staffing' },
  { title: 'Project-Based Staffing SOW', desc: 'Statement of work for specific projects with duration, headcount, and deliverables', file: '/docs/06-project-based-staffing-sow.html', category: 'Client Contracts — Staffing' },
  { title: 'Ongoing Placement Agreement', desc: 'Long-term recurring placement contract with schedule, rate, and auto-renewal', file: '/docs/07-ongoing-placement-agreement.html', category: 'Client Contracts — Staffing' },
  // ─── STAFF & CONTRACTOR ───
  { title: 'Independent Contractor Agreement', desc: '1099 contractor agreement with pay rate, code of conduct, non-compete, and termination', file: '/docs/08-independent-contractor-agreement.html', category: 'Staff & Contractor' },
  { title: 'W-9 Request Form', desc: 'Template for requesting W-9 tax forms from contractors', file: '/docs/09-w9-request-form.html', category: 'Staff & Contractor' },
  { title: 'TABC Compliance Acknowledgment', desc: 'Staff certification of valid TABC cert and alcohol service law compliance', file: '/docs/10-tabc-compliance-acknowledgment.html', category: 'Staff & Contractor' },
  { title: 'Background Check Authorization', desc: 'Consent form for running background checks on staff', file: '/docs/11-background-check-authorization.html', category: 'Staff & Contractor' },
  { title: 'NDA / Confidentiality Agreement', desc: 'Protects client info, venue details, and Sheepdog business data', file: '/docs/12-nda-confidentiality-agreement.html', category: 'Staff & Contractor' },
  // ─── REPORTING & OPERATIONS ───
  { title: 'Incident Report Form', desc: 'Document security incidents, injuries, or notable events during a shift', file: '/docs/13-incident-report-form.html', category: 'Reporting & Operations' },
  { title: 'Post-Event Report', desc: 'Team lead report after each job: attendance, issues, client feedback, follow-ups', file: '/docs/14-post-event-report.html', category: 'Reporting & Operations' },
  { title: 'Table & Chair Rental Agreement', desc: 'Rental contract for tables and chairs with quantities, delivery, and damage terms', file: '/docs/15-table-chair-rental-agreement.html', category: 'Reporting & Operations' },
  { title: 'Equipment Inventory Checklist', desc: 'Track equipment issued and returned per event', file: '/docs/16-equipment-inventory-checklist.html', category: 'Reporting & Operations' },
  { title: 'Event Setup/Takedown Agreement', desc: 'Contract for setup, takedown, and cleanup services with scope and timing', file: '/docs/17-event-setup-takedown-cleanup-agreement.html', category: 'Reporting & Operations' },
  { title: 'Setup/Takedown Walkthrough', desc: 'Pre and post-event walkthrough checklist for venue condition documentation', file: '/docs/18-setup-takedown-walkthrough-checklist.html', category: 'Reporting & Operations' },
]

const categories = [...new Set(resources.map(r => r.category))]

/* ═══════════════════════════════════════════════════════════
   FILL & SEND CONTRACT MODAL
   ═══════════════════════════════════════════════════════════ */
function FillSendModal({ resource, onClose, showToast }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [step, setStep] = useState('fill') // fill, preview, send
  const [templateHtml, setTemplateHtml] = useState('')
  const [fields, setFields] = useState([])
  const [values, setValues] = useState({})
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Load template and extract fields
  useEffect(() => {
    fetch(resource.file)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
      .then(html => {
        setTemplateHtml(html)
        const matches = html.match(/<span class="field">\[([^\]]+)\]/g) || []
        const fieldNames = [...new Set(matches.map(m => m.replace(/<span class="field">\[/, '').replace(/\].*/, '')))]
        setFields(fieldNames)
        const initial = {}
        fieldNames.forEach(f => { initial[f] = '' })
        setValues(initial)
      })
      .catch(err => { setError(`Failed to load template: ${err.message}`); if (import.meta.env.DEV) console.error('Template fetch:', err) })
    supabase.from('clients').select('id, contact_name, business_name, email, phone').order('business_name').then(({ data }) => setClients(data || []))
  }, [resource.file])

  // Auto-fill from selected client
  useEffect(() => {
    if (!selectedClient) return
    const c = clients.find(cl => cl.id === selectedClient)
    if (!c) return
    setSignerEmail(c.email || '')
    setValues(prev => {
      const next = { ...prev }
      // Try to match common field names
      const name = c.contact_name || ''
      const biz = c.business_name || ''
      Object.keys(next).forEach(key => {
        const k = key.toUpperCase()
        if (k.includes('CLIENT NAME') || k.includes('CUSTOMER NAME') || k.includes('CONTRACTOR NAME') || k.includes('SIGNER')) next[key] = name
        if (k.includes('COMPANY') || k.includes('BUSINESS NAME') || k.includes('ORGANIZATION')) next[key] = biz
        if (k.includes('CLIENT EMAIL') || k.includes('EMAIL ADDRESS')) next[key] = c.email || ''
        if (k.includes('CLIENT PHONE') || k.includes('PHONE')) next[key] = c.phone || ''
      })
      return next
    })
  }, [selectedClient, clients])

  const filledHtml = (() => {
    if (!templateHtml) return ''
    let html = templateHtml
    Object.entries(values).forEach(([field, val]) => {
      const escaped = (val || `[${field}]`).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const regex = new RegExp(`<span class="field">\\[${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]</span>`, 'g')
      html = html.replace(regex, `<span class="field" style="border:none;background:none;color:inherit;padding:0;">${escaped}</span>`)
    })
    return html
  })()

  const handleSend = async () => {
    if (!signerEmail) { setError('Enter a signer email'); return }
    setSaving(true); setError('')
    // Create contract in DB
    const { data: contract, error: insertErr } = await supabase.from('contracts').insert([{
      client_id: selectedClient || null,
      template_name: resource.title,
      title: resource.title,
      status: 'draft',
      field_values: values,
      filled_html: filledHtml,
      signer_email: signerEmail,
    }]).select().single()

    if (insertErr || !contract) { setError(insertErr?.message || 'Failed to create contract'); setSaving(false); return }

    // Send via edge function
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { setError('Session expired. Please refresh and try again.'); setSaving(false); return }
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ contract_id: contract.id }),
    })
    const result = await res.json()
    setSaving(false)
    if (!result.success) { setError(result.error || 'Failed to send'); return }
    showToast('Contract sent for signing')
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <h2 className="modal-title">{resource.title}</h2>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['fill', 'preview', 'send'].map(s => (
            <button key={s} onClick={() => setStep(s)} style={{
              padding: '4px 14px', borderRadius: 4, border: '1px solid', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer',
              background: step === s ? COLORS.blue : 'transparent', borderColor: step === s ? COLORS.blue : 'rgba(255,255,255,0.15)', color: step === s ? '#fff' : 'var(--steel)'
            }}>{s === 'fill' ? '1. Fill Fields' : s === 'preview' ? '2. Preview' : '3. Send'}</button>
          ))}
        </div>

        {/* STEP 1: Fill Fields */}
        {step === 'fill' && (
          <div className="modal-form">
            <label className="modal-field" style={{ marginBottom: 16 }}>
              <span>Auto-fill from Client</span>
              <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                <option value="">Select client (optional)...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
              </select>
            </label>
            {fields.length === 0 ? (
              <p style={{ color: 'var(--steel)', fontSize: 14 }}>Loading template fields...</p>
            ) : (
              fields.map(f => (
                <label key={f} className="modal-field" style={{ marginBottom: 10 }}>
                  <span>{f}</span>
                  <input value={values[f] || ''} onChange={e => setValues({ ...values, [f]: e.target.value })} placeholder={`Enter ${f.toLowerCase()}`} />
                </label>
              ))
            )}
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
              <button className="modal-btn-save" onClick={() => setStep('preview')} disabled={!Object.values(values).some(v => v.trim())}>Preview Contract</button>
            </div>
          </div>
        )}

        {/* STEP 2: Preview */}
        {step === 'preview' && (
          <div>
            <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxHeight: 500, overflow: 'auto', border: '1px solid rgba(255,255,255,0.1)' }}>
              <iframe srcDoc={filledHtml} sandbox="allow-same-origin" style={{ width: '100%', height: 500, border: 'none', background: '#fff' }} title="Contract Preview" />
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="modal-btn-cancel" onClick={() => setStep('fill')}>Back to Edit</button>
              <button className="modal-btn-save" onClick={() => setStep('send')} disabled={!signerEmail.trim()}>Continue to Send</button>
            </div>
          </div>
        )}

        {/* STEP 3: Send */}
        {step === 'send' && (
          <div className="modal-form">
            <label className="modal-field">
              <span>Signer Email *</span>
              <input type="email" required value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="client@example.com" />
            </label>
            <p style={{ fontSize: 13, color: 'var(--steel)', margin: '8px 0 16px' }}>
              The signer will receive an email with a link to review and electronically sign this contract. Replies go to sheepdogsecurityllc@gmail.com.
            </p>
            {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</p>}
            <div className="modal-actions">
              <button className="modal-btn-cancel" onClick={() => setStep('preview')}>Back</button>
              <button className="modal-btn-save" disabled={saving} onClick={handleSend}>{saving ? 'Sending...' : 'Send for Signing'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN RESOURCES PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Resources() {
  const [open, setOpen] = useState(categories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {}))
  const [deadLinks, setDeadLinks] = useState(new Set())
  const [fillSend, setFillSend] = useState(null)
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)

  useEffect(() => {
    const controller = new AbortController()
    resources.filter(r => r.file).forEach(r => {
      fetch(r.file, { method: 'HEAD', signal: controller.signal }).then(res => {
        if (!res.ok) setDeadLinks(prev => new Set([...prev, r.file]))
      }).catch(e => { if (e.name !== 'AbortError') setDeadLinks(prev => new Set([...prev, r.file])) })
    })
    return () => controller.abort()
  }, [])

  const toggle = (cat) => setOpen(prev => ({ ...prev, [cat]: !prev[cat] }))
  const isContract = (cat) => CONTRACT_CATEGORIES.includes(cat)

  return (
    <div className="resources">
      <div className="resources-header">
        <h1>Resources</h1>
        <p>Strategy docs, contracts, templates, and brand guides</p>
      </div>
      {categories.map((cat) => (
        <div key={cat} className="resource-section">
          <button
            className={`resource-section-header ${open[cat] ? 'open' : ''}`}
            onClick={() => toggle(cat)}
          >
            <span className="resource-section-title">{cat}</span>
            <span className="resource-section-count">{resources.filter(r => r.category === cat).length}</span>
            <svg className="resource-section-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div className={`resource-section-body ${open[cat] ? 'open' : ''}`}>
            <div className="resources-grid">
              {resources.filter(r => r.category === cat).map((res) => (
                deadLinks.has(res.file) ? (
                  <div key={res.title} className="resource-card resource-card--locked">
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                    <span className="resource-card-badge" style={{ background: '#C23B2222', color: '#C23B22' }}>Missing File</span>
                  </div>
                ) : (
                  <div key={res.title} className="resource-card" style={{ cursor: 'default' }}>
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <a href={res.file} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.blue, textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>View</a>
                      {isContract(cat) && (
                        <button onClick={() => setFillSend(res)}
                          style={{ background: 'none', border: 'none', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.amber, cursor: 'pointer' }}>Fill & Send</button>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      ))}

      {fillSend && <FillSendModal resource={fillSend} onClose={() => setFillSend(null)} showToast={showToast} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
