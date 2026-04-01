import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { fmtMoney, fmtDate, daysUntil, badgeStyle, COLORS } from '../lib/format'

const PAGE_SIZE = 25
const STATUSES = ['draft', 'sent', 'paid', 'overdue']
const SERVICE_LINES = ['events', 'staffing', 'both']
const PAYMENT_METHODS = ['cash', 'check', 'zelle', 'venmo', 'card', 'ach', 'other']
const STATUS_COLORS = { draft: '#929BAA', sent: '#3D5A80', paid: '#357A38', overdue: '#D4483A' }

/* Auto-detect overdue: if status is 'sent' and due_date is past, treat as overdue */
function effectiveStatus(inv) {
  if (inv.status === 'sent' && inv.due_date) {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const due = new Date(inv.due_date + 'T00:00:00')
    if (due < now) return 'overdue'
  }
  return inv.status
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#929BAA'
  return <span style={badgeStyle(c)}>{status}</span>
}

function ServiceBadge({ line }) {
  const colors = { events: '#C9922E', staffing: '#3D5A80', both: '#7A8490' }
  const c = colors[line] || '#7A8490'
  return <span style={badgeStyle(c)}>{line || '—'}</span>
}

/* ═══════════════════════════════════════════════════════════
   LINE ITEMS EDITOR (Client-Facing)
   ═══════════════════════════════════════════════════════════ */
function LineItemsEditor({ items, onChange }) {
  const add = () => onChange([...items, { description: '', hours: '', rate: '', total: 0 }])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const update = (i, field, val) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: val }
      if (field === 'hours' || field === 'rate') {
        updated.total = Math.round((parseFloat(updated.hours) || 0) * (parseFloat(updated.rate) || 0) * 100) / 100
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

/* ═══════════════════════════════════════════════════════════
   STAFF ASSIGNMENTS EDITOR (Internal)
   ═══════════════════════════════════════════════════════════ */
function StaffAssignmentsEditor({ items, onChange, staffRoster, payRateDefaults, serviceLine, revenue, onAddToRoster, licenses }) {
  const add = () => onChange([...items, { name: '', staff_id: null, role: '', hours: '', pay_rate: '', pay_total: 0 }])
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i))
  const [focusIdx, setFocusIdx] = useState(null)

  const update = (i, field, val) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item
      const updated = { ...item, [field]: val }
      // Auto-link to roster when name matches
      if (field === 'name') {
        const match = staffRoster.find(s => s.name.toLowerCase() === val.toLowerCase())
        if (match) {
          updated.staff_id = match.id
          updated.role = updated.role || match.role || ''
          updated.pay_rate = updated.pay_rate || match.default_pay_rate || ''
        } else {
          updated.staff_id = null
        }
      }
      // Auto-fill pay rate from defaults when role changes
      if (field === 'role' && !updated.pay_rate) {
        const def = payRateDefaults.find(d => d.role.toLowerCase() === val.toLowerCase() && d.service_line === serviceLine)
        if (def) updated.pay_rate = def.rate
      }
      if (field === 'hours' || field === 'pay_rate') {
        updated.pay_total = Math.round((parseFloat(updated.hours) || 0) * (parseFloat(updated.pay_rate) || 0) * 100) / 100
      }
      return updated
    })
    onChange(next)
  }

  const selectRosterMember = (i, member) => {
    const next = items.map((item, idx) => {
      if (idx !== i) return item
      const payRate = member.default_pay_rate || ''
      return { ...item, name: member.name, staff_id: member.id, role: member.role || item.role, pay_rate: payRate, pay_total: Math.round((parseFloat(item.hours) || 0) * (parseFloat(payRate) || 0) * 100) / 100 }
    })
    onChange(next)
    setFocusIdx(null)
  }

  const totalLabor = items.reduce((s, li) => s + (parseFloat(li.pay_total) || 0), 0)
  const margin = (parseFloat(revenue) || 0) - totalLabor
  const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0

  return (
    <div className="line-items-editor">
      <div className="line-items-header">
        <span style={{ flex: 2 }}>Name</span>
        <span style={{ flex: 1.5 }}>Role</span>
        <span style={{ flex: 1 }}>Hours</span>
        <span style={{ flex: 1 }}>Pay Rate</span>
        <span style={{ flex: 1 }}>Pay Total</span>
        <span style={{ width: 32 }}></span>
      </div>
      {items.map((item, i) => {
        const nameVal = item.name || ''
        const suggestions = nameVal.length >= 1 && focusIdx === i
          ? staffRoster.filter(s => s.name.toLowerCase().includes(nameVal.toLowerCase()))
          : []
        const noMatch = nameVal.length >= 2 && !staffRoster.some(s => s.name.toLowerCase() === nameVal.toLowerCase())
        // License warning
        const staffLics = item.staff_id && licenses ? licenses.filter(l => l.staff_id === item.staff_id) : []
        const hasExpired = staffLics.some(l => { const d = daysUntil(l.expiration_date); return d !== null && d < 0 })
        const hasExpiring = staffLics.some(l => { const d = daysUntil(l.expiration_date); return d !== null && d >= 0 && d <= 14 })

        return (
          <div key={i} className="staff-assign-row">
            <div style={{ flex: 2, position: 'relative' }}>
              <input placeholder="Staff name" value={nameVal} onChange={e => update(i, 'name', e.target.value)} onFocus={() => setFocusIdx(i)} onBlur={() => setTimeout(() => setFocusIdx(null), 200)} style={hasExpired ? { borderColor: COLORS.red } : hasExpiring ? { borderColor: COLORS.amber } : undefined} />
              {suggestions.length > 0 && (
                <div className="staff-autocomplete">
                  {suggestions.map(s => (
                    <button key={s.id} type="button" className="staff-autocomplete-item" onMouseDown={() => selectRosterMember(i, s)}>
                      <strong>{s.name}</strong>{s.role && <span style={{ color: 'var(--steel)', marginLeft: 8 }}>{s.role}</span>}
                      {s.default_pay_rate && <span style={{ color: 'var(--steel)', marginLeft: 8 }}>{fmtMoney(s.default_pay_rate)}/hr</span>}
                    </button>
                  ))}
                </div>
              )}
              {noMatch && focusIdx === i && (
                <button type="button" className="add-to-roster-btn" onMouseDown={() => onAddToRoster(nameVal)}>+ Add "{nameVal}" to roster</button>
              )}
              {hasExpired && <span style={{ fontSize: 11, color: COLORS.red, fontWeight: 600, marginTop: 2, display: 'block' }}>Expired license</span>}
              {!hasExpired && hasExpiring && <span style={{ fontSize: 11, color: COLORS.amber, fontWeight: 600, marginTop: 2, display: 'block' }}>License expiring soon</span>}
            </div>
            <input style={{ flex: 1.5 }} placeholder="Security Guard" value={item.role} onChange={e => update(i, 'role', e.target.value)} />
            <input style={{ flex: 1 }} type="number" step="0.5" min="0" placeholder="0" value={item.hours} onChange={e => update(i, 'hours', e.target.value)} />
            <input style={{ flex: 1 }} type="number" step="0.01" min="0" placeholder="0" value={item.pay_rate} onChange={e => update(i, 'pay_rate', e.target.value)} />
            <span className="line-items-total" style={{ flex: 1 }}>{fmtMoney(item.pay_total)}</span>
            <button type="button" className="line-items-remove" onClick={() => remove(i)} title="Remove">×</button>
          </div>
        )
      })}
      <button type="button" className="line-items-add" onClick={add}>+ Assign Staff</button>
      {items.length > 0 && (
        <div className="cost-summary">
          <div className="cost-summary-row"><span>Total Labor</span><strong>{fmtMoney(totalLabor)}</strong></div>
          <div className="cost-summary-row"><span>Revenue</span><strong>{fmtMoney(revenue)}</strong></div>
          <div className="cost-summary-row" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4 }}>
            <span>Margin</span>
            <strong style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(margin)} <span style={{ fontSize: 12, fontWeight: 400 }}>({marginPct}%)</span></strong>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   PAY RATE DEFAULTS MODAL
   ═══════════════════════════════════════════════════════════ */
function PayRateDefaultsModal({ onClose, payRateDefaults, onRefresh, showToast }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [rates, setRates] = useState(payRateDefaults)
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState({ role: '', service_line: 'events', rate: '' })
  const [editId, setEditId] = useState(null)
  const [editRow, setEditRow] = useState({})
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  useEffect(() => { setRates(payRateDefaults) }, [payRateDefaults])

  const inputStyle = { background: 'var(--char)', border: '1px solid #333', borderRadius: 4, padding: '4px 8px', color: 'var(--white)', width: '100%' }

  const handleAdd = async () => {
    if (!newRow.role.trim() || !newRow.rate) return
    const { error } = await supabase.from('pay_rate_defaults').upsert([{ role: newRow.role.trim(), service_line: newRow.service_line, rate: parseFloat(newRow.rate) }], { onConflict: 'role,service_line' })
    if (error) { if (import.meta.env.DEV) console.error('Add rate:', error.message); return }
    setNewRow({ role: '', service_line: 'events', rate: '' }); setAdding(false); onRefresh(); showToast('Pay rate saved')
  }

  const handleSaveEdit = async () => {
    const { error } = await supabase.from('pay_rate_defaults').update({ role: editRow.role, service_line: editRow.service_line, rate: parseFloat(editRow.rate) }).eq('id', editId)
    if (error) { if (import.meta.env.DEV) console.error('Edit rate:', error.message); return }
    setEditId(null); onRefresh(); showToast('Pay rate updated')
  }

  const handleDelete = async (id) => {
    const { error } = await supabase.from('pay_rate_defaults').delete().eq('id', id)
    if (error) { if (import.meta.env.DEV) console.error('Delete rate:', error.message); return }
    setConfirmDeleteId(null); onRefresh(); showToast('Pay rate removed')
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Default Pay Rates</h2>
        <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 16 }}>Set default hourly rates by role and service line. These auto-fill when you assign staff to invoices.</p>
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead><tr><th>Role</th><th>Service Line</th><th>Rate</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {rates.map(r => (
                editId === r.id ? (
                  <tr key={r.id}>
                    <td><input value={editRow.role} onChange={e => setEditRow({ ...editRow, role: e.target.value })} style={inputStyle} /></td>
                    <td><select value={editRow.service_line} onChange={e => setEditRow({ ...editRow, service_line: e.target.value })} style={inputStyle}>{SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                    <td><input type="number" step="0.01" value={editRow.rate} onChange={e => setEditRow({ ...editRow, rate: e.target.value })} style={inputStyle} /></td>
                    <td><button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleSaveEdit}>Save</button> <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setEditId(null)}>×</button></td>
                  </tr>
                ) : (
                  <tr key={r.id}>
                    <td className="clients-name">{r.role}</td>
                    <td><ServiceBadge line={r.service_line} /></td>
                    <td style={{ fontWeight: 600 }}>${r.rate}/hr</td>
                    <td>
                      {confirmDeleteId === r.id ? (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button className="modal-btn-save" style={{ fontSize: 11, padding: '2px 8px', background: 'var(--red)' }} onClick={() => handleDelete(r.id)}>Yes</button>
                          <button className="modal-btn-cancel" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setConfirmDeleteId(null)}>No</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 4 }}>
                          <button style={{ background: 'none', border: 'none', color: 'var(--steel)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setEditId(r.id); setEditRow(r) }}>Edit</button>
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => setConfirmDeleteId(r.id)}>Del</button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              ))}
              {adding && (
                <tr>
                  <td><input placeholder="Security Guard" value={newRow.role} onChange={e => setNewRow({ ...newRow, role: e.target.value })} style={inputStyle} /></td>
                  <td>
                    <select value={newRow.service_line} onChange={e => setNewRow({ ...newRow, service_line: e.target.value })} style={inputStyle}>
                      {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><input type="number" step="0.01" placeholder="$/hr" value={newRow.rate} onChange={e => setNewRow({ ...newRow, rate: e.target.value })} style={inputStyle} /></td>
                  <td><button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 10px' }} onClick={handleAdd}>Add</button> <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => setAdding(false)}>×</button></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!adding && <button type="button" className="line-items-add" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ Add Pay Rate</button>}
        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   QUICK ADD TO ROSTER MODAL (from staff assignments editor)
   ═══════════════════════════════════════════════════════════ */
function QuickAddStaffModal({ name, onClose, onAdded }) {
  useEscapeKey(onClose)
  const [form, setForm] = useState({ name, role: '', phone: '', email: '', default_pay_rate: '' })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const { data, error } = await supabase.from('staff').insert([{ ...form, default_pay_rate: parseFloat(form.default_pay_rate) || null }]).select()
    setSaving(false)
    if (error) { if (import.meta.env.DEV) console.error('Quick add staff:', error.message); return }
    onAdded(data[0])
  }

  return (
    <div style={{ background: 'var(--dark)', border: '1px solid #333', borderRadius: 8, padding: 16, margin: '8px 0' }}>
      <p style={{ fontSize: 13, fontFamily: 'var(--fh)', fontWeight: 700, marginBottom: 10 }}>Add to Staff Roster</p>
      <div className="modal-row">
        <label className="modal-field"><span>Name</span><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
        <label className="modal-field"><span>Role</span><input placeholder="Security Guard" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} /></label>
      </div>
      <div className="modal-row">
        <label className="modal-field"><span>Phone</span><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="modal-field"><span>Default Rate ($/hr)</span><input type="number" step="0.01" value={form.default_pay_rate} onChange={e => setForm({ ...form, default_pay_rate: e.target.value })} /></label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={onClose}>Cancel</button>
        <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px' }} disabled={saving} onClick={handleSave}>{saving ? '...' : 'Add to Roster'}</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ADD INVOICE MODAL
   ═══════════════════════════════════════════════════════════ */
function AddInvoiceModal({ onClose, onSaved, clients, onGoToClients, staffRoster, payRateDefaults, licenses, onStaffRefresh }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [form, setForm] = useState({
    client_id: '', service_line: 'events',
    line_items: [{ description: '', hours: '', rate: '', total: 0 }],
    tax: 0, due_date: '', status: 'draft', notes: '',
    // Internal
    event_date: '', event_start_time: '', event_end_time: '', venue_name: '',
    internal_line_items: [], internal_notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showInternal, setShowInternal] = useState(false)
  const [quickAddName, setQuickAddName] = useState(null)

  const subtotal = (form.line_items || []).reduce((s, li) => s + (parseFloat(li.total) || 0), 0)
  const total = subtotal + (parseFloat(form.tax) || 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.client_id) { setError('Select a client'); return }
    if (!form.line_items.some(li => li.description)) { setError('Add at least one line item'); return }
    setSaving(true); setError('')
    const { data: lastInv } = await supabase.from('invoices').select('invoice_number').order('created_at', { ascending: false }).limit(1)
    const lastNum = lastInv?.[0]?.invoice_number ? parseInt(lastInv[0].invoice_number.replace('SHD-', '')) : 0
    const invoiceNumber = `SHD-${String((lastNum || 0) + 1).padStart(4, '0')}`
    const { error: err } = await supabase.from('invoices').insert([{
      client_id: form.client_id, service_line: form.service_line, invoice_number: invoiceNumber,
      line_items: form.line_items.filter(li => li.description), subtotal, tax: parseFloat(form.tax) || 0,
      total, due_date: form.due_date || null, status: form.status, notes: form.notes || null,
      // Internal
      event_date: form.event_date || null, event_start_time: form.event_start_time || null,
      event_end_time: form.event_end_time || null, venue_name: form.venue_name || null,
      internal_line_items: (form.internal_line_items || []).filter(li => li.name),
      internal_notes: form.internal_notes || null,
    }])
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved(); onClose()
  }

  const handleQuickAddDone = (newStaff) => {
    setQuickAddName(null)
    onStaffRefresh()
    // Auto-add them to internal line items
    setForm(prev => ({
      ...prev,
      internal_line_items: [...prev.internal_line_items, {
        name: newStaff.name, staff_id: newStaff.id, role: newStaff.role || '',
        hours: '', pay_rate: newStaff.default_pay_rate || '', pay_total: 0
      }]
    }))
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <h2 className="modal-title">New Invoice</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          {/* CLIENT-FACING SECTION */}
          <div className="modal-row">
            <label className="modal-field">
              <span>Client *</span>
              <select required value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
              </select>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--steel)', fontSize: 13, fontFamily: 'var(--fh)', fontWeight: 600, cursor: 'pointer', padding: '4px 0 0', textAlign: 'left' }} onClick={onGoToClients}>+ New Client</button>
            </label>
            <label className="modal-field">
              <span>Service Line</span>
              <select value={form.service_line} onChange={e => setForm({ ...form, service_line: e.target.value })}>
                {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="modal-field" style={{ marginBottom: 8 }}><span>Line Items (Client-Facing)</span></label>
          <LineItemsEditor items={form.line_items} onChange={items => setForm({ ...form, line_items: items })} />
          <div className="modal-row" style={{ justifyContent: 'flex-end', gap: 24, marginTop: 8 }}>
            <div style={{ textAlign: 'right', fontSize: 14 }}><span style={{ color: 'var(--steel)' }}>Subtotal:</span> <strong>{fmtMoney(subtotal)}</strong></div>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Tax ($)</span><input type="number" step="0.01" min="0" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} /></label>
            <label className="modal-field"><span>Due Date</span><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></label>
            <label className="modal-field">
              <span>Status</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          <div className="modal-row" style={{ justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 18, fontFamily: 'var(--fh)', fontWeight: 700 }}>Total: {fmtMoney(total)}</div>
          </div>
          <label className="modal-field"><span>Client Notes</span><textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes visible on client copy..." /></label>

          {/* INTERNAL SECTION (Collapsible) */}
          <button type="button" className="collapsible-toggle" onClick={() => setShowInternal(!showInternal)}>
            <span>{showInternal ? '▾' : '▸'} Event & Internal Details</span>
          </button>
          {showInternal && (
            <div className="collapsible-section">
              <div className="modal-row">
                <label className="modal-field"><span>Event Date</span><input type="date" value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} /></label>
                <label className="modal-field"><span>Start Time</span><input type="time" value={form.event_start_time} onChange={e => setForm({ ...form, event_start_time: e.target.value })} /></label>
                <label className="modal-field"><span>End Time</span><input type="time" value={form.event_end_time} onChange={e => setForm({ ...form, event_end_time: e.target.value })} /></label>
              </div>
              <label className="modal-field"><span>Venue / Location</span><input value={form.venue_name} onChange={e => setForm({ ...form, venue_name: e.target.value })} placeholder="The Rusty Nail, Northgate" /></label>
              <label className="modal-field" style={{ marginTop: 12, marginBottom: 8 }}><span>Staff Assignments (Internal)</span></label>
              {quickAddName ? (
                <QuickAddStaffModal name={quickAddName} onClose={() => setQuickAddName(null)} onAdded={handleQuickAddDone} />
              ) : (
                <StaffAssignmentsEditor
                  items={form.internal_line_items}
                  onChange={items => setForm({ ...form, internal_line_items: items })}
                  staffRoster={staffRoster} payRateDefaults={payRateDefaults}
                  serviceLine={form.service_line} revenue={total}
                  onAddToRoster={(name) => setQuickAddName(name)}
                  licenses={licenses}
                />
              )}
              <label className="modal-field" style={{ marginTop: 12 }}><span>Internal Notes</span><textarea rows={2} value={form.internal_notes} onChange={e => setForm({ ...form, internal_notes: e.target.value })} placeholder="Internal reference only..." /></label>
            </div>
          )}

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

/* ═══════════════════════════════════════════════════════════
   INVOICE DETAIL MODAL (Tabbed: Client | Internal)
   ═══════════════════════════════════════════════════════════ */
function InvoiceDetail({ invoice, clients, onClose, onUpdated, onDeleted, showToast, staffRoster, payRateDefaults, licenses, onStaffRefresh }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [tab, setTab] = useState('client')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ ...invoice, line_items: invoice.line_items || [], internal_line_items: invoice.internal_line_items || [] })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [payModal, setPayModal] = useState(false)
  const [payMethod, setPayMethod] = useState('cash')
  const [quickAddName, setQuickAddName] = useState(null)

  const clientName = (() => {
    const c = clients.find(cl => cl.id === invoice.client_id)
    return c ? (c.business_name || c.contact_name) : '—'
  })()

  const subtotal = (form.line_items || []).reduce((s, li) => s + (parseFloat(li.total) || 0), 0)
  const total = subtotal + (parseFloat(form.tax) || 0)
  const totalLabor = (invoice.internal_line_items || []).reduce((s, li) => s + (parseFloat(li.pay_total) || 0), 0)
  const margin = (parseFloat(invoice.total) || 0) - totalLabor
  const marginPct = invoice.total > 0 ? Math.round((margin / invoice.total) * 100) : 0

  const handleSave = async () => {
    setSaving(true); setSaveError('')
    const { id, created_at, ...rest } = form
    const sub = (rest.line_items || []).reduce((s, li) => s + (parseFloat(li.total) || 0), 0)
    const tot = sub + (parseFloat(rest.tax) || 0)
    const { error } = await supabase.from('invoices').update({
      ...rest, subtotal: sub, total: tot, updated_at: new Date().toISOString()
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

  const handleQuickAddDone = (newStaff) => {
    setQuickAddName(null)
    onStaffRefresh()
    setForm(prev => ({
      ...prev,
      internal_line_items: [...prev.internal_line_items, {
        name: newStaff.name, staff_id: newStaff.id, role: newStaff.role || '',
        hours: '', pay_rate: newStaff.default_pay_rate || '', pay_total: 0
      }]
    }))
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="detail-panel" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{invoice.invoice_number || 'Invoice'}</h2>
            <p className="detail-business">{clientName}</p>
          </div>
          <StatusBadge status={effectiveStatus(invoice)} />
        </div>

        {/* TABS */}
        <div className="detail-tabs" role="tablist">
          <button className={`detail-tab ${tab === 'client' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'client'} onClick={() => setTab('client')}>Client</button>
          <button className={`detail-tab ${tab === 'internal' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'internal'} onClick={() => setTab('internal')}>Internal</button>
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

        {/* ─── CLIENT TAB ─── */}
        {tab === 'client' && !editing && (
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
                <table className="line-items-table"><thead><tr><th>Description</th><th>Hrs</th><th>Rate</th><th>Total</th></tr></thead>
                  <tbody>{invoice.line_items.map((li, i) => <tr key={i}><td>{li.description}</td><td>{li.hours}</td><td>{fmtMoney(li.rate)}</td><td>{fmtMoney(li.total)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            {invoice.notes && <div className="detail-section"><h3 className="detail-section-title">Notes</h3><p style={{ fontSize: 14, color: 'var(--slate)', whiteSpace: 'pre-wrap' }}>{invoice.notes}</p></div>}
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
        )}

        {/* ─── INTERNAL TAB ─── */}
        {tab === 'internal' && !editing && (
          <div className="detail-body">
            {(invoice.event_date || invoice.venue_name) && (
              <div className="detail-section">
                <h3 className="detail-section-title">Event Details</h3>
                <div className="detail-grid">
                  {invoice.event_date && <div className="detail-item"><span className="detail-label">Date</span><span>{fmtDate(invoice.event_date)}</span></div>}
                  {invoice.event_start_time && <div className="detail-item"><span className="detail-label">Start</span><span>{invoice.event_start_time}</span></div>}
                  {invoice.event_end_time && <div className="detail-item"><span className="detail-label">End</span><span>{invoice.event_end_time}</span></div>}
                  {invoice.venue_name && <div className="detail-item"><span className="detail-label">Venue</span><span>{invoice.venue_name}</span></div>}
                </div>
              </div>
            )}
            {invoice.internal_line_items && invoice.internal_line_items.length > 0 && (
              <div className="detail-section">
                <h3 className="detail-section-title">Staff Assignments</h3>
                <table className="line-items-table"><thead><tr><th>Name</th><th>Role</th><th>Hrs</th><th>Rate</th><th>Pay</th></tr></thead>
                  <tbody>{invoice.internal_line_items.map((li, i) => <tr key={i}><td style={{ fontWeight: 600 }}>{li.name}</td><td>{li.role || '—'}</td><td>{li.hours}</td><td>{fmtMoney(li.pay_rate)}</td><td>{fmtMoney(li.pay_total)}</td></tr>)}</tbody>
                </table>
                <div className="cost-summary" style={{ marginTop: 12 }}>
                  <div className="cost-summary-row"><span>Total Labor</span><strong>{fmtMoney(totalLabor)}</strong></div>
                  <div className="cost-summary-row"><span>Revenue</span><strong>{fmtMoney(invoice.total)}</strong></div>
                  <div className="cost-summary-row" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8, marginTop: 4 }}>
                    <span>Margin</span>
                    <strong style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtMoney(margin)} <span style={{ fontSize: 12, fontWeight: 400 }}>({marginPct}%)</span></strong>
                  </div>
                </div>
              </div>
            )}
            {(!invoice.internal_line_items || invoice.internal_line_items.length === 0) && !invoice.event_date && !invoice.venue_name && (
              <div className="clients-empty" style={{ margin: '24px 0' }}>No internal details added yet. Click Edit to add staff assignments and event info.</div>
            )}
            {invoice.internal_notes && <div className="detail-section"><h3 className="detail-section-title">Internal Notes</h3><p style={{ fontSize: 14, color: 'var(--slate)', whiteSpace: 'pre-wrap' }}>{invoice.internal_notes}</p></div>}
            <div className="detail-actions"><button className="modal-btn-save" onClick={() => setEditing(true)}>Edit</button></div>
          </div>
        )}

        {/* ─── EDIT MODE (both tabs) ─── */}
        {editing && (
          <div className="detail-body">
            {tab === 'client' ? (
              <>
                <div className="modal-row">
                  <label className="modal-field"><span>Client</span>
                    <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                      <option value="">Select...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
                    </select>
                  </label>
                  <label className="modal-field"><span>Service Line</span>
                    <select value={form.service_line || ''} onChange={e => setForm({ ...form, service_line: e.target.value })}>
                      {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
                <label className="modal-field" style={{ marginBottom: 8 }}><span>Line Items</span></label>
                <LineItemsEditor items={form.line_items} onChange={items => setForm({ ...form, line_items: items })} />
                <div className="modal-row">
                  <label className="modal-field"><span>Tax ($)</span><input type="number" step="0.01" min="0" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} /></label>
                  <label className="modal-field"><span>Due Date</span><input type="date" value={form.due_date || ''} onChange={e => setForm({ ...form, due_date: e.target.value })} /></label>
                  <label className="modal-field"><span>Status</span><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
                </div>
                <div style={{ textAlign: 'right', fontSize: 16, fontFamily: 'var(--fh)', fontWeight: 700, margin: '8px 0' }}>Total: {fmtMoney(total)}</div>
                <label className="modal-field"><span>Client Notes</span><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
              </>
            ) : (
              <>
                <div className="modal-row">
                  <label className="modal-field"><span>Event Date</span><input type="date" value={form.event_date || ''} onChange={e => setForm({ ...form, event_date: e.target.value })} /></label>
                  <label className="modal-field"><span>Start Time</span><input type="time" value={form.event_start_time || ''} onChange={e => setForm({ ...form, event_start_time: e.target.value })} /></label>
                  <label className="modal-field"><span>End Time</span><input type="time" value={form.event_end_time || ''} onChange={e => setForm({ ...form, event_end_time: e.target.value })} /></label>
                </div>
                <label className="modal-field"><span>Venue / Location</span><input value={form.venue_name || ''} onChange={e => setForm({ ...form, venue_name: e.target.value })} /></label>
                <label className="modal-field" style={{ marginTop: 12, marginBottom: 8 }}><span>Staff Assignments</span></label>
                {quickAddName ? (
                  <QuickAddStaffModal name={quickAddName} onClose={() => setQuickAddName(null)} onAdded={handleQuickAddDone} />
                ) : (
                  <StaffAssignmentsEditor
                    items={form.internal_line_items}
                    onChange={items => setForm({ ...form, internal_line_items: items })}
                    staffRoster={staffRoster} payRateDefaults={payRateDefaults}
                    serviceLine={form.service_line} revenue={total}
                    onAddToRoster={(name) => setQuickAddName(name)}
                    licenses={licenses}
                  />
                )}
                <label className="modal-field" style={{ marginTop: 12 }}><span>Internal Notes</span><textarea rows={2} value={form.internal_notes || ''} onChange={e => setForm({ ...form, internal_notes: e.target.value })} /></label>
              </>
            )}
            {saveError && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{saveError}</p>}
            <div className="modal-actions">
              <button type="button" className="modal-btn-cancel" onClick={() => { setEditing(false); setForm({ ...invoice, line_items: invoice.line_items || [], internal_line_items: invoice.internal_line_items || [] }) }}>Cancel</button>
              <button type="button" className="modal-btn-save" disabled={saving} onClick={handleSave}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   MAIN FINANCIALS PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Financials() {
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState([])
  const [clients, setClients] = useState([])
  const [staffRoster, setStaffRoster] = useState([])
  const [payRateDefaults, setPayRateDefaults] = useState([])
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [selected, setSelected] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showPayRates, setShowPayRates] = useState(false)
  const [mainTab, setMainTab] = useState('invoices')
  const [allInvoices, setAllInvoices] = useState([]) // for payouts + earnings (full dataset)
  const [earningsPeriod, setEarningsPeriod] = useState('month') // month, quarter, year
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)
  const [stats, setStats] = useState({ outstanding: '—', paidMonth: '—', overdue: '—', thisMonth: '—' })

  const load = useCallback(async () => {
    setLoading(true); setLoadError('')
    const from = page * PAGE_SIZE; const to = from + PAGE_SIZE - 1
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
    const { data, error } = await supabase.from('clients').select('id, contact_name, business_name').order('business_name')
    if (error && import.meta.env.DEV) console.error('Load clients:', error.message)
    setClients(data || [])
  }, [])

  const loadStaff = useCallback(async () => {
    const { data, error } = await supabase.from('staff').select('*').order('name')
    if (error && import.meta.env.DEV) console.error('Load staff:', error.message)
    setStaffRoster(data || [])
  }, [])

  const loadPayRates = useCallback(async () => {
    const { data, error } = await supabase.from('pay_rate_defaults').select('*').order('role')
    if (error && import.meta.env.DEV) console.error('Load pay rates:', error.message)
    setPayRateDefaults(data || [])
  }, [])

  const loadLicenses = useCallback(async () => {
    const { data, error } = await supabase.from('licenses').select('staff_id, expiration_date')
    if (error && import.meta.env.DEV) console.error('Load licenses:', error.message)
    setLicenses(data || [])
  }, [])

  const loadAllInvoices = useCallback(async () => {
    const { data, error } = await supabase.from('invoices').select('id, invoice_number, client_id, service_line, total, status, payment_date, internal_line_items, created_at, due_date').order('created_at', { ascending: false })
    if (error && import.meta.env.DEV) console.error('Load all invoices:', error.message)
    setAllInvoices(data || [])
  }, [])

  const loadStats = useCallback(async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { data } = await supabase.from('invoices').select('status, total, created_at, payment_date')
    if (!data) return
    const withEffective = data.map(i => ({ ...i, _status: effectiveStatus(i) }))
    const outstanding = withEffective.filter(i => i._status === 'sent' || i._status === 'overdue').reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
    const paidMonth = data.filter(i => i.status === 'paid' && i.payment_date && i.payment_date >= monthStart.split('T')[0]).reduce((s, i) => s + (parseFloat(i.total) || 0), 0)
    const overdue = withEffective.filter(i => i._status === 'overdue').length
    const thisMonth = data.filter(i => i.created_at >= monthStart).length
    setStats({ outstanding: fmtMoney(outstanding), paidMonth: fmtMoney(paidMonth), overdue, thisMonth })
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadClients(); loadStaff(); loadPayRates(); loadLicenses(); loadAllInvoices() }, [loadClients, loadStaff, loadPayRates, loadLicenses, loadAllInvoices])
  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { setPage(0) }, [filterStatus, filterLine])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.business_name || c.contact_name]))
  const filtered = invoices.filter(inv => {
    if (!search) return true
    const s = search.toLowerCase()
    return (clientMap[inv.client_id] || '').toLowerCase().includes(s) || (inv.invoice_number || '').toLowerCase().includes(s)
  })
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const handleSaved = () => { load(); loadStats(); loadAllInvoices(); showToast('Invoice created') }
  const handleUpdated = () => { load(); loadStats(); loadAllInvoices(); setSelected(null) }
  const handleDeleted = () => { load(); loadStats(); loadAllInvoices(); showToast('Invoice deleted') }

  // ─── Payout data: unpaid staff on paid invoices ───
  const unpaidStaff = useMemo(() => {
    const result = []
    allInvoices.filter(inv => inv.status === 'paid' && inv.internal_line_items?.length > 0).forEach(inv => {
      inv.internal_line_items.forEach((li, idx) => {
        if (!li.paid_out) {
          result.push({ ...li, _invoiceId: inv.id, _invoiceNumber: inv.invoice_number, _clientId: inv.client_id, _idx: idx, _paymentDate: inv.payment_date })
        }
      })
    })
    return result
  }, [allInvoices])

  const handleMarkPaidOut = async (invoiceId, itemIdx) => {
    const inv = allInvoices.find(i => i.id === invoiceId)
    if (!inv) return
    const updated = (inv.internal_line_items || []).map((li, i) => i === itemIdx ? { ...li, paid_out: true, paid_out_date: new Date().toISOString().split('T')[0] } : li)
    const { error } = await supabase.from('invoices').update({ internal_line_items: updated, updated_at: new Date().toISOString() }).eq('id', invoiceId)
    if (error) { if (import.meta.env.DEV) console.error('Mark paid out:', error.message); return }
    loadAllInvoices(); showToast('Staff member marked as paid')
  }

  const handleBulkPaidOut = async () => {
    const byInvoice = {}
    unpaidStaff.forEach(s => {
      if (!byInvoice[s._invoiceId]) byInvoice[s._invoiceId] = []
      byInvoice[s._invoiceId].push(s._idx)
    })
    for (const [invId, indices] of Object.entries(byInvoice)) {
      const inv = allInvoices.find(i => i.id === invId)
      if (!inv) continue
      const updated = (inv.internal_line_items || []).map((li, i) => indices.includes(i) ? { ...li, paid_out: true, paid_out_date: new Date().toISOString().split('T')[0] } : li)
      const { error } = await supabase.from('invoices').update({ internal_line_items: updated, updated_at: new Date().toISOString() }).eq('id', invId)
      if (error) { if (import.meta.env.DEV) console.error('Bulk payout error:', error.message); showToast('Failed to update some payouts'); return }
    }
    loadAllInvoices(); showToast(`${unpaidStaff.length} staff marked as paid`)
  }

  // ─── Staff earnings data ───
  const { earningsList, earningsTotal, ytdEarnings, ytdList, needs1099 } = useMemo(() => {
    const now = new Date()
    const periodStart = (() => {
      if (earningsPeriod === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      if (earningsPeriod === 'quarter') { const q = Math.floor(now.getMonth() / 3) * 3; return new Date(now.getFullYear(), q, 1).toISOString().split('T')[0] }
      return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    })()

    const staffEarnings = {}
    allInvoices.forEach(inv => {
      if (!inv.internal_line_items?.length) return
      inv.internal_line_items.forEach(li => {
        if (!li.paid_out || !li.paid_out_date || li.paid_out_date < periodStart) return
        const key = li.staff_id || ('name:' + li.name)
        if (!staffEarnings[key]) staffEarnings[key] = { name: li.name, staff_id: li.staff_id, total: 0, hours: 0, jobs: 0 }
        staffEarnings[key].total += parseFloat(li.pay_total) || 0
        staffEarnings[key].hours += parseFloat(li.hours) || 0
        staffEarnings[key].jobs += 1
      })
    })
    const _earningsList = Object.values(staffEarnings).sort((a, b) => b.total - a.total)
    const _earningsTotal = _earningsList.reduce((s, e) => s + e.total, 0)

    // ─── YTD totals for 1099 ───
    const ytdStart = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
    const _ytdEarnings = {}
    allInvoices.forEach(inv => {
      if (!inv.internal_line_items?.length) return
      inv.internal_line_items.forEach(li => {
        if (!li.paid_out || !li.paid_out_date || li.paid_out_date < ytdStart) return
        const key = li.staff_id || ('name:' + li.name)
        if (!_ytdEarnings[key]) _ytdEarnings[key] = { name: li.name, total: 0 }
        _ytdEarnings[key].total += parseFloat(li.pay_total) || 0
      })
    })
    const _ytdList = Object.values(_ytdEarnings).sort((a, b) => b.total - a.total)
    const _needs1099 = _ytdList.filter(e => e.total >= 600)

    return { earningsList: _earningsList, earningsTotal: _earningsTotal, ytdEarnings: _ytdEarnings, ytdList: _ytdList, needs1099: _needs1099 }
  }, [allInvoices, earningsPeriod])

  return (
    <div className="clients">
      <div className="clients-header">
        <div>
          <h1>Financials</h1>
          <p className="clients-subtitle">Invoices, payouts, and staff earnings</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="modal-btn-cancel" style={{ fontSize: 13 }} onClick={() => navigate('/compliance')}>Staff Roster</button>
          <button className="modal-btn-cancel" style={{ fontSize: 13 }} onClick={() => setShowPayRates(true)}>Pay Rates</button>
          {mainTab === 'invoices' && <button className="clients-add-btn" onClick={() => setShowAdd(true)}>+ New Invoice</button>}
        </div>
      </div>

      {/* Main Tabs */}
      <div className="detail-tabs" role="tablist" style={{ padding: 0, marginBottom: 16 }}>
        <button className={`detail-tab ${mainTab === 'invoices' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={mainTab === 'invoices'} onClick={() => setMainTab('invoices')}>Invoices</button>
        <button className={`detail-tab ${mainTab === 'payouts' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={mainTab === 'payouts'} onClick={() => setMainTab('payouts')}>Payouts{unpaidStaff.length > 0 ? ` (${unpaidStaff.length})` : ''}</button>
        <button className={`detail-tab ${mainTab === 'earnings' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={mainTab === 'earnings'} onClick={() => setMainTab('earnings')}>Staff Earnings</button>
      </div>

      {/* ─── PAYOUTS TAB ─── */}
      {mainTab === 'payouts' && (
        <>
          <div className="hub-stats" style={{ marginBottom: 24 }}>
            <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: unpaidStaff.length > 0 ? COLORS.amber : undefined }}>{unpaidStaff.length}</div><div className="hub-stat-label">Unpaid Staff</div></div>
            <div className="hub-stat-card"><div className="hub-stat-value">{fmtMoney(unpaidStaff.reduce((s, li) => s + (parseFloat(li.pay_total) || 0), 0))}</div><div className="hub-stat-label">Total Owed</div></div>
          </div>
          {unpaidStaff.length === 0 ? (
            <div className="clients-empty">All staff have been paid out. No outstanding payouts.</div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <button className="modal-btn-save" style={{ fontSize: 13 }} onClick={handleBulkPaidOut}>Mark All as Paid ({unpaidStaff.length})</button>
              </div>
              <div className="clients-table-wrap">
                <table className="clients-table">
                  <thead><tr><th>Staff</th><th>Role</th><th>Invoice</th><th>Client</th><th>Hours</th><th>Rate</th><th>Owed</th><th></th></tr></thead>
                  <tbody>
                    {unpaidStaff.map((s, i) => (
                      <tr key={`${s._invoiceId}-${s._idx}`}>
                        <td className="clients-name">{s.name}</td>
                        <td>{s.role || '—'}</td>
                        <td>{s._invoiceNumber || '—'}</td>
                        <td>{clientMap[s._clientId] || '—'}</td>
                        <td>{s.hours || '—'}</td>
                        <td>{fmtMoney(s.pay_rate)}</td>
                        <td style={{ fontWeight: 600 }}>{fmtMoney(s.pay_total)}</td>
                        <td><button className="modal-btn-save" style={{ fontSize: 11, padding: '2px 10px', background: COLORS.green }} onClick={() => handleMarkPaidOut(s._invoiceId, s._idx)}>Paid</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── STAFF EARNINGS TAB ─── */}
      {mainTab === 'earnings' && (
        <>
          <div className="clients-toolbar">
            <select className="clients-filter" value={earningsPeriod} onChange={e => setEarningsPeriod(e.target.value)}>
              <option value="month">This Month</option>
              <option value="quarter">This Quarter</option>
              <option value="year">Year to Date</option>
            </select>
          </div>
          <div className="hub-stats" style={{ marginBottom: 24 }}>
            <div className="hub-stat-card"><div className="hub-stat-value">{fmtMoney(earningsTotal)}</div><div className="hub-stat-label">Total Paid ({earningsPeriod === 'month' ? 'Month' : earningsPeriod === 'quarter' ? 'Quarter' : 'YTD'})</div></div>
            <div className="hub-stat-card"><div className="hub-stat-value">{earningsList.length}</div><div className="hub-stat-label">Staff Paid</div></div>
            <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: needs1099.length > 0 ? COLORS.amber : undefined }}>{needs1099.length}</div><div className="hub-stat-label">Need 1099 (YTD)</div></div>
          </div>
          {earningsList.length === 0 ? (
            <div className="clients-empty">No staff payouts recorded for this period.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Staff</th><th>Jobs</th><th>Hours</th><th>Total Paid</th><th>YTD Total</th><th>1099?</th></tr></thead>
                <tbody>
                  {earningsList.map((e, i) => {
                    const ytd = ytdEarnings[e.staff_id || ('name:' + e.name)]
                    const ytdTotal = ytd ? ytd.total : 0
                    return (
                      <tr key={e.staff_id || ('name:' + e.name)}>
                        <td className="clients-name">{e.name}</td>
                        <td>{e.jobs}</td>
                        <td>{e.hours}</td>
                        <td style={{ fontWeight: 600 }}>{fmtMoney(e.total)}</td>
                        <td>{fmtMoney(ytdTotal)}</td>
                        <td>{ytdTotal >= 600 ? <span style={badgeStyle(COLORS.amber)}>YES</span> : <span style={badgeStyle(COLORS.steel)}>NO</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ─── INVOICES TAB ─── */}
      {mainTab === 'invoices' && (
      <>
      <div className="hub-stats" style={{ marginBottom: 24 }}>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.outstanding}</div><div className="hub-stat-label">Outstanding</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.paidMonth}</div><div className="hub-stat-label">Paid This Month</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.overdue}</div><div className="hub-stat-label">Overdue</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{stats.thisMonth}</div><div className="hub-stat-label">Invoices This Month</div></div>
      </div>

      {loadError && <div className="clients-error" role="alert"><p>{loadError}</p><button onClick={load}>Retry</button></div>}

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
              <thead><tr><th>Invoice #</th><th>Client</th><th>Service</th><th>Total</th><th>Status</th><th>Due Date</th><th>Created</th></tr></thead>
              <tbody>
                {filtered.map(inv => {
                  const hasInternal = inv.internal_line_items && inv.internal_line_items.length > 0
                  return (
                    <tr key={inv.id} onClick={() => setSelected(inv)}>
                      <td className="clients-name">{inv.invoice_number || '—'}{hasInternal && <span title="Has staff assignments" style={{ color: COLORS.blue, marginLeft: 6, fontSize: 11 }}>●</span>}</td>
                      <td>{clientMap[inv.client_id] || '—'}</td>
                      <td><ServiceBadge line={inv.service_line} /></td>
                      <td style={{ fontWeight: 600 }}>{fmtMoney(inv.total)}</td>
                      <td><StatusBadge status={effectiveStatus(inv)} /></td>
                      <td>{fmtDate(inv.due_date)}</td>
                      <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    </tr>
                  )
                })}
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
      </>
      )}

      {showAdd && <AddInvoiceModal onClose={() => setShowAdd(false)} onSaved={handleSaved} clients={clients} onGoToClients={() => { setShowAdd(false); navigate('/clients') }} staffRoster={staffRoster} payRateDefaults={payRateDefaults} licenses={licenses} onStaffRefresh={loadStaff} />}
      {selected && <InvoiceDetail invoice={selected} clients={clients} onClose={() => setSelected(null)} onUpdated={handleUpdated} onDeleted={handleDeleted} showToast={showToast} staffRoster={staffRoster} payRateDefaults={payRateDefaults} licenses={licenses} onStaffRefresh={loadStaff} />}
      {showPayRates && <PayRateDefaultsModal onClose={() => setShowPayRates(false)} payRateDefaults={payRateDefaults} onRefresh={loadPayRates} showToast={showToast} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
