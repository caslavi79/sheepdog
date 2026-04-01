import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'

const PAGE_SIZE = 25
const STATUSES = ['draft', 'sent', 'paid', 'overdue']
const SERVICE_LINES = ['events', 'staffing', 'both']
const PAYMENT_METHODS = ['cash', 'check', 'zelle', 'venmo', 'card', 'ach', 'other']
const STATUS_COLORS = { draft: '#929BAA', sent: '#3D5A80', paid: '#357A38', overdue: '#D4483A' }

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#929BAA'
  return (
    <span style={{ display: 'inline-block', fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: c, background: `${c}22`, padding: '3px 10px', borderRadius: 3 }}>{status}</span>
  )
}

function ServiceBadge({ line }) {
  const colors = { events: '#C9922E', staffing: '#3D5A80', both: '#7A8490' }
  const c = colors[line] || '#7A8490'
  return (
    <span style={{ display: 'inline-block', fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: c, background: `${c}22`, padding: '3px 10px', borderRadius: 3 }}>{line || '—'}</span>
  )
}

function fmtMoney(n) { return n != null ? `$${parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—' }
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }

/* ─── Line Items Editor ─── */
function LineItemsEditor({ items, onChange }) {
  const add = () => onChange([...items, { description: '', hours: '', rate: '', total: 0 }])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i, field, val) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: val }
      if (field === 'hours' || field === 'rate') {
        const h = parseFloat(updated.hours) || 0
        const r = parseFloat(updated.rate) || 0
        updated.total = Math.round(h * r * 100) / 100
      }
      return updated
    })
    onChange(next)
  }

  return (
    <div className="line-items-editor">
      <div className="line-items-header">
        <span style={{ flex: 3 }}>Description</span>
        <span style={{ flex: 1 }}>Hours</span>
        <span style={{ flex: 1 }}>Rate</span>
        <span style={{ flex: 1 }}>Total</span>
        <span style={{ width: 32 }}></span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="line-items-row">
          <input style={{ flex: 3 }} placeholder="Security staff — 3 guards" value={item.description} onChange={e => update(i, 'description', e.target.value)} />
          <input style={{ flex: 1 }} type="number" step="0.5" min="0" placeholder="0" value={item.hours} onChange={e => update(i, 'hours', e.target.value)} />
          <input style={{ flex: 1 }} type="number" step="0.01" min="0" placeholder="0" value={item.rate} onChange={e => update(i, 'rate', e.target.value)} />
          <span className="line-items-total" style={{ flex: 1 }}>{fmtMoney(item.total)}</span>
          <button type="button" className="line-items-remove" onClick={() => remove(i)} title="Remove">×</button>
        </div>
      ))}
      <button type="button" className="line-items-add" onClick={add}>+ Add Line Item</button>
    </div>
  )
}

/* ─── Add Invoice Modal ─── */
function AddInvoiceModal({ onClose, onSaved, clients }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [form, setForm] = useState({
    client_id: '', service_line: 'events', line_items: [{ description: '', hours: '', rate: '', total: 0 }],
    tax: 0, due_date: '', status: 'draft', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const subtotal = (form.line_items || []).reduce((s, li) => s + (parseFloat(li.total) || 0), 0)
  const total = subtotal + (parseFloat(form.tax) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.client_id) { setError('Select a client'); return }
    if (!form.line_items.some(li => li.description)) { setError('Add at least one line item'); return }
    setSaving(true); setError('')
    // Generate invoice number
    const { count } = await supabase.from('invoices').select('id', { count: 'exact', head: true })
    const invoiceNumber = `SHD-${String((count || 0) + 1).padStart(4, '0')}`
    const { error: err } = await supabase.from('invoices').insert([{
      client_id: form.client_id, service_line: form.service_line, invoice_number: invoiceNumber,
      line_items: form.line_items.filter(li => li.description), subtotal, tax: parseFloat(form.tax) || 0,
      total, due_date: form.due_date || null, status: form.status, notes: form.notes || null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">New Invoice</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field">
              <span>Client *</span>
              <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>Service Line</span>
              <select value={form.service_line} onChange={e => setForm({ ...form, service_line: e.target.value })}>
                {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="modal-field" style={{ marginBottom: 8 }}>
            <span>Line Items</span>
          </label>
          <LineItemsEditor items={form.line_items} onChange={items => setForm({ ...form, line_items: items })} />
          <div className="modal-row" style={{ justifyContent: 'flex-end', gap: 24, marginTop: 8 }}>
            <div style={{ textAlign: 'right', fontSize: 14 }}><span style={{ color: 'var(--steel)' }}>Subtotal:</span> <strong>{fmtMoney(subtotal)}</strong></div>
          </div>
          <div className="modal-row">
            <label className="modal-field">
              <span>Tax ($)</span>
              <input type="number" step="0.01" min="0" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} />
            </label>
            <label className="modal-field">
              <span>Due Date</span>
              <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </label>
            <label className="modal-field">
              <span>Status</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div className="modal-row" style={{ justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--fh)', fontWeight: 700 }}>Total: {fmtMoney(total)}</div>
          </div>
          <label className="modal-field">
            <span>Notes</span>
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Internal notes..." />
          </label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : 'Create Invoice'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ─── Invoice Detail Modal ─── */
function InvoiceDetail({ invoice, clients, onClose, onUpdated, onDeleted, showToast }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...invoice, line_items: invoice.line_items || [] })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')

  const clientName = (() => {
    const c = clients.find(cl => cl.id === invoice.client_id)
    return c ? (c.business_name || c.contact_name) : '—'
  })()

  const subtotal = (form.line_items || []).reduce((s, li) => s + (parseFloat(li.total) || 0), 0)
  const total = subtotal + (parseFloat(form.tax) || 0)

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    const { id, created_at, ...rest } = form
    const { error } = await supabase.from('invoices').update({
      ...rest, subtotal, total, updated_at: new Date().toISOString()
    }).eq('id', invoice.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setEditing(false); onUpdated()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (error) { if (import.meta.env.DEV) console.error('Delete error:', error.message); setConfirmDelete(false); return }
    onDeleted(); onClose()
  }

  const handleMarkSent = async () => {
    const { error } = await supabase.from('invoices').update({ status: 'sent', updated_at: new Date().toISOString() }).eq('id', invoice.id)
    if (!error) { showToast('Marked as Sent'); onUpdated(); onClose() }
  }

  const handleMarkPaid = async () => {
    const { error } = await supabase.from('invoices').update({
      status: 'paid', payment_date: new Date().toISOString().split('T')[0],
      payment_method: payMethod, updated_at: new Date().toISOString()
    }).eq('id', invoice.id)
    if (!error) { showToast('Marked as Paid'); onUpdated(); onClose() }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{invoice.invoice_number || 'Invoice'}</h2>
            <p className="detail-business">{clientName}</p>
          </div>
          <StatusBadge status={invoice.status} />
        </div>

        {payModal && (
          <div style={{ background: 'var(--dark)', border: '1px solid #333', borderRadius: 8, padding: 20, margin: '0 0 16px' }}>
            <p style={{ fontSize: 14, marginBottom: 12, fontWeight: 600 }}>Payment Method</p>
            <select style={{ width: '100%', marginBottom: 12, padding: '10px 12px', background: 'var(--char)', color: 'var(--white)', border: '1px solid #333', borderRadius: 6, fontSize: 14 }} value={payMethod} onChange={e => setPayMethod(e.target.value)}>
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="modal-btn-cancel" onClick={() => setPayModal(false)}>Cancel</button>
              <button className="modal-btn-save" style={{ background: 'var(--green)' }} onClick={handleMarkPaid}>Confirm Paid</button>
            </div>
          </div>
        )}

        {!editing ? (
          <div className="detail-body">
            <div className="detail-section">
              <h3 className="detail-section-title">Details</h3>
              <div className="detail-grid">
                <div className="detail-item"><span className="detail-label">Service</span><ServiceBadge line={invoice.service_line} /></div>
                <div className="detail-item"><span className="detail-label">Total</span><span style={{ fontWeight: 700, fontSize: 16 }}>{fmtMoney(invoice.total)}</span></div>
                <div className="detail-item"><span className="detail-label">Subtotal</span><span>{fmtMoney(invoice.subtotal)}</span></div>
                <div className="detail-item"><span className="detail-label">Tax</span><span>{fmtMoney(invoice.tax)}</span></div>
                <div className="detail-item"><span className="detail-label">Due Date</span><span>{fmtDate(invoice.due_date)}</span></div>
                <div className="detail-item"><span className="detail-label">Created</span><span>{new Date(invoice.created_at).toLocaleDateString()}</span></div>
                {invoice.payment_date && <div className="detail-item"><span className="detail-label">Paid On</span><span>{fmtDate(invoice.payment_date)}</span></div>}
                {invoice.payment_method && <div className="detail-item"><span className="detail-label">Payment Method</span><span style={{ textTransform: 'capitalize' }}>{invoice.payment_method}</span></div>}
              </div>
            </div>

            {invoice.line_items && invoice.line_items.length > 0 && (
              <div className="detail-section">
                <h3 className="detail-section-title">Line Items</h3>
                <table className="line-items-table">
                  <thead><tr><th>Description</th><th>Hrs</th><th>Rate</th><th>Total</th></tr></thead>
                  <tbody>
                    {invoice.line_items.map((li, i) => (
                      <tr key={i}><td>{li.description}</td><td>{li.hours}</td><td>{fmtMoney(li.rate)}</td><td>{fmtMoney(li.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {invoice.notes && (
              <div className="detail-section">
                <h3 className="detail-section-title">Notes</h3>
                <p style={{ fontSize: 14, color: 'var(--slate)', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
              </div>
            )}

            <div className="detail-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--red)' }}>Delete this invoice?</span>
                  <button className="modal-btn-cancel" onClick={() => setConfirmDelete(false)}>No</button>
                  <button className="modal-btn-save" style={{ background: 'var(--red)' }} onClick={handleDelete}>Yes, Delete</button>
                </div>
              ) : (
                <button className="modal-btn-cancel" style={{ color: 'var(--red)', borderColor: '#D4483A44' }} onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {invoice.status === 'draft' && <button className="modal-btn-cancel" onClick={handleMarkSent}>Mark Sent</button>}
                {(invoice.status === 'sent' || invoice.status === 'overdue') && <button className="modal-btn-save" style={{ background: 'var(--green)' }} onClick={() => setPayModal(true)}>Mark Paid</button>}
                <button className="modal-btn-save" onClick={() => setEditing(true)}>Edit</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="detail-body">
            <div className="modal-row">
              <label className="modal-field">
                <span>Client</span>
                <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">Select...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
                </select>
              </label>
              <label className="modal-field">
                <span>Service Line</span>
                <select value={form.service_line || ''} onChange={e => setForm({ ...form, service_line: e.target.value })}>
                  {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label className="modal-field" style={{ marginBottom: 8 }}><span>Line Items</span></label>
            <LineItemsEditor items={form.line_items} onChange={items => setForm({ ...form, line_items: items })} />
            <div className="modal-row">
              <label className="modal-field">
                <span>Tax ($)</span>
                <input type="number" step="0.01" min="0" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} />
              </label>
              <label className="modal-field">
                <span>Due Date</span>
                <input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} />
              </label>
              <label className="modal-field">
                <span>Status</span>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <div style={{ textAlign: 'right', fontSize: 16, fontFamily: 'var(--fh)', fontWeight: 700, margin: '8px 0' }}>Total: {fmtMoney(total)}</div>
            <label className="modal-field">
              <span>Notes</span>
              <textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </label>
            {saveError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{saveError}</p>}
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => { setEditing(false); setForm({ ...invoice, line_items: invoice.line_items || [] }) }}>Cancel</button>
              <button type="button" className="modal-btn-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Main Financials Page ─── */
export default function Financials() {
  const [invoices, setInvoices] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)
  const [stats, setStats] = useState({ outstanding: '—', paidMonth: '—', overdue: '—', thisMonth: '—' })

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    let q = supabase.from('invoices').select('*', { count: 'exact' }).order('created_at', { ascending: false })
    if (filterStatus) q = q.eq('status', filterStatus)
    if (filterLine) q = q.eq('service_line', filterLine)
    q = q.range(from, to)
    const { data, count, error } = await q
    if (error) { setLoadError('Failed to load invoices. Please refresh.'); if (import.meta.env.DEV) console.error('Load invoices:', error.message) }
    else { setInvoices(data || []); setTotalCount(count || 0) }
    setLoading(false)
  }, [page, filterStatus, filterLine])

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, contact_name, business_name').order('business_name')
    setClients(data || [])
  }, [])

  const loadStats = useCallback(async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { data } = await supabase.from('invoices').select('status, total, created_at, payment_date')
    if (!data) return
    const outstanding = data.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
    const paidMonth = data.filter(i => i.status === 'paid' && i.payment_date && i.payment_date >= monthStart.split('T')[0]).reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
    const overdue = data.filter(i => i.status === 'overdue').length
    const thisMonth = data.filter(i => i.created_at >= monthStart).length
    setStats({
      outstanding: fmtMoney(outstanding),
      paidMonth: fmtMoney(paidMonth),
      overdue,
      thisMonth,
    })
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadClients() }, [loadClients])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { setPage(0) }, [filterStatus, filterLine])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.business_name || c.contact_name]))

  const filtered = invoices.filter(inv => {
    if (!search) return true
    const s = search.toLowerCase()
    const name = (clientMap[inv.client_id] || '').toLowerCase()
    return name.includes(s) || (inv.invoice_number || '').toLowerCase().includes(s)
  })

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const handleSaved = () => { load(); loadStats(); showToast('Invoice created') }
  const handleUpdated = () => { load(); loadStats(); setSelected(null) }
  const handleDeleted = () => { load(); loadStats(); showToast('Invoice deleted') }

  return (
    <div className="clients">
      <div className="clients-header">
        <div>
          <h1>Invoices</h1>
          <p className="clients-subtitle">Create, track, and manage invoices</p>
        </div>
        <button className="clients-add-btn" onClick={() => setShowAdd(true)}>+ New Invoice</button>
      </div>

      <div className="hub-stats" style={{ marginBottom: 24 }}>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.outstanding}</div><div className="hub-stat-label">Outstanding</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.paidMonth}</div><div className="hub-stat-label">Paid This Month</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.overdue}</div><div className="hub-stat-label">Overdue</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.thisMonth}</div><div className="hub-stat-label">Invoices This Month</div></div>
      </div>

      {loadError && (
        <div className="clients-error" role="alert">
          <p>{loadError}</p>
          <button onClick={load}>Retry</button>
        </div>
      )}

      <div className="clients-toolbar">
        <input className="clients-search" placeholder="Search client or invoice #..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="clients-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
        <select className="clients-filter" value={filterLine} onChange={e => setFilterLine(e.target.value)}>
          <option value="">All Services</option>
          {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="clients-loading">Loading invoices...</div>
      ) : filtered.length === 0 ? (
        <div className="clients-empty">{invoices.length === 0 ? 'No invoices yet. Create your first one.' : 'No invoices match your filters.'}</div>
      ) : (
        <>
          <div className="clients-table-wrap">
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
                  <th>Service</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id} onClick={() => setSelected(inv)}>
                    <td className="clients-name">{inv.invoice_number || '—'}</td>
                    <td>{clientMap[inv.client_id] || '—'}</td>
                    <td><ServiceBadge line={inv.service_line} /></td>
                    <td style={{ fontWeight: 600 }}>{fmtMoney(inv.total)}</td>
                    <td><StatusBadge status={inv.status} /></td>
                    <td>{fmtDate(inv.due_date)}</td>
                    <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span className="pagination-info">Page {page + 1} of {totalPages}</span>
              <button className="pagination-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      {showAdd && <AddInvoiceModal onClose={() => setShowAdd(false)} onSaved={handleSaved} clients={clients} />}
      {selected && <InvoiceDetail invoice={selected} clients={clients} onClose={() => setSelected(null)} onUpdated={handleUpdated} onDeleted={handleDeleted} showToast={showToast} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
