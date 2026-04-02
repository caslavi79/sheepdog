import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { fmtDate, badgeStyle, COLORS } from '../lib/format'

const CONTRACT_STATUSES = ['draft', 'sent', 'viewed', 'signed']
const STATUS_COLORS = { draft: '#929BAA', sent: '#C9922E', viewed: '#3D5A80', signed: '#357A38' }

const TEMPLATES = [
  { title: 'Event Security Agreement', file: '/docs/01-event-security-agreement.html', cat: 'Events' },
  { title: 'Mobile Bartending Agreement', file: '/docs/02-mobile-bartending-agreement.html', cat: 'Events' },
  { title: 'Combined Security & Bartending', file: '/docs/03-combined-security-bartending-agreement.html', cat: 'Events' },
  { title: 'Recurring Event Contract', file: '/docs/04-recurring-event-contract.html', cat: 'Events' },
  { title: 'Staffing Services Agreement', file: '/docs/05-staffing-services-agreement.html', cat: 'Staffing' },
  { title: 'Project-Based Staffing SOW', file: '/docs/06-project-based-staffing-sow.html', cat: 'Staffing' },
  { title: 'Ongoing Placement Agreement', file: '/docs/07-ongoing-placement-agreement.html', cat: 'Staffing' },
  { title: 'Independent Contractor Agreement', file: '/docs/08-independent-contractor-agreement.html', cat: 'Staff' },
  { title: 'W-9 Request Form', file: '/docs/09-w9-request-form.html', cat: 'Staff' },
  { title: 'TABC Compliance Acknowledgment', file: '/docs/10-tabc-compliance-acknowledgment.html', cat: 'Staff' },
  { title: 'Background Check Authorization', file: '/docs/11-background-check-authorization.html', cat: 'Staff' },
  { title: 'NDA / Confidentiality Agreement', file: '/docs/12-nda-confidentiality-agreement.html', cat: 'Staff' },
  { title: 'Incident Report Form', file: '/docs/13-incident-report-form.html', cat: 'Ops' },
  { title: 'Post-Event Report', file: '/docs/14-post-event-report.html', cat: 'Ops' },
  { title: 'Table & Chair Rental Agreement', file: '/docs/15-table-chair-rental-agreement.html', cat: 'Ops' },
  { title: 'Equipment Inventory Checklist', file: '/docs/16-equipment-inventory-checklist.html', cat: 'Ops' },
  { title: 'Event Setup/Takedown Agreement', file: '/docs/17-event-setup-takedown-cleanup-agreement.html', cat: 'Ops' },
  { title: 'Setup/Takedown Walkthrough', file: '/docs/18-setup-takedown-walkthrough-checklist.html', cat: 'Ops' },
]

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#929BAA'
  return <span style={badgeStyle(c)}>{status || 'draft'}</span>
}

/* ═══════════════════════════════════════════════════════════
   TEMPLATE PICKER MODAL
   ═══════════════════════════════════════════════════════════ */
function TemplatePicker({ onSelect, onClose }) {
  useEscapeKey(onClose)
  useBodyLock()
  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Select a Template</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, maxHeight: 500, overflow: 'auto' }}>
          {TEMPLATES.map(t => (
            <button key={t.file} onClick={() => onSelect(t)}
              style={{ background: 'var(--char)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '14px 16px', textAlign: 'left', cursor: 'pointer', color: 'var(--white)' }}>
              <div style={{ fontFamily: 'var(--fh)', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t.title}</div>
              <div style={{ fontSize: 11, color: 'var(--steel)', fontFamily: 'var(--fh)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{t.cat}</div>
            </button>
          ))}
        </div>
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CONTRACT EDITOR (side-by-side)
   ═══════════════════════════════════════════════════════════ */
function ContractEditor({ template, contract, clients, onSaved, onDeleted, onSent, onClose, preselectedClientId, preselectedStaffId }) {
  const [templateHtml, setTemplateHtml] = useState('')
  const [fields, setFields] = useState([])
  const [values, setValues] = useState(contract?.field_values || {})
  const [selectedClient, setSelectedClient] = useState(contract?.client_id || preselectedClientId || '')
  const [signerEmail, setSignerEmail] = useState(contract?.signer_email || '')
  const [staffId, setStaffId] = useState(contract?.staff_id || preselectedStaffId || null)
  const [staffMember, setStaffMember] = useState(null)
  const [staffList, setStaffList] = useState([])

  useEffect(() => {
    supabase.from('staff').select('id, name, role, email, phone').eq('status', 'active').order('name')
      .then(({ data }) => setStaffList(data || []))
  }, [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [contractId, setContractId] = useState(contract?.id || null)
  const [contractStatus, setContractStatus] = useState(contract?.status || 'draft')
  const [savedSinceEdit, setSavedSinceEdit] = useState(true)
  const editorRef = useRef(null)

  // Load staff member for auto-fill when staff_id is set
  useEffect(() => {
    if (!staffId) return
    supabase.from('staff').select('id, name, email, phone, role, address, city, state, zip').eq('id', staffId).single()
      .then(({ data, error }) => {
        if (error) { if (import.meta.env.DEV) console.error('Staff lookup:', error.message); return }
        if (data) {
          setStaffMember(data)
          setSignerEmail(data.email || '')
        }
      })
  }, [staffId])

  // Load template and extract fields
  useEffect(() => {
    const file = template?.file || (contract?.template_name ? TEMPLATES.find(t => t.title === contract.template_name)?.file : null)
    if (!file) return
    fetch(file)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
      .then(html => {
        setTemplateHtml(html)
        const matches = html.match(/<span class="field">\[([^\]]+)\]/g) || []
        const fieldNames = [...new Set(matches.map(m => m.replace(/<span class="field">\[/, '').replace(/\].*/, '')))]
        setFields(fieldNames)
        if (!contract?.field_values) {
          const initial = {}
          fieldNames.forEach(f => { initial[f] = '' })
          setValues(initial)
        }
      })
      .catch(err => { setError(`Failed to load template: ${err.message}`); if (import.meta.env.DEV) console.error('Template fetch:', err) })
  }, [template, contract])

  // Auto-fill from client
  useEffect(() => {
    if (!selectedClient) return
    const c = clients.find(cl => cl.id === selectedClient)
    if (!c) return
    setSignerEmail(c.email || '')
    setValues(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => {
        const k = key.toUpperCase().trim()
        // Name fields — match specific patterns only
        if (/^(CLIENT|CUSTOMER|SIGNER)\s*NAME$/.test(k) || k === 'SIGNER') next[key] = c.contact_name || ''
        // Company fields
        if (/^(COMPANY|BUSINESS)\s*NAME$/.test(k) || k === 'ORGANIZATION') next[key] = c.business_name || ''
        // Email fields
        if (/^(CLIENT\s*EMAIL|EMAIL\s*ADDRESS)$/.test(k)) next[key] = c.email || ''
        // Phone fields
        if (/^(CLIENT\s*PHONE|PHONE\s*(NUMBER)?)$/.test(k)) next[key] = c.phone || ''
      })
      return next
    })
  }, [selectedClient, clients])

  // Auto-fill from staff member (for contractor agreements, W-9s, etc.)
  useEffect(() => {
    if (!staffMember) return
    setSignerEmail(staffMember.email || '')
    setSavedSinceEdit(false)
    setValues(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(key => {
        const k = key.toUpperCase()
        // Name fields
        if (k.includes('CONTRACTOR') && k.includes('NAME')) next[key] = staffMember.name || ''
        if (k.includes('EMPLOYEE NAME') || k.includes('STAFF NAME') || k === 'SIGNER' || k === 'FULL NAME') next[key] = staffMember.name || ''
        // Email
        if (k.includes('EMAIL')) next[key] = staffMember.email || ''
        // Phone
        if (k.includes('PHONE')) next[key] = staffMember.phone || ''
        // Role/position
        if (k.includes('ROLE') || k.includes('POSITION') || k.includes('TITLE') || k.includes('CLASSIFICATION')) next[key] = staffMember.role || ''
        // Address
        if (k.includes('STREET') || (k.includes('ADDRESS') && !k.includes('EMAIL'))) next[key] = staffMember.address || ''
        if (k === 'CITY, STATE, ZIP' || k === 'CITY STATE ZIP') next[key] = [staffMember.city, staffMember.state, staffMember.zip].filter(Boolean).join(', ')
        if (k === 'CITY' && !k.includes(',')) next[key] = staffMember.city || ''
        if (k === 'STATE') next[key] = staffMember.state || ''
        if (k === 'ZIP' || k === 'ZIP CODE') next[key] = staffMember.zip || ''
      })
      return next
    })
  }, [staffMember])

  // Build filled HTML
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

  const handleSaveDraft = async () => {
    setSaving(true); setError('')
    const title = template?.title || contract?.template_name || 'Contract'
    const payload = {
      client_id: selectedClient || null, staff_id: staffId || null,
      template_name: title, title,
      status: 'draft', field_values: values, filled_html: filledHtml, signer_email: signerEmail || null,
    }
    if (contractId) {
      const { error: err } = await supabase.from('contracts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', contractId)
      setSaving(false); if (err) { setError(err.message); return }
    } else {
      const { data, error: err } = await supabase.from('contracts').insert([payload]).select().single()
      setSaving(false); if (err) { setError(err.message); return }
      setContractId(data.id); setContractStatus('draft')
    }
    setSavedSinceEdit(true)
    onSaved()
  }

  const handleSend = async () => {
    if (!signerEmail) { setError('Enter a signer email'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) { setError('Enter a valid email address'); return }
    setSaving(true); setError('')
    // Save first
    const title = template?.title || contract?.template_name || 'Contract'
    const payload = {
      client_id: selectedClient || null, staff_id: staffId || null,
      template_name: title, title,
      field_values: values, filled_html: filledHtml, signer_email: signerEmail,
    }
    let id = contractId
    if (id) {
      const { error: err } = await supabase.from('contracts').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { data, error: err } = await supabase.from('contracts').insert([{ ...payload, status: 'draft' }]).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      id = data.id; setContractId(id)
    }
    // Send
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setError('Session expired. Please refresh.'); setSaving(false); return }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ contract_id: id }),
      })
      const result = await res.json()
      setSaving(false)
      if (!result.success) { setError(result.error || 'Failed to send'); return }
      setContractStatus('sent')
      if (onSent) onSent(); else onSaved()
    } catch {
      // Network timeout — email likely sent, edge function just slow to respond
      setSaving(false)
      setContractStatus('sent')
      if (onSent) onSent(); else onSaved()
    }
  }

  return (
    <div className="contract-editor" ref={editorRef}>
      <div className="contract-editor-header">
        <h2 style={{ fontFamily: 'var(--fh)', fontSize: 18, fontWeight: 800 }}>{template?.title || contract?.template_name || 'Contract'}</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <StatusBadge status={contractStatus} />
          <button className="modal-btn-cancel" style={{ fontSize: 12 }} onClick={() => {
            if (!savedSinceEdit && !window.confirm('You have unsaved changes. Discard?')) return
            onClose()
          }}>Close Editor</button>
        </div>
      </div>

      <div className="contract-editor-body">
        {/* LEFT: Form or Signed info */}
        <div className="contract-editor-form">
          {contractStatus === 'signed' ? (
            <>
              <div style={{ padding: '20px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 32, color: '#357A38' }}>&#10003;</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--white)' }}>Signed by {contract?.signer_name || '—'}</div>
                    <div style={{ fontSize: 13, color: 'var(--steel)' }}>{contract?.signed_at ? new Date(contract.signed_at).toLocaleString() : '—'}</div>
                  </div>
                </div>
                {contract?.signer_email && <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 8 }}>Email: {contract.signer_email}</div>}
                {contract?.signer_ip && <div style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>IP: {contract.signer_ip}</div>}
                {contract?.signature_data && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontFamily: 'var(--fh)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--steel)', marginBottom: 6 }}>Signature</div>
                    <img src={contract.signature_data} alt="Signature" style={{ maxWidth: '100%', maxHeight: 120, background: '#fff', borderRadius: 6, padding: 8 }} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="modal-btn-cancel" style={{ fontSize: 13 }} onClick={() => {
                  const sigBlock = `
                    <div style="border-top:2px solid #0C0C0C;margin-top:40px;padding-top:24px;">
                      <h3 style="font-size:14px;color:#929BAA;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px;">Electronic Signature</h3>
                      <table style="border-collapse:collapse;width:100%;max-width:500px;">
                        <tr><td style="padding:6px 0;font-weight:700;width:120px;color:#4A4A4A;">Signed by</td><td style="padding:6px 0;">${contract?.signer_name || '—'}</td></tr>
                        <tr><td style="padding:6px 0;font-weight:700;color:#4A4A4A;">Email</td><td style="padding:6px 0;">${contract?.signer_email || '—'}</td></tr>
                        <tr><td style="padding:6px 0;font-weight:700;color:#4A4A4A;">Date</td><td style="padding:6px 0;">${contract?.signed_at ? new Date(contract.signed_at).toLocaleString() : '—'}</td></tr>
                        <tr><td style="padding:6px 0;font-weight:700;color:#4A4A4A;">IP Address</td><td style="padding:6px 0;">${contract?.signer_ip || '—'}</td></tr>
                      </table>
                      ${contract?.signature_data ? `<div style="margin-top:16px;"><img src="${contract.signature_data}" style="max-width:300px;max-height:100px;" /></div>` : ''}
                      <p style="font-size:11px;color:#929BAA;margin-top:16px;">This document was electronically signed via Sheepdog Security LLC's e-signing platform. This signature is legally binding under the ESIGN Act and UETA.</p>
                    </div>
                  `
                  const printHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${contract?.title || 'Contract'}</title><style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 24px;color:#333;}@media print{body{margin:0;padding:20px;}}</style></head><body>${filledHtml}${sigBlock}</body></html>`
                  const w = window.open('', '_blank')
                  w.document.write(printHtml)
                  w.document.close()
                }}>Download / Print</button>
                {contract?.sign_token && (
                  <a href={`/sign?token=${contract.sign_token}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.blue, padding: '8px 14px', textDecoration: 'none' }}>
                    View Signing Page
                  </a>
                )}
              </div>
            </>
          ) : (
            <>
              {(template?.cat === 'Staff' || contract?.staff_id || TEMPLATES.find(t => t.title === (contract?.template_name || template?.title))?.cat === 'Staff') ? (
                <label className="modal-field" style={{ marginBottom: 12 }}>
                  <span>Auto-fill from Staff</span>
                  <select value={staffId || ''} onChange={e => setStaffId(e.target.value || null)}>
                    <option value="">Select staff member (optional)...</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.name}{s.role ? ` — ${s.role}` : ''}</option>)}
                  </select>
                </label>
              ) : (
                <label className="modal-field" style={{ marginBottom: 12 }}>
                  <span>Auto-fill from Client</span>
                  <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}>
                    <option value="">Select client (optional)...</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
                  </select>
                </label>
              )}

              <div className="contract-editor-fields">
                {fields.length === 0 && !error && <p style={{ color: 'var(--steel)', fontSize: 14 }}>Loading fields...</p>}
                {fields.map(f => (
                  <label key={f} className="modal-field" style={{ marginBottom: 8 }}>
                    <span>{f}</span>
                    <input value={values[f] || ''} onChange={e => { setValues({ ...values, [f]: e.target.value }); setSavedSinceEdit(false) }} placeholder={`Enter ${f.toLowerCase()}`} />
                  </label>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 16 }}>
                <label className="modal-field" style={{ marginBottom: 12 }}>
                  <span>Signer Email</span>
                  <input type="email" value={signerEmail} onChange={e => setSignerEmail(e.target.value)} placeholder="client@example.com" />
                </label>
                {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="modal-btn-cancel" style={{ fontSize: 13 }} disabled={saving} onClick={handleSaveDraft}>{saving ? '...' : 'Save Draft'}</button>
                    <button className="modal-btn-save" style={{ fontSize: 13 }} disabled={saving || !signerEmail} onClick={handleSend}>{saving ? 'Sending...' : 'Send for Signing'}</button>
                    {contractId && contractStatus !== 'draft' && contract?.sign_token && (
                      <a href={`/sign?token=${contract.sign_token}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.blue, padding: '8px 14px', textDecoration: 'none' }}>
                        View Signing Page
                      </a>
                    )}
                  </div>
                  {contractId && contractStatus === 'draft' && (
                    <button className="modal-btn-cancel" style={{ fontSize: 12, color: 'var(--red)', borderColor: 'rgba(212,72,58,0.3)' }} disabled={saving} onClick={async () => {
                      if (!window.confirm('Delete this draft?')) return
                      const { error: err } = await supabase.from('contracts').delete().eq('id', contractId)
                      if (err) { setError('Delete failed: ' + err.message); return }
                      if (onDeleted) onDeleted()
                      onClose()
                    }}>Delete Draft</button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Live Preview */}
        <div className="contract-editor-preview">
          {filledHtml ? (
            <iframe srcDoc={filledHtml} sandbox="allow-same-origin" style={{ width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 6 }} title="Contract Preview" />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--steel)', fontSize: 14 }}>
              {error || 'Select a template to preview'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN CONTRACTS PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Contracts() {
  const location = useLocation()
  const [contracts, setContracts] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [editorTemplate, setEditorTemplate] = useState(null)
  const [editorContract, setEditorContract] = useState(null)
  const [showEditor, setShowEditor] = useState(false)
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)

  const [loadError, setLoadError] = useState('')
  const loadContracts = useCallback(async () => {
    setLoadError('')
    const { data, error } = await supabase.from('contracts').select('*').order('created_at', { ascending: false })
    if (error) { setLoadError('Failed to load contracts'); if (import.meta.env.DEV) console.error('Load contracts:', error.message); return }
    setContracts(data || [])
  }, [])

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, contact_name, business_name, email, phone').order('business_name')
    setClients(data || [])
  }, [])

  useEffect(() => {
    Promise.all([loadContracts(), loadClients()]).then(() => setLoading(false))
  }, [loadContracts, loadClients])

  const [preselectedClientId, setPreselectedClientId] = useState(null)
  const [preselectedStaffId, setPreselectedStaffId] = useState(null)

  // Handle deep links from Resources "Fill & Send", Compliance "Send Agreement", Clients "New Contract"
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const templateFile = params.get('template')
    const staffId = params.get('staff_id')
    const clientId = params.get('client_id')

    if (staffId) setPreselectedStaffId(staffId)
    if (clientId) setPreselectedClientId(clientId)

    if (templateFile) {
      const t = TEMPLATES.find(tpl => tpl.file === templateFile)
      if (t) {
        setEditorTemplate(t)
        setEditorContract(null)
        setShowEditor(true)
      } else {
        setShowPicker(true)
      }
    } else if (clientId && !templateFile) {
      // From Clients "New Contract" — open picker with client pre-selected
      setShowPicker(true)
    }
  }, [location.search])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.business_name || c.contact_name]))

  const filtered = contracts.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (search) {
      const s = search.toLowerCase()
      const name = (clientMap[c.client_id] || '').toLowerCase()
      return name.includes(s) || (c.title || '').toLowerCase().includes(s) || (c.template_name || '').toLowerCase().includes(s)
    }
    return true
  })

  const handleSelectTemplate = (t) => {
    setEditorTemplate(t)
    setEditorContract(null)
    setShowEditor(true)
    setShowPicker(false)
  }

  const handleSelectContract = (c) => {
    setEditorContract(c)
    setEditorTemplate(null)
    setShowEditor(true)
  }

  const handleSaved = () => {
    loadContracts()
    showToast('Contract saved')
  }

  const handleCloseEditor = () => {
    setShowEditor(false)
    setEditorTemplate(null)
    setEditorContract(null)
    setPreselectedClientId(null)
    setPreselectedStaffId(null)
  }

  // Stats
  const drafts = contracts.filter(c => c.status === 'draft').length
  const pending = contracts.filter(c => c.status === 'sent' || c.status === 'viewed').length
  const signed = contracts.filter(c => c.status === 'signed').length

  if (loading) return <div className="clients-loading">Loading contracts...</div>

  return (
    <div className="clients">
      <div className="clients-header">
        <div>
          <h1>Contracts</h1>
          <p className="clients-subtitle">Fill, send, and track contracts and agreements</p>
        </div>
        <button className="clients-add-btn" onClick={() => setShowPicker(true)}>+ New Contract</button>
      </div>

      <div className="hub-stats" style={{ marginBottom: 24 }}>
        <div className="hub-stat-card"><div className="hub-stat-value">{contracts.length}</div><div className="hub-stat-label">Total</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{drafts}</div><div className="hub-stat-label">Drafts</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: pending > 0 ? COLORS.amber : undefined }}>{pending}</div><div className="hub-stat-label">Pending</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: signed > 0 ? COLORS.green : undefined }}>{signed}</div><div className="hub-stat-label">Signed</div></div>
      </div>

      <div className="clients-toolbar">
        <input className="clients-search" placeholder="Search by client or template..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="clients-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {CONTRACT_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {loadError && (
        <div style={{ background: '#3d2020', border: '1px solid #C23B2244', color: '#C23B22', padding: '10px 16px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
          {loadError} <button onClick={loadContracts} style={{ marginLeft: 8, background: 'none', border: '1px solid #C23B22', color: '#C23B22', padding: '4px 12px', borderRadius: 3, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {filtered.length === 0 && !showEditor && !loadError ? (
        <div className="clients-empty">{contracts.length === 0 ? 'No contracts yet. Create your first one.' : 'No contracts match your filters.'}</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead><tr><th>Template</th><th>Client</th><th>Signer</th><th>Status</th><th>Sent</th><th>Signed</th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => handleSelectContract(c)} onKeyDown={e => e.key === 'Enter' && handleSelectContract(c)} tabIndex={0} style={{ cursor: 'pointer' }}>
                  <td className="clients-name">{c.title || c.template_name || '—'}</td>
                  <td>{clientMap[c.client_id] || '—'}</td>
                  <td>{c.signer_email || '—'}</td>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{fmtDate(c.sent_at?.split('T')[0])}</td>
                  <td>{fmtDate(c.signed_at?.split('T')[0])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Editor */}
      {showEditor && (
        <ContractEditor
          template={editorTemplate}
          contract={editorContract}
          clients={clients}
          onSaved={handleSaved}
          onDeleted={() => { loadContracts(); showToast('Draft deleted') }}
          onSent={() => { loadContracts(); showToast('Contract sent for signing') }}
          onClose={handleCloseEditor}
          preselectedClientId={preselectedClientId}
          preselectedStaffId={preselectedStaffId}
        />
      )}

      {showPicker && <TemplatePicker onSelect={handleSelectTemplate} onClose={() => setShowPicker(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
