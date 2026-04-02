import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { fmtDate, daysUntil, badgeStyle, COLORS } from '../lib/format'

function downloadCSV(rows, headers, filename) {
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

const STAFF_STATUSES = ['active', 'inactive']
const BG_CHECKS = ['none', 'pending', 'cleared']
const LICENSE_TYPES = ['general', 'tabc']
const DOC_TYPES = ['w9', 'agreement', 'other']
const DOC_STATUSES = ['received', 'missing', 'expired']

function LicenseStatusBadge({ expirationDate }) {
  const days = daysUntil(expirationDate)
  if (days === null) return <span style={badgeStyle('#7A8490')}>NO DATE</span>
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


/* ═══════════════════════════════════════════════════════════
   ADD/EDIT STAFF MODAL
   ═══════════════════════════════════════════════════════════ */
function StaffModal({ staff, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!staff?.id
  const [form, setForm] = useState({ name: '', phone: '', email: '', role: '', default_pay_rate: '', status: 'active', background_check: 'none', ...staff })
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
      const { data: newStaff, error: err } = await supabase.from('staff').insert([payload]).select('id').single()
      setSaving(false)
      if (err) { setError(err.message); return }
      // Auto-create required contractor docs
      if (newStaff?.id) {
        const { error: docErr } = await supabase.from('contractor_docs').insert([
          { staff_id: newStaff.id, doc_type: 'w9', status: 'missing' },
          { staff_id: newStaff.id, doc_type: 'agreement', status: 'missing' },
        ])
        if (docErr && import.meta.env.DEV) console.error('Auto-create docs:', docErr.message)
      }
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
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
  const [form, setForm] = useState({ staff_id: '', license_type: 'general', license_number: '', issuing_authority: '', issue_date: '', expiration_date: '', notes: '', ...license })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.staff_id) { setError('Select a staff member'); return }
    if (form.issue_date && form.expiration_date && form.expiration_date < form.issue_date) { setError('Expiration date must be after issue date'); return }
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
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
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
  const [form, setForm] = useState({ staff_id: '', doc_type: 'w9', status: 'missing', signature_date: '', notes: '', file_url: '', ...doc })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError('')
    const ext = file.name.split('.').pop()
    const path = `${form.staff_id || 'unknown'}/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('contractor-docs').upload(path, file)
    setUploading(false)
    if (uploadErr) { setError(`Upload failed: ${uploadErr.message}`); return }
    const { data: { publicUrl } } = supabase.storage.from('contractor-docs').getPublicUrl(path)
    setForm(prev => ({ ...prev, file_url: publicUrl }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.staff_id) { setError('Select a staff member'); return }
    setSaving(true); setError('')
    const payload = { ...form, signature_date: form.signature_date || null, notes: form.notes || null, file_url: form.file_url || null }
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
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Contractor Document' : 'Add Contractor Document'}</h2>
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
          <label className="modal-field">
            <span>Attachment</span>
            {form.file_url ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <a href={form.file_url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.blue, fontSize: 13, textDecoration: 'none' }}>View File</a>
                <button type="button" style={{ background: 'none', border: 'none', color: COLORS.red, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => setForm({ ...form, file_url: '' })}>Remove</button>
              </div>
            ) : (
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={handleFileUpload} disabled={uploading} />
            )}
            {uploading && <span style={{ fontSize: 12, color: 'var(--steel)' }}>Uploading...</span>}
          </label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving || uploading}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Add Document'}</button>
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
  const navigate = useNavigate()
  const [tab, setTab] = useState('roster')
  const [staff, setStaff] = useState([])
  const [licenses, setLicenses] = useState([])
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLicenseType, setFilterLicenseType] = useState('')
  const [filterLicenseStatus, setFilterLicenseStatus] = useState('')
  const [filterDocType, setFilterDocType] = useState('')
  const [filterDocStatus, setFilterDocStatus] = useState('')
  const [staffPage, setStaffPage] = useState(0)
  const [licensePage, setLicensePage] = useState(0)
  const [docPage, setDocPage] = useState(0)
  const COMP_PAGE_SIZE = 50
  const [bulkSelected, setBulkSelected] = useState(new Set())
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
    const { data, error } = await supabase.from('staff').select('*').order('name')
    if (error && import.meta.env.DEV) console.error('Load staff:', error.message)
    setStaff(data || [])
  }, [])

  const loadLicenses = useCallback(async () => {
    const { data, error } = await supabase.from('licenses').select('*').order('expiration_date', { ascending: true })
    if (error && import.meta.env.DEV) console.error('Load licenses:', error.message)
    setLicenses(data || [])
  }, [])

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase.from('contractor_docs').select('*').order('created_at', { ascending: false })
    if (error && import.meta.env.DEV) console.error('Load docs:', error.message)
    setDocs(data || [])
  }, [])

  useEffect(() => {
    Promise.all([loadStaff(), loadLicenses(), loadDocs()])
      .then(() => setLoading(false))
      .catch(() => { setLoading(false); showToast('Failed to load some data') })
  }, [loadStaff, loadLicenses, loadDocs])

  const staffMap = useMemo(() => Object.fromEntries(staff.map(s => [s.id, s.name])), [staff])

  const handleDelete = async (table, id) => {
    if (table === 'staff') {
      const { error: licErr } = await supabase.from('licenses').delete().eq('staff_id', id)
      if (licErr) { if (import.meta.env.DEV) console.error('Delete staff licenses:', licErr.message); showToast('Failed to remove staff licenses'); return }
      const { error: docErr } = await supabase.from('contractor_docs').delete().eq('staff_id', id)
      if (docErr) { if (import.meta.env.DEV) console.error('Delete staff docs:', docErr.message); showToast('Failed to remove staff docs'); return }
    }
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) { if (import.meta.env.DEV) console.error(`Delete ${table}:`, error.message); return }
    setConfirmDeleteId(null); setConfirmDeleteType(null)
    if (table === 'staff') { loadStaff(); loadLicenses(); loadDocs(); showToast('Staff removed') }
    if (table === 'licenses') { loadLicenses(); showToast('License removed') }
    if (table === 'contractor_docs') { loadDocs(); showToast('Document removed') }
  }

  const handleBulkDelete = async (table) => {
    if (bulkSelected.size === 0) return
    if (!window.confirm(`Delete ${bulkSelected.size} ${table === 'staff' ? 'staff members' : table === 'licenses' ? 'licenses' : 'documents'}?`)) return
    const ids = [...bulkSelected]
    if (table === 'staff') {
      await supabase.from('licenses').delete().in('staff_id', ids)
      await supabase.from('contractor_docs').delete().in('staff_id', ids)
    }
    const { error } = await supabase.from(table).delete().in('id', ids)
    if (error) { showToast('Failed to delete some records'); return }
    setBulkSelected(new Set())
    if (table === 'staff') { loadStaff(); loadLicenses(); loadDocs() }
    if (table === 'licenses') { loadLicenses() }
    if (table === 'contractor_docs') { loadDocs() }
    showToast(`${ids.length} records deleted`)
  }

  const handleImportCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { showToast('CSV must have a header row and at least one data row'); return }
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase())
    const nameIdx = headers.findIndex(h => h === 'name')
    if (nameIdx === -1) { showToast('CSV must have a "Name" column'); return }
    const roleIdx = headers.findIndex(h => h === 'role')
    const phoneIdx = headers.findIndex(h => h === 'phone')
    const emailIdx = headers.findIndex(h => h === 'email')
    const rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('pay'))
    const rows = lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      return {
        name: cols[nameIdx] || '',
        role: roleIdx >= 0 ? cols[roleIdx] || null : null,
        phone: phoneIdx >= 0 ? cols[phoneIdx] || null : null,
        email: emailIdx >= 0 ? cols[emailIdx] || null : null,
        default_pay_rate: rateIdx >= 0 ? parseFloat(cols[rateIdx]) || null : null,
        status: 'active', background_check: 'none',
      }
    }).filter(r => r.name)
    if (rows.length === 0) { showToast('No valid rows found'); return }
    const { error } = await supabase.from('staff').insert(rows)
    if (error) { showToast(`Import failed: ${error.message}`); return }
    loadStaff(); loadDocs(); showToast(`${rows.length} staff imported`)
    e.target.value = '' // Reset file input
  }

  const filteredStaff = useMemo(() => staff.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.role || '').toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q)
  }), [staff, search])

  const filteredLicenses = useMemo(() => licenses.filter(l => {
    if (filterLicenseType && l.license_type !== filterLicenseType) return false
    if (filterLicenseStatus) {
      const days = daysUntil(l.expiration_date)
      if (filterLicenseStatus === 'expired' && (days === null || days >= 0)) return false
      if (filterLicenseStatus === 'expiring' && (days === null || days < 0 || days > 30)) return false
      if (filterLicenseStatus === 'active' && (days === null || days <= 30)) return false
    }
    if (search) {
      const q = search.toLowerCase()
      const name = (staffMap[l.staff_id] || '').toLowerCase()
      if (!name.includes(q) && !(l.license_number || '').toLowerCase().includes(q)) return false
    }
    return true
  }), [licenses, filterLicenseType, filterLicenseStatus, search, staffMap])

  const filteredDocs = useMemo(() => docs.filter(d => {
    if (filterDocType && d.doc_type !== filterDocType) return false
    if (filterDocStatus && d.status !== filterDocStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (staffMap[d.staff_id] || '').toLowerCase()
      if (!name.includes(q)) return false
    }
    return true
  }), [docs, filterDocType, filterDocStatus, search, staffMap])

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
      <div className="detail-tabs" role="tablist" style={{ padding: 0, marginBottom: 16 }}>
        <button className={`detail-tab ${tab === 'roster' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'roster'} onClick={() => { setTab('roster'); setSearch(''); setConfirmDeleteId(null); setConfirmDeleteType(null); setBulkSelected(new Set()) }}>Staff Roster ({staff.length})</button>
        <button className={`detail-tab ${tab === 'licenses' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'licenses'} onClick={() => { setTab('licenses'); setSearch(''); setConfirmDeleteId(null); setConfirmDeleteType(null); setBulkSelected(new Set()) }}>Licenses & Certs ({licenses.length})</button>
        <button className={`detail-tab ${tab === 'docs' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'docs'} onClick={() => { setTab('docs'); setSearch(''); setConfirmDeleteId(null); setConfirmDeleteType(null); setBulkSelected(new Set()) }}>Contractor Docs ({docs.length})</button>
      </div>

      {/* ─── STAFF ROSTER TAB ─── */}
      {tab === 'roster' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
            {staff.length > 0 && <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => {
              const rows = staff.map(s => [s.name, s.role || '', s.phone || '', s.email || '', s.status, s.background_check, s.default_pay_rate || ''])
              downloadCSV(rows, ['Name', 'Role', 'Phone', 'Email', 'Status', 'BG Check', 'Pay Rate'], `staff-roster-${new Date().toISOString().split('T')[0]}.csv`)
            }}>Export</button>}
            <label className="modal-btn-cancel" style={{ fontSize: 12, padding: '6px 14px', cursor: 'pointer' }}>
              Import CSV
              <input type="file" accept=".csv" onChange={handleImportCSV} style={{ display: 'none' }} />
            </label>
            <button className="clients-add-btn" onClick={() => setShowStaffModal({})}>+ Add Staff</button>
          </div>
          {bulkSelected.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px', background: 'var(--char)', borderRadius: 6, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--fh)', fontWeight: 600 }}>{bulkSelected.size} selected</span>
              <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: COLORS.red }} onClick={() => handleBulkDelete('staff')}>Delete Selected</button>
              <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px', marginLeft: 'auto' }} onClick={() => setBulkSelected(new Set())}>Clear</button>
            </div>
          )}
          {filteredStaff.length === 0 ? (
            <div className="clients-empty">No staff members yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr>
                  <th style={{ width: 32 }}><input type="checkbox" checked={filteredStaff.length > 0 && bulkSelected.size === filteredStaff.length} onChange={e => { if (e.target.checked) setBulkSelected(new Set(filteredStaff.map(s => s.id))); else setBulkSelected(new Set()) }} /></th>
                  <th>Name</th><th>Role</th><th>Phone</th><th>Email</th><th>Status</th><th>BG Check</th><th>Pay Rate</th><th>Docs</th><th></th>
                </tr></thead>
                <tbody>
                  {filteredStaff.slice(staffPage * COMP_PAGE_SIZE, (staffPage + 1) * COMP_PAGE_SIZE).map(s => {
                    const staffDocs = docs.filter(d => d.staff_id === s.id)
                    const hasAgreement = staffDocs.some(d => d.doc_type === 'agreement' && d.status === 'received')
                    const hasW9 = staffDocs.some(d => d.doc_type === 'w9' && d.status === 'received')
                    return (
                    <tr key={s.id}>
                      <td><input type="checkbox" checked={bulkSelected.has(s.id)} onChange={e => { const next = new Set(bulkSelected); if (e.target.checked) next.add(s.id); else next.delete(s.id); setBulkSelected(next) }} /></td>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowStaffModal(s)}>{s.name}</td>
                      <td>{s.role || '—'}</td>
                      <td>{s.phone || '—'}</td>
                      <td>{s.email || '—'}</td>
                      <td><StaffStatusBadge status={s.status} /></td>
                      <td><BgCheckBadge status={s.background_check} /></td>
                      <td>{s.default_pay_rate ? `$${s.default_pay_rate}/hr` : '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {s.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email) ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            {!hasAgreement && <button style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => navigate(`/contracts?staff_id=${s.id}&template=${encodeURIComponent('/docs/08-independent-contractor-agreement.html')}`)}>Agreement</button>}
                            {hasAgreement && <span style={badgeStyle(COLORS.green)}>AGR</span>}
                            {!hasW9 && <button style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => navigate(`/contracts?staff_id=${s.id}&template=${encodeURIComponent('/docs/09-w9-request-form.html')}`)}>W-9</button>}
                            {hasW9 && <span style={badgeStyle(COLORS.green)}>W-9</span>}
                          </span>
                        ) : <span style={{ fontSize: 11, color: 'var(--steel)' }}>Add email</span>}
                      </td>
                      <td>
                        {confirmDeleteId === s.id && confirmDeleteType === 'staff' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)' }} onClick={() => handleDelete('staff', s.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(s.id); setConfirmDeleteType('staff') }}>Del</button>
                        )}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {Math.ceil(filteredStaff.length / COMP_PAGE_SIZE) > 1 && (
            <div className="pagination">
              <button className="pagination-btn" disabled={staffPage === 0} onClick={() => setStaffPage(p => p - 1)}>Prev</button>
              <span className="pagination-info">Page {staffPage + 1} of {Math.ceil(filteredStaff.length / COMP_PAGE_SIZE)}</span>
              <button className="pagination-btn" disabled={staffPage >= Math.ceil(filteredStaff.length / COMP_PAGE_SIZE) - 1} onClick={() => setStaffPage(p => p + 1)}>Next</button>
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
            {licenses.length > 0 && <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '6px 14px' }} onClick={() => {
              const rows = licenses.map(l => [staffMap[l.staff_id] || '', l.license_type, l.license_number || '', l.issuing_authority || '', l.issue_date || '', l.expiration_date || ''])
              downloadCSV(rows, ['Staff', 'Type', 'License #', 'Authority', 'Issue Date', 'Expiration'], `licenses-${new Date().toISOString().split('T')[0]}.csv`)
            }}>Export</button>}
            <button className="clients-add-btn" onClick={() => setShowLicenseModal({})}>+ Add License</button>
          </div>
          {filteredLicenses.length === 0 ? (
            <div className="clients-empty">No licenses tracked yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Staff</th><th>Type</th><th>License #</th><th>Authority</th><th>Issued</th><th>Expires</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filteredLicenses.slice(licensePage * COMP_PAGE_SIZE, (licensePage + 1) * COMP_PAGE_SIZE).map(l => (
                    <tr key={l.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowLicenseModal(l)}>{staffMap[l.staff_id] || '—'}</td>
                      <td><span style={badgeStyle('#3D5A80')}>{l.license_type.toUpperCase()}</span></td>
                      <td>{l.license_number || '—'}</td>
                      <td>{l.issuing_authority || '—'}</td>
                      <td>{fmtDate(l.issue_date)}</td>
                      <td>{fmtDate(l.expiration_date)}</td>
                      <td><LicenseStatusBadge expirationDate={l.expiration_date} /></td>
                      <td>
                        {confirmDeleteId === l.id && confirmDeleteType === 'licenses' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)' }} onClick={() => handleDelete('licenses', l.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
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
          {Math.ceil(filteredLicenses.length / COMP_PAGE_SIZE) > 1 && (
            <div className="pagination">
              <button className="pagination-btn" disabled={licensePage === 0} onClick={() => setLicensePage(p => p - 1)}>Prev</button>
              <span className="pagination-info">Page {licensePage + 1} of {Math.ceil(filteredLicenses.length / COMP_PAGE_SIZE)}</span>
              <button className="pagination-btn" disabled={licensePage >= Math.ceil(filteredLicenses.length / COMP_PAGE_SIZE) - 1} onClick={() => setLicensePage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* ─── CONTRACTOR DOCS TAB ─── */}
      {tab === 'docs' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
            <select className="clients-filter" value={filterDocType} onChange={e => setFilterDocType(e.target.value)}>
              <option value="">All Types</option>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t === 'w9' ? 'W-9' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select className="clients-filter" value={filterDocStatus} onChange={e => setFilterDocStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {DOC_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <button className="clients-add-btn" onClick={() => setShowDocModal({})}>+ Add Document</button>
          </div>
          {filteredDocs.length === 0 ? (
            <div className="clients-empty">No contractor documents tracked yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Staff</th><th>Document</th><th>Status</th><th>Signed</th><th>File</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  {filteredDocs.slice(docPage * COMP_PAGE_SIZE, (docPage + 1) * COMP_PAGE_SIZE).map(d => (
                    <tr key={d.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowDocModal(d)}>{staffMap[d.staff_id] || '—'}</td>
                      <td>{d.doc_type === 'w9' ? 'W-9' : d.doc_type.charAt(0).toUpperCase() + d.doc_type.slice(1)}</td>
                      <td><DocStatusBadge status={d.status} /></td>
                      <td>{fmtDate(d.signature_date)}</td>
                      <td>{d.file_url ? <a href={d.file_url} target="_blank" rel="noopener noreferrer" style={{ color: COLORS.blue, fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, textDecoration: 'none' }}>View</a> : <span style={{ fontSize: 12, color: 'var(--steel)' }}>—</span>}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.notes || '—'}</td>
                      <td>
                        {confirmDeleteId === d.id && confirmDeleteType === 'contractor_docs' ? (
                          <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)' }} onClick={() => handleDelete('contractor_docs', d.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
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
          {Math.ceil(filteredDocs.length / COMP_PAGE_SIZE) > 1 && (
            <div className="pagination">
              <button className="pagination-btn" disabled={docPage === 0} onClick={() => setDocPage(p => p - 1)}>Prev</button>
              <span className="pagination-info">Page {docPage + 1} of {Math.ceil(filteredDocs.length / COMP_PAGE_SIZE)}</span>
              <button className="pagination-btn" disabled={docPage >= Math.ceil(filteredDocs.length / COMP_PAGE_SIZE) - 1} onClick={() => setDocPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showStaffModal !== null && <StaffModal staff={showStaffModal.id ? showStaffModal : null} onClose={() => setShowStaffModal(null)} onSaved={() => { loadStaff(); loadDocs(); showToast(showStaffModal.id ? `Updated: ${showStaffModal.name || 'Staff'}` : 'Staff added') }} />}
      {showLicenseModal !== null && <LicenseModal license={showLicenseModal.id ? showLicenseModal : null} staffList={staff} onClose={() => setShowLicenseModal(null)} onSaved={() => { loadLicenses(); showToast(showLicenseModal.id ? 'License updated' : 'License added') }} />}
      {showDocModal !== null && <DocModal doc={showDocModal.id ? showDocModal : null} staffList={staff} onClose={() => setShowDocModal(null)} onSaved={() => { loadDocs(); showToast(showDocModal.id ? 'Document updated' : 'Document added') }} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
