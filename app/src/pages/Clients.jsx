import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SERVICE_LINES = ['events', 'staffing', 'both']
const STATUSES = ['active', 'inactive', 'prospect']
const CLIENT_TYPES = ['bar', 'venue', 'wedding-planner', 'corporate', 'greek-org', 'promoter', 'private', 'other']

function StatusBadge({ status }) {
  const colors = {
    active: '#357A38',
    inactive: '#7A8490',
    prospect: '#C9922E',
  }
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--fh)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      color: colors[status] || '#7A8490',
      background: `${colors[status] || '#7A8490'}22`,
      padding: '3px 10px',
      borderRadius: 3,
    }}>{status}</span>
  )
}

function ServiceBadge({ line }) {
  const colors = { events: '#C23B22', staffing: '#3D5A80', both: '#C9922E' }
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--fh)',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '1.5px',
      textTransform: 'uppercase',
      color: colors[line] || '#7A8490',
      background: `${colors[line] || '#7A8490'}22`,
      padding: '3px 10px',
      borderRadius: 3,
    }}>{line}</span>
  )
}

function useEscapeKey(onClose) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
}

function AddClientModal({ onClose, onSaved }) {
  useEscapeKey(onClose)
  const [form, setForm] = useState({
    contact_name: '', business_name: '', phone: '', email: '',
    address: '', service_line: 'events', client_type: '', status: 'prospect', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('clients').insert([form])
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Client</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field">
              <span>Contact Name *</span>
              <input required value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} placeholder="John Smith" />
            </label>
            <label className="modal-field">
              <span>Business Name</span>
              <input value={form.business_name} onChange={e => setForm({...form, business_name: e.target.value})} placeholder="The Rusty Nail" />
            </label>
          </div>
          <div className="modal-row">
            <label className="modal-field">
              <span>Phone</span>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(979) 555-0123" />
            </label>
            <label className="modal-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@example.com" />
            </label>
          </div>
          <label className="modal-field">
            <span>Address</span>
            <input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main St, Bryan, TX" />
          </label>
          <div className="modal-row">
            <label className="modal-field">
              <span>Service Line</span>
              <select value={form.service_line} onChange={e => setForm({...form, service_line: e.target.value})}>
                {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>Client Type</span>
              <select value={form.client_type} onChange={e => setForm({...form, client_type: e.target.value})}>
                <option value="">Select...</option>
                {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="modal-field">
            <span>Notes</span>
            <textarea rows={1} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Any details about this client..." />
          </label>
          {error && <p role="alert" style={{ color: '#C23B22', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : 'Add Client'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ClientDetail({ client, onClose, onUpdated }) {
  useEscapeKey(onClose)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(client)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [events, setEvents] = useState([])
  const [invoices, setInvoices] = useState([])

  useEffect(() => {
    supabase.from('events').select('*').eq('client_id', client.id).order('date', { ascending: false }).limit(5)
      .then(({ data, error }) => { if (!error) setEvents(data || []) })
    supabase.from('invoices').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data, error }) => { if (!error) setInvoices(data || []) })
  }, [client.id])

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    const { error } = await supabase.from('clients').update({ ...form, updated_at: new Date().toISOString() }).eq('id', client.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setEditing(false); onUpdated()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{client.contact_name}</h2>
            {client.business_name && <p className="detail-business">{client.business_name}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <StatusBadge status={client.status} />
            <ServiceBadge line={client.service_line} />
          </div>
        </div>

        {!editing ? (
          <div className="detail-body">
            <div className="detail-section">
              <h3 className="detail-section-title">Contact Info</h3>
              <div className="detail-grid">
                <div className="detail-item"><span className="detail-label">Phone</span><span>{client.phone || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Email</span><span>{client.email || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Address</span><span>{client.address || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Type</span><span>{(client.client_type || '—').replace(/-/g, ' ')}</span></div>
              </div>
              {client.notes && <div className="detail-notes"><span className="detail-label">Notes</span><p>{client.notes}</p></div>}
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">Recent Events</h3>
              {events.length === 0 ? <p className="detail-empty">No events yet</p> : (
                <div className="detail-list">
                  {events.map(ev => (
                    <div key={ev.id} className="detail-list-item">
                      <span>{ev.venue_name || ev.event_type || 'Event'}</span>
                      <span className="detail-list-meta">{ev.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">Recent Invoices</h3>
              {invoices.length === 0 ? <p className="detail-empty">No invoices yet</p> : (
                <div className="detail-list">
                  {invoices.map(inv => (
                    <div key={inv.id} className="detail-list-item">
                      <span>${inv.total}</span>
                      <span className="detail-list-meta">{inv.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-actions">
              <button className="modal-btn-save" onClick={() => setEditing(true)}>Edit Client</button>
            </div>
          </div>
        ) : (
          <div className="detail-body">
            <div className="modal-form">
              <div className="modal-row">
                <label className="modal-field"><span>Contact Name</span>
                  <input value={form.contact_name} onChange={e => setForm({...form, contact_name: e.target.value})} />
                </label>
                <label className="modal-field"><span>Business Name</span>
                  <input value={form.business_name || ''} onChange={e => setForm({...form, business_name: e.target.value})} />
                </label>
              </div>
              <div className="modal-row">
                <label className="modal-field"><span>Phone</span>
                  <input value={form.phone || ''} onChange={e => setForm({...form, phone: e.target.value})} />
                </label>
                <label className="modal-field"><span>Email</span>
                  <input value={form.email || ''} onChange={e => setForm({...form, email: e.target.value})} />
                </label>
              </div>
              <label className="modal-field"><span>Address</span>
                <input value={form.address || ''} onChange={e => setForm({...form, address: e.target.value})} />
              </label>
              <div className="modal-row">
                <label className="modal-field"><span>Service Line</span>
                  <select value={form.service_line} onChange={e => setForm({...form, service_line: e.target.value})}>
                    {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="modal-field"><span>Status</span>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="modal-field"><span>Notes</span>
                <textarea rows={1} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
              </label>
              {saveError && <p role="alert" style={{ color: '#C23B22', fontSize: 13 }}>{saveError}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn-cancel" onClick={() => { setForm(client); setEditing(false); setSaveError('') }}>Cancel</button>
                <button className="modal-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Clients() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [loadError, setLoadError] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadClients = async () => {
    setLoading(true)
    setLoadError('')
    let q = supabase.from('clients').select('*').order('created_at', { ascending: false })
    if (filterLine) q = q.eq('service_line', filterLine)
    if (filterStatus) q = q.eq('status', filterStatus)
    const { data, error } = await q
    if (error) { setLoadError('Failed to load clients. Please refresh.'); if (import.meta.env.DEV) console.error('Load clients error:', error.message) }
    setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [filterLine, filterStatus])

  const filtered = clients.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return (c.contact_name || '').toLowerCase().includes(s) ||
           (c.business_name || '').toLowerCase().includes(s) ||
           (c.email || '').toLowerCase().includes(s) ||
           (c.phone || '').includes(s)
  })

  return (
    <div className="clients-page">
      <div className="clients-header">
        <div>
          <h1>Clients</h1>
          <p>{clients.length} total clients</p>
        </div>
        <button className="clients-add-btn" onClick={() => setShowAdd(true)}>+ Add Client</button>
      </div>

      <div className="clients-toolbar">
        <input
          className="clients-search"
          placeholder="Search by name, business, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="clients-filter" value={filterLine} onChange={e => setFilterLine(e.target.value)}>
          <option value="">All Services</option>
          {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="clients-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loadError && (
        <div style={{ background: '#3d2020', border: '1px solid #C23B2244', color: '#C23B22', padding: '10px 16px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
          {loadError} <button onClick={loadClients} style={{ marginLeft: 8, background: 'none', border: '1px solid #C23B22', color: '#C23B22', padding: '4px 12px', borderRadius: 3, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="clients-loading">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="clients-empty">
          <p>{search ? 'No clients match your search.' : 'No clients yet. Add your first one.'}</p>
        </div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Business</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Service</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)}>
                  <td className="clients-name">{c.contact_name}</td>
                  <td>{c.business_name || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td><ServiceBadge line={c.service_line} /></td>
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSaved={() => { loadClients(); showToast('Client added') }} />}
      {selected && <ClientDetail client={selected} onClose={() => setSelected(null)} onUpdated={() => { loadClients(); setSelected(null); showToast('Client updated') }} />}
    </div>
  )
}
