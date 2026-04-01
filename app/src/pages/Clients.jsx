import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { COLORS } from '../lib/format'

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

function AddClientModal({ onClose, onSaved, fromDeal }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [form, setForm] = useState({
    contact_name: fromDeal?.contact_name || '', business_name: fromDeal?.business_name || '',
    phone: fromDeal?.phone || '', email: fromDeal?.email || '',
    address: '', service_line: fromDeal?.service_line || 'events', client_type: '',
    status: fromDeal ? 'active' : 'prospect', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { data: newClient, error: err } = await supabase.from('clients').insert([form]).select('id').single()
    setSaving(false)
    if (err) { setError(err.message); return }
    // Link pipeline deal to new client
    if (fromDeal?.deal_id && newClient?.id) {
      await supabase.from('pipeline').update({ client_id: newClient.id, updated_at: new Date().toISOString() }).eq('id', fromDeal.deal_id)
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
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

function ClientDetail({ client, onClose, onUpdated, onDeleted, navigate }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(client)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [events, setEvents] = useState([])
  const [invoices, setInvoices] = useState([])
  const [contracts, setContracts] = useState([])

  useEffect(() => {
    supabase.from('events').select('*').eq('client_id', client.id).order('date', { ascending: false }).limit(5)
      .then(({ data, error }) => { if (error) { if (import.meta.env.DEV) console.error('Events fetch error:', error.message) } else setEvents(data || []) })
    supabase.from('invoices').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data, error }) => { if (error) { if (import.meta.env.DEV) console.error('Invoices fetch error:', error.message) } else setInvoices(data || []) })
    supabase.from('contracts').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(5)
      .then(({ data, error }) => { if (error) { if (import.meta.env.DEV) console.error('Contracts fetch error:', error.message) } else setContracts(data || []) })
  }, [client.id])

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    const { id, created_at, ...rest } = form
    const { error } = await supabase.from('clients').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', client.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setEditing(false); onUpdated()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('clients').delete().eq('id', client.id)
    if (error) { if (import.meta.env.DEV) console.error('Delete error:', error.message); setConfirmDelete(false); return }
    onDeleted()
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="detail-panel" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
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

            <div className="detail-section">
              <h3 className="detail-section-title">Contracts</h3>
              {contracts.length === 0 ? <p className="detail-empty">No contracts yet</p> : (
                <div className="detail-list">
                  {contracts.map(c => (
                    <div key={c.id} className="detail-list-item">
                      {c.sign_token ? (
                        <a href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-sign?token=${c.sign_token}`} target="_blank" rel="noopener noreferrer" style={{ color: '#7EAAF2', textDecoration: 'none' }}>{c.title || c.template_name}</a>
                      ) : (
                        <span>{c.title || c.template_name}</span>
                      )}
                      <span className="detail-list-meta" style={{
                        color: c.status === 'signed' ? '#357A38' : c.status === 'sent' || c.status === 'viewed' ? '#C9922E' : '#929BAA'
                      }}>{c.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="detail-section">
              <h3 className="detail-section-title">Quick Actions</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="modal-btn-save" style={{ fontSize: 13 }}
                  onClick={() => { onClose(); navigate('/scheduling', { state: { fromClient: { client_id: client.id, business_name: client.business_name || client.contact_name } } }) }}>
                  New Event
                </button>
                <button className="modal-btn-save" style={{ fontSize: 13, background: COLORS.blue }}
                  onClick={() => { onClose(); navigate('/financials', { state: { fromClient: { client_id: client.id, business_name: client.business_name || client.contact_name } } }) }}>
                  New Invoice
                </button>
                <button className="modal-btn-save" style={{ fontSize: 13, background: COLORS.amber }}
                  onClick={() => { onClose(); navigate(`/contracts?client_id=${client.id}`) }}>
                  New Contract
                </button>
              </div>
            </div>

            <div className="detail-actions" style={{ justifyContent: 'space-between' }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#C23B22' }}>Delete this client?</span>
                  <button className="modal-btn-cancel" onClick={() => setConfirmDelete(false)}>No</button>
                  <button className="modal-btn-save" style={{ background: '#C23B22' }} onClick={handleDelete}>Yes, Delete</button>
                </div>
              ) : (
                <button className="modal-btn-cancel" style={{ color: '#C23B22', borderColor: '#C23B2244' }} onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
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
                <label className="modal-field"><span>Client Type</span>
                  <select value={form.client_type || ''} onChange={e => setForm({...form, client_type: e.target.value})}>
                    <option value="">Select...</option>
                    {CLIENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/-/g, ' ')}</option>)}
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

const CLIENTS_PAGE_SIZE = 25

export default function Clients() {
  const navigate = useNavigate()
  const location = useLocation()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)

  // Open AddClientModal when arriving from Pipeline "Convert to Client"
  useEffect(() => {
    if (location.state?.fromDeal) {
      setShowAdd(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadClients = async () => {
    setLoading(true)
    setLoadError('')
    const from = page * CLIENTS_PAGE_SIZE
    const to = from + CLIENTS_PAGE_SIZE - 1
    let q = supabase.from('clients').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filterLine) q = q.eq('service_line', filterLine)
    if (filterStatus) q = q.eq('status', filterStatus)
    q = q.range(from, to)
    const { data, count, error } = await q
    if (error) { setLoadError('Failed to load clients. Please refresh.'); if (import.meta.env.DEV) console.error('Load clients error:', error.message) }
    setClients(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  useEffect(() => { setPage(0) }, [filterLine, filterStatus])
  useEffect(() => { loadClients() }, [filterLine, filterStatus, page])

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
          <p>{totalCount} total client{totalCount !== 1 ? 's' : ''}</p>
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

      {Math.ceil(totalCount / CLIENTS_PAGE_SIZE) > 1 && (
        <div className="pagination">
          <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="pagination-info">Page {page + 1} of {Math.ceil(totalCount / CLIENTS_PAGE_SIZE)}</span>
          <button className="pagination-btn" disabled={page >= Math.ceil(totalCount / CLIENTS_PAGE_SIZE) - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {showAdd && <AddClientModal onClose={() => setShowAdd(false)} onSaved={() => { loadClients(); showToast('Client added') }} fromDeal={location.state?.fromDeal} />}
      {selected && <ClientDetail client={selected} onClose={() => setSelected(null)} onUpdated={() => { loadClients(); setSelected(null); showToast('Client updated') }} onDeleted={() => { loadClients(); setSelected(null); showToast('Client deleted') }} navigate={navigate} />}
    </div>
  )
}
