import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'

const STAFF_STATUSES = ['active', 'inactive']
const BG_CHECKS = ['none', 'pending', 'cleared']
const LICENSE_TYPES = ['general', 'tabc']
const DOC_TYPES = ['w9', 'agreement', 'other']
const DOC_STATUSES = ['received', 'missing', 'expired']

function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

function daysUntil(d) {
  if (!d) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(d + 'T00:00:00')
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

function LicenseStatusBadge({ expirationDate }) {
  const days = daysUntil(expirationDate)
  if (days === null) return <span style={badgeStyle('#929BAA')}>NO DATE</span>
  if (days < 0) return <span style={badgeStyle('#D4483A')}>EXPIRED</span>
  if (days <= 7) return <span style={badgeStyle('#D4483A')}>{days}d LEFT</span>
  if (days <= 30) return <span style={badgeStyle('#C9922E')}>{days}d LEFT</span>
  return <span style={badgeStyle('#357A38')}>ACTIVE</span>
}

function StaffStatusBadge({ status }) {
  const c = status === 'active' ? '#357A38' : '#929BAA'
  return <span style={badgeStyle(c)}>{status}</span>
}

function BgCheckBadge({ status }) {
  const colors = { cleared: '#357A38', pending: '#C9922E', none: '#929BAA' }
  return <span style={badgeStyle(colors[status] || '#929BAA')}>{status}</span>
}

function DocStatusBadge({ status }) {
  const colors = { received: '#357A38', missing: '#D4483A', expired: '#C9922E' }
  return <span style={badgeStyle(colors[status] || '#929BAA')}>{status}</span>
}

function badgeStyle(c) {
  return { display: 'inline-block', fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: c, background: `${c}22`, padding: '3px 10px', borderRadius: 3 }
}

/* ═══════════════════════════════════════════════════════════
   ADD/EDIT STAFF MODAL
   ═══════════════════════════════════════════════════════════ */
function StaffModal({ staff, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!staff?.id
  const [form, setForm] = useState(staff || { name: '', phone: '', email: '', role: '', default_pay_rate: '', status: 'active', background_check: 'none' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const payload = { ...form, default_pay_rate: parseFloat(form.default_pay_rate) || null }
    if (isEdit) {
      const { id, created_at, ...rest } = payload
      const { error: err } = await supabase.from('staff').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', staff.id)
      setSaving(false)
      if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('staff').insert([payload])
      setSaving(false)
      if (err) { setError(err.message); return }
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Staff' : 'Add Staff'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field"><span>Name *</span><input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
            <label className="modal-field"><span>Role</span><input placeholder="Security Guard" value={form.role || ''} onChange={e => setForm({ ...form, role: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Phone</span><input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="modal-field"><span>Email</span><input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Default Pay Rate ($/hr)</span><input type="number" step="0.01" value={form.default_pay_rate || ''} onChange={e => setForm({ ...form, default_pay_rate: e.target.value })} /></label>
            <label className="modal-field"><span>Status</span>
              <select value={form.status || 'active'} onChange={e => setForm({ ...form, status: e.target.value })}>{STAFF_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label className="modal-field"><span>Background Check</span>
              <select value={form.background_check || 'none'} onChange={e => setForm({ ...form, background_check: e.target.value })}>{BG_CHECKS.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Staff'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ADD/EDIT LICENSE MODAL
   ═══════════════════════════════════════════════════════════ */
function LicenseModal({ license, staffList, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!license?.id
  const [form, setForm] = useState(license || { staff_id: '', license_type: 'general', license_number: '', issuing_authority: '', issue_date: '', expiration_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.staff_id) { setError('Select a staff member'); return }
    setSaving(true); setError('')
    const payload = { ...form, issue_date: form.issue_date || null, expiration_date: form.expiration_date || null, notes: form.notes || null }
    if (isEdit) {
      const { id, created_at, ...rest } = payload
      const { error: err } = await supabase.from('licenses').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', license.id)
      setSaving(false); if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('licenses').insert([payload])
      setSaving(false); if (err) { setError(err.message); return }
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit License' : 'Add License'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field"><span>Staff Member *</span>
              <select required value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                <option value="">Select...</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="modal-field"><span>License Type</span>
              <select value={form.license_type} onChange={e => setForm({ ...form, license_type: e.target.value })}>{LICENSE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select>
            </label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>License Number</span><input value={form.license_number || ''} onChange={e => setForm({ ...form, license_number: e.target.value })} /></label>
            <label className="modal-field"><span>Issuing Authority</span><input placeholder="TDPS, TABC, etc." value={form.issuing_authority || ''} onChange={e => setForm({ ...form, issuing_authority: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Issue Date</span><input type="date" value={form.issue_date || ''} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></label>
            <label className="modal-field"><span>Expiration Date</span><input type="date" value={form.expiration_date || ''} onChange={e => setForm({ ...form, expiration_date: e.target.value })} /></label>
          </div>
          <label className="modal-field"><span>Notes</span><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Add License'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ADD/EDIT CONTRACTOR DOC MODAL
   ═══════════════════════════════════════════════════════════ */
function DocModal({ doc, staffList, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!doc?.id
  const [form, setForm] = useState(doc || { staff_id: '', doc_type: 'w9', status: 'missing', signature_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.staff_id) { setError('Select a staff member'); return }
    setSaving(true); setError('')
    const payload = { ...form, signature_date: form.signature_date || null, notes: form.notes || null }
    if (isEdit) {
      const { id, created_at, ...rest } = payload
      const { error: err } = await supabase.from('contractor_docs').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', doc.id)
      setSaving(false); if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('contractor_docs').insert([payload])
      setSaving(false); if (err) { setError(err.message); return }
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Document' : 'Add Document'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field"><span>Staff Member *</span>
              <select required value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
                <option value="">Select...</option>
                {staffList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="modal-field"><span>Document Type</span>
              <select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })}>{DOC_TYPES.map(t => <option key={t} value={t}>{t === 'w9' ? 'W-9' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}</select>
            </label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Status</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{DOC_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}</select>
            </label>
            <label className="modal-field"><span>Signature Date</span><input type="date" value={form.signature_date || ''} onChange={e => setForm({ ...form, signature_date: e.target.value })} /></label>
          </div>
          <label className="modal-field"><span>Notes</span><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Add Document'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPLIANCE PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Compliance() {
  const [tab, setTab] = useState('roster')
  const [staff, setStaff] = useState([])
  const [licenses, setLicenses] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLicenseType, setFilterLicenseType] = useState('')
  const [filterLicenseStatus, setFilterLicenseStatus] = useState('')
  const [showStaffModal, setShowStaffModal] = useState(null) // null=closed, {}=add, {staff}=edit
  const [showLicenseModal, setShowLicenseModal] = useState(null)
  const [showDocModal, setShowDocModal] = useState(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteType, setConfirmDeleteType] = useState(null)
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)

  // Stats
  const expiringCount = licenses.filter(l => { const d = daysUntil(l.expiration_date); return d !== null && d >= 0 && d <= 30 }).length
  const expiredCount = licenses.filter(l => { const d = daysUntil(l.expiration_date); return d !== null && d < 0 }).length
  const missingDocs = docs.filter(d => d.status === 'missing').length

  const loadStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    setStaff(data || [])
  }, [])

  const loadLicenses = useCallback(async () => {
    const { data } = await supabase.from('licenses').select('*').order('expiration_date', { ascending: true })
    setLicenses(data || [])
  }, [])

  const loadDocs = useCallback(async () => {
    const { data } = await supabase.from('contractor_docs').select('*').order('created_at', { ascending: false })
    setDocs(data || [])
  }, [])

  useEffect(() => {
    Promise.all([loadStaff(), loadLicenses(), loadDocs()]).then(() => setLoading(false))
  }, [loadStaff, loadLicenses, loadDocs])

  const staffMap = Object.fromEntries(staff.map(s => [s.id, s.name]))

  const handleDelete = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { if (import.meta.env.DEV) console.error(`Delete ${table}:`, error.message); return }
    setConfirmDeleteId(null); setConfirmDeleteType(null)
    if (table === 'staff') { loadStaff(); showToast('Staff removed') }
    if (table === 'licenses') { loadLicenses(); showToast('License removed') }
    if (table === 'contractor_docs') { loadDocs(); showToast('Document removed') }
  }

  const filteredStaff = staff.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.role || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
  })

  const filteredLicenses = licenses.filter(l => {
    if (filterLicenseType && l.license_type !== filterLicenseType) return false
    if (filterLicenseStatus) {
      const days = daysUntil(l.expiration_date)
      if (filterLicenseStatus === 'expired' && (days === null || days >= 0)) return false
      if (filterLicenseStatus === 'expiring' && (days === null || days < 0 || days > 30)) return false
      if (filterLicenseStatus === 'active' && (days !== null && days <= 30)) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const name = (staffMap[l.staff_id] || '').toLowerCase()
      if (!name.includes(q) && !(l.license_number || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const filteredDocs = docs.filter(d => {
    if (search) {
      const q = search.toLowerCase()
      const name = (staffMap[d.staff_id] || '').toLowerCase()
      if (!name.includes(q)) return false
    }
    return true
  })

  if (loading) return <div className="clients-loading">Loading compliance data...</div>

  return (
    <div className="clients">
      <div className="clients-header">
        <div>
          <h1>Compliance</h1>
          <p className="clients-subtitle">Staff, licenses, certifications, and contractor documents</p>
        </div>
      </div>

      {/* Stats */}
      <div className="hub-stats" style={{ marginBottom: 24 }}>
        <div className="hub-stat-card"><div className="hub-stat-value">{staff.length}</div><div className="hub-stat-label">Total Staff</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: expiringCount > 0 ? '#C9922E' : undefined }}>{expiringCount}</div><div className="hub-stat-label">Expiring Soon</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: expiredCount > 0 ? '#D4483A' : undefined }}>{expiredCount}</div><div className="hub-stat-label">Expired</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: missingDocs > 0 ? '#D4483A' : undefined }}>{missingDocs}</div><div className="hub-stat-label">Missing Docs</div></div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs" style={{ padding: 0, marginBottom: 16 }}>
        <button className={`detail-tab ${tab === 'roster' ? 'detail-tab--active' : ''}`} onClick={() => setTab('roster')}>Staff Roster ({staff.length})</button>
        <button className={`detail-tab ${tab === 'licenses' ? 'detail-tab--active' : ''}`} onClick={() => setTab('licenses')}>Licenses & Certs ({licenses.length})</button>
        <button className={`detail-tab ${tab === 'docs' ? 'detail-tab--active' : ''}`} onClick={() => setTab('docs')}>Contractor Docs ({docs.length})</button>
      </div>

      {/* ─── STAFF ROSTER TAB ─── */}
      {tab === 'roster' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="clients-add-btn" onClick={() => setShowStaffModal({})}>+ Add Staff</button>
          </div>
          {filteredStaff.length === 0 ? (
            <div className="clients-empty">No staff members yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Status</th><th>BG Check</th><th>Pay Rate</th><th></th></tr></thead>
                <tbody>
                  {filteredStaff.map(s => (
                    <tr key={s.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowStaffModal(s)}>{s.name}</td>
                      <td>{s.role || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.email || '—'}</td>
                      <td><StaffStatusBadge status={s.status} /></td>
                      <td><BgCheckBadge status={s.background_check} /></td>
                      <td>{s.default_pay_rate ? `$${s.default_pay_rate}/hr` : '—'}</td>
                      <td>
                        {confirmDeleteId === s.id && confirmDeleteType === 'staff' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 11, padding: '2px 8px', background: 'var(--red)' }} onClick={() => handleDelete('staff', s.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteType('staff') }}>Del</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── LICENSES & CERTS TAB ─── */}
      {tab === 'licenses' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search by name or license #..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="clients-filter" value={filterLicenseType} onChange={e => setFilterLicenseType(e.target.value)}>
              <option value="">All Types</option>
              {LICENSE_TYPES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
            <select className="clients-filter" value={filterLicenseStatus} onChange={e => setFilterLicenseStatus(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active (30+ days)</option>
              <option value="expiring">Expiring (0-30 days)</option>
              <option value="expired">Expired</option>
            </select>
            <button className="clients-add-btn" onClick={() => setShowLicenseModal({})}>+ Add License</button>
          </div>
          {filteredLicenses.length === 0 ? (
            <div className="clients-empty">No licenses tracked yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Staff</th><th>Type</th><th>License #</th><th>Authority</th><th>Expires</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filteredLicenses.map(l => (
                    <tr key={l.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowLicenseModal(l)}>{staffMap[l.staff_id] || '—'}</td>
                      <td><span style={badgeStyle('#3D5A80')}>{l.license_type.toUpperCase()}</span></td>
                      <td>{l.license_number || '—'}</td>
                      <td>{l.issuing_authority || '—'}</td>
                      <td>{fmtDate(l.expiration_date)}</td>
                      <td><LicenseStatusBadge expirationDate={l.expiration_date} /></td>
                      <td>
                        {confirmDeleteId === l.id && confirmDeleteType === 'licenses' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 11, padding: '2px 8px', background: 'var(--red)' }} onClick={() => handleDelete('licenses', l.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(l.id); setConfirmDeleteType('licenses') }}>Del</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── CONTRACTOR DOCS TAB ─── */}
      {tab === 'docs' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
            <button className="clients-add-btn" onClick={() => setShowDocModal({})}>+ Add Document</button>
          </div>
          {filteredDocs.length === 0 ? (
            <div className="clients-empty">No contractor documents tracked yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Staff</th><th>Document</th><th>Status</th><th>Signed</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {filteredDocs.map(d => (
                    <tr key={d.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowDocModal(d)}>{staffMap[d.staff_id] || '—'}</td>
                      <td>{d.doc_type === 'w9' ? 'W-9' : d.doc_type.charAt(0).toUpperCase() + d.doc_type.slice(1)}</td>
                      <td><DocStatusBadge status={d.status} /></td>
                      <td>{fmtDate(d.signature_date)}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '—'}</td>
                      <td>
                        {confirmDeleteId === d.id && confirmDeleteType === 'contractor_docs' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 11, padding: '2px 8px', background: 'var(--red)' }} onClick={() => handleDelete('contractor_docs', d.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(d.id); setConfirmDeleteType('contractor_docs') }}>Del</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showStaffModal !== null && <StaffModal staff={showStaffModal.id ? showStaffModal : null} onClose={() => setShowStaffModal(null)} onSaved={() => { loadStaff(); showToast(showStaffModal.id ? 'Staff updated' : 'Staff added') }} />}
      {showLicenseModal !== null && <LicenseModal license={showLicenseModal.id ? showLicenseModal : null} staffList={staff} onClose={() => setShowLicenseModal(null)} onSaved={() => { loadLicenses(); showToast(showLicenseModal.id ? 'License updated' : 'License added') }} />}
      {showDocModal !== null && <DocModal doc={showDocModal.id ? showDocModal : null} staffList={staff} onClose={() => setShowDocModal(null)} onSaved={() => { loadDocs(); showToast(showDocModal.id ? 'Document updated' : 'Document added') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
