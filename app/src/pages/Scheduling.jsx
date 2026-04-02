import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { fmtDate, daysUntil, badgeStyle, COLORS } from '../lib/format'

const SERVICE_LINES = ['events', 'staffing', 'both']
const EVENT_STATUSES = ['scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled']
const EVENT_TYPES = ['bar shift', 'wedding', 'private event', 'festival', 'concert', 'greek life', 'corporate', 'warehouse', 'field ops', 'other']
const DAYS_OF_WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const STATUS_COLORS = { scheduled: '#3D5A80', confirmed: '#C9922E', in_progress: '#C9922E', completed: '#357A38', cancelled: '#929BAA', active: '#357A38', paused: '#C9922E', ended: '#929BAA' }

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || '#929BAA'
  return <span style={badgeStyle(c)}>{(status || '').replace('_', ' ')}</span>
}

function ServiceBadge({ line }) {
  const colors = { events: '#C9922E', staffing: '#3D5A80', both: '#7A8490' }
  return <span style={badgeStyle(colors[line] || '#7A8490')}>{line || '—'}</span>
}

/* ═══════════════════════════════════════════════════════════
   ADD/EDIT EVENT MODAL
   ═══════════════════════════════════════════════════════════ */
function EventModal({ event, clients, staff, licenses, onClose, onSaved, defaultDate }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!event?.id
  const [form, setForm] = useState({
    client_id: '', title: '', venue_name: '', event_type: 'other', service_line: 'events',
    date: defaultDate || '', start_time: '', end_time: '', staff_needed: 0,
    staff_assigned: [], status: 'scheduled', notes: '', ...event
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [updateSeries, setUpdateSeries] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date) { setError('Date is required'); return }
    setSaving(true); setError('')
    const payload = {
      ...form, staff_needed: parseInt(form.staff_needed) || 0,
      staff_assigned: (form.staff_assigned || []).filter(s => s.name),
      notes: form.notes || null, client_id: form.client_id || null,
    }
    if (isEdit) {
      const { id, created_at, ...rest } = payload
      const { error: err } = await supabase.from('events').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', event.id)
      setSaving(false); if (err) { setError(err.message); return }
      // Update all future events in the same series
      if (updateSeries && event.placement_id) {
        const { start_time, end_time, staff_needed, staff_assigned, venue_name, service_line } = rest
        await supabase.from('events').update({
          start_time, end_time, staff_needed, staff_assigned, venue_name, service_line,
          updated_at: new Date().toISOString(),
        }).eq('placement_id', event.placement_id).gt('date', event.date).neq('status', 'completed').neq('status', 'cancelled')
      }
    } else {
      const { error: err } = await supabase.from('events').insert([payload])
      setSaving(false); if (err) { setError(err.message); return }
    }
    onSaved(); onClose()
  }

  // Simple staff assignment (name + role rows, no pay tracking — that's for invoices)
  const addStaff = () => setForm({ ...form, staff_assigned: [...(form.staff_assigned || []), { name: '', staff_id: null, role: '' }] })
  const removeStaff = (i) => setForm({ ...form, staff_assigned: (form.staff_assigned || []).filter((_, idx) => idx !== i) })
  const updateStaff = (i, field, val) => {
    const next = (form.staff_assigned || []).map((s, idx) => {
      if (idx !== i) return s
      const updated = { ...s, [field]: val }
      if (field === 'name') {
        const match = staff.find(st => st.name.toLowerCase() === val.toLowerCase())
        if (match) { updated.staff_id = match.id; updated.role = updated.role || match.role || '' }
        else updated.staff_id = null
      }
      return updated
    })
    setForm({ ...form, staff_assigned: next })
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxHeight: '90vh', overflow: 'auto' }}>
        <h2 className="modal-title">{isEdit ? 'Edit Event' : 'New Event'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field"><span>Date *</span><input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></label>
            <label className="modal-field"><span>Start Time</span><input type="time" value={form.start_time || ''} onChange={e => setForm({ ...form, start_time: e.target.value })} /></label>
            <label className="modal-field"><span>End Time</span><input type="time" value={form.end_time || ''} onChange={e => setForm({ ...form, end_time: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Title</span><input placeholder="Friday night security" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
            <label className="modal-field"><span>Venue</span><input placeholder="The Rusty Nail" value={form.venue_name || ''} onChange={e => setForm({ ...form, venue_name: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Client</span>
              <select value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">None</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
              </select>
            </label>
            <label className="modal-field"><span>Service</span>
              <select value={form.service_line} onChange={e => setForm({ ...form, service_line: e.target.value })}>{SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
            <label className="modal-field"><span>Type</span>
              <select value={form.event_type || 'other'} onChange={e => setForm({ ...form, event_type: e.target.value })}>{EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
            </label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Staff Needed</span><input type="number" min="0" value={form.staff_needed} onChange={e => setForm({ ...form, staff_needed: e.target.value })} /></label>
            <label className="modal-field"><span>Status</span>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{EVENT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
            </label>
          </div>

          {/* Staff Assignment */}
          <label className="modal-field" style={{ marginTop: 8, marginBottom: 4 }}><span>Staff Assigned</span></label>
          {(form.staff_assigned || []).map((s, i) => {
            const hasExpired = s.staff_id && licenses ? licenses.some(l => l.staff_id === s.staff_id && daysUntil(l.expiration_date) !== null && daysUntil(l.expiration_date) < 0) : false
            return (
              <div key={i} className="line-items-row">
                <input style={{ flex: 2 }} placeholder="Name" value={s.name} onChange={e => updateStaff(i, 'name', e.target.value)}
                  {...(hasExpired ? { style: { flex: 2, borderColor: COLORS.red } } : { style: { flex: 2 } })} />
                <input style={{ flex: 1.5 }} placeholder="Role" value={s.role || ''} onChange={e => updateStaff(i, 'role', e.target.value)} />
                <button type="button" className="line-items-remove" onClick={() => removeStaff(i)}>×</button>
              </div>
            )
          })}
          <button type="button" className="line-items-add" onClick={addStaff}>+ Assign Staff</button>

          <label className="modal-field" style={{ marginTop: 12 }}><span>Notes</span><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {isEdit && event?.placement_id && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--steel)', margin: '8px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={updateSeries} onChange={e => setUpdateSeries(e.target.checked)} />
              Apply changes to all future events in this series
            </label>
          )}
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Create Event'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   ADD/EDIT PLACEMENT MODAL
   ═══════════════════════════════════════════════════════════ */
function PlacementModal({ placement, clients, onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const isEdit = !!placement?.id
  const [form, setForm] = useState({
    client_id: '', title: '', service_line: 'staffing', venue_name: '',
    schedule_pattern: '', start_date: '', end_date: '',
    default_start_time: '', default_end_time: '', staff_needed: 0,
    default_staff: [], status: 'active', notes: '', ...placement
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedDays = (form.schedule_pattern || '').split(',').filter(Boolean)
  const toggleDay = (day) => {
    const next = selectedDays.includes(day) ? selectedDays.filter(d => d !== day) : [...selectedDays, day]
    setForm({ ...form, schedule_pattern: next.join(',') })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.client_id) { setError('Select a client'); return }
    if (!form.schedule_pattern) { setError('Select at least one day'); return }
    setSaving(true); setError('')
    const payload = { ...form, staff_needed: parseInt(form.staff_needed) || 0, notes: form.notes || null, client_id: form.client_id || null }
    if (isEdit) {
      const { id, created_at, ...rest } = payload
      const { error: err } = await supabase.from('placements').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', placement.id)
      setSaving(false); if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('placements').insert([payload])
      setSaving(false); if (err) { setError(err.message); return }
    }
    onSaved(); onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card modal-card--wide" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">{isEdit ? 'Edit Placement' : 'New Placement'}</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-row">
            <label className="modal-field"><span>Client *</span>
              <select required value={form.client_id || ''} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name || c.contact_name}</option>)}
              </select>
            </label>
            <label className="modal-field"><span>Title</span><input placeholder="Mon-Fri warehouse crew" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Venue / Location</span><input value={form.venue_name || ''} onChange={e => setForm({ ...form, venue_name: e.target.value })} /></label>
            <label className="modal-field"><span>Service</span>
              <select value={form.service_line} onChange={e => setForm({ ...form, service_line: e.target.value })}>{SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          <label className="modal-field" style={{ marginBottom: 8 }}><span>Schedule Pattern *</span></label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {DAYS_OF_WEEK.map(d => (
              <button key={d} type="button" onClick={() => toggleDay(d)}
                style={{ padding: '6px 14px', borderRadius: 4, border: '1px solid', fontSize: 13, fontFamily: 'var(--fh)', fontWeight: 700, cursor: 'pointer',
                  background: selectedDays.includes(d) ? COLORS.blue : 'transparent',
                  borderColor: selectedDays.includes(d) ? COLORS.blue : 'rgba(255,255,255,0.15)',
                  color: selectedDays.includes(d) ? '#fff' : 'var(--steel)' }}>
                {DAY_LABELS[d]}
              </button>
            ))}
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Start Date</span><input type="date" value={form.start_date || ''} onChange={e => setForm({ ...form, start_date: e.target.value })} /></label>
            <label className="modal-field"><span>End Date</span><input type="date" value={form.end_date || ''} onChange={e => setForm({ ...form, end_date: e.target.value })} /></label>
          </div>
          <div className="modal-row">
            <label className="modal-field"><span>Default Start Time</span><input type="time" value={form.default_start_time || ''} onChange={e => setForm({ ...form, default_start_time: e.target.value })} /></label>
            <label className="modal-field"><span>Default End Time</span><input type="time" value={form.default_end_time || ''} onChange={e => setForm({ ...form, default_end_time: e.target.value })} /></label>
            <label className="modal-field"><span>Staff Needed</span><input type="number" min="0" value={form.staff_needed} onChange={e => setForm({ ...form, staff_needed: e.target.value })} /></label>
          </div>
          <label className="modal-field"><span>Notes</span><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : isEdit ? 'Save' : 'Create Placement'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   CALENDAR HELPERS
   ═══════════════════════════════════════════════════════════ */
function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startPad = (firstDay.getDay() + 6) % 7 // Monday start
  const days = []
  // Pad from previous month
  for (let i = startPad - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, current: false })
  }
  // Current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push({ date: new Date(year, month, i), current: true })
  }
  // Pad to fill 6 rows
  while (days.length < 42) {
    const d = new Date(year, month + 1, days.length - startPad - lastDay.getDate() + 1)
    days.push({ date: d, current: false })
  }
  return days
}

function dateStr(d) { return d.toISOString().split('T')[0] }

/* ═══════════════════════════════════════════════════════════
   MAIN SCHEDULING PAGE
   ═══════════════════════════════════════════════════════════ */
export default function Scheduling() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tab, setTab] = useState('calendar')
  const [events, setEvents] = useState([])
  const [placements, setPlacements] = useState([])
  const [clients, setClients] = useState([])
  const [staff, setStaff] = useState([])
  const [licenses, setLicenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [calView, setCalView] = useState('month') // 'month' or 'week'
  const [calYear, setCalYear] = useState(new Date().getFullYear())
  const [calMonth, setCalMonth] = useState(new Date().getMonth())
  const [weekOffset, setWeekOffset] = useState(0) // 0 = this week, +1 = next week, etc.
  const [showEventModal, setShowEventModal] = useState(null) // null=closed, {}=add, {event}=edit
  const [showPlacementModal, setShowPlacementModal] = useState(null)
  const [defaultDate, setDefaultDate] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteType, setConfirmDeleteType] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLine, setFilterLine] = useState('')
  const [eventSearch, setEventSearch] = useState('')
  const [dayDetail, setDayDetail] = useState(null) // { date, events[] }
  const [toast, setToast] = useState('')
  const fireToast = useToast()
  const showToast = (msg) => fireToast(setToast, msg)

  // Open EventModal when arriving from Clients "New Event"
  useEffect(() => {
    if (location.state?.fromClient) {
      setShowEventModal({ client_id: location.state.fromClient.client_id })
      setTab('events')
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase.from('events').select('*').order('date', { ascending: true })
    if (error && import.meta.env.DEV) console.error('Load events:', error.message)
    setEvents(data || [])
  }, [])

  const loadPlacements = useCallback(async () => {
    const { data, error } = await supabase.from('placements').select('*').order('created_at', { ascending: false })
    if (error && import.meta.env.DEV) console.error('Load placements:', error.message)
    setPlacements(data || [])
  }, [])

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id, contact_name, business_name').order('business_name')
    setClients(data || [])
  }, [])

  const loadStaff = useCallback(async () => {
    const { data } = await supabase.from('staff').select('*').order('name')
    setStaff(data || [])
  }, [])

  const loadLicenses = useCallback(async () => {
    const { data } = await supabase.from('licenses').select('staff_id, expiration_date')
    setLicenses(data || [])
  }, [])

  useEffect(() => {
    Promise.all([loadEvents(), loadPlacements(), loadClients(), loadStaff(), loadLicenses()]).then(() => setLoading(false))
  }, [loadEvents, loadPlacements, loadClients, loadStaff, loadLicenses])

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c.business_name || c.contact_name]))
  const calDays = useMemo(() => getMonthDays(calYear, calMonth), [calYear, calMonth])
  const monthLabel = new Date(calYear, calMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Group events by date for calendar
  const eventsByDate = useMemo(() => {
    const map = {}
    events.forEach(ev => {
      if (!ev.date) return
      const d = ev.date.split('T')[0] // handle both date and timestamptz
      if (!map[d]) map[d] = []
      map[d].push(ev)
    })
    return map
  }, [events])

  // Stats
  const now = new Date()
  const { thisWeekEvents, staffThisWeek, unassigned } = useMemo(() => {
    const ws = new Date(now); ws.setDate(now.getDate() - ((now.getDay() + 6) % 7)); ws.setHours(0, 0, 0, 0)
    const we = new Date(ws); we.setDate(ws.getDate() + 7)
    const tw = events.filter(ev => { const d = new Date(ev.date); return d >= ws && d < we })
    return {
      thisWeekEvents: tw,
      staffThisWeek: tw.reduce((s, ev) => s + (ev.staff_assigned?.length || 0), 0),
      unassigned: events.filter(ev => ev.status !== 'completed' && ev.status !== 'cancelled' && (ev.staff_needed > 0) && (!ev.staff_assigned || ev.staff_assigned.length < ev.staff_needed)).length,
    }
  }, [events])

  const handleDeleteEvent = async (id) => {
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) { if (import.meta.env.DEV) console.error('Delete event:', error.message); showToast('Failed to delete event'); return }
    setConfirmDeleteId(null); setConfirmDeleteType(null); loadEvents(); showToast('Event deleted')
  }

  const handleDeletePlacement = async (id) => {
    const { error } = await supabase.from('placements').delete().eq('id', id)
    if (error) { if (import.meta.env.DEV) console.error('Delete placement:', error.message); showToast('Failed to delete placement'); return }
    setConfirmDeleteId(null); setConfirmDeleteType(null); loadPlacements(); showToast('Placement deleted')
  }

  const handleGenerateEvents = async (placement) => {
    if (!placement.schedule_pattern || !placement.start_date) { showToast('Set schedule pattern and start date first'); return }
    if (placement.end_date && placement.start_date > placement.end_date) { showToast('End date must be after start date'); return }
    const days = placement.schedule_pattern.split(',').filter(Boolean)
    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
    const start = new Date(placement.start_date + 'T00:00:00')
    const end = placement.end_date ? new Date(placement.end_date + 'T00:00:00') : new Date(start.getTime() + 28 * 86400000) // default 4 weeks
    const newEvents = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const dayName = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][cursor.getDay()]
      if (days.includes(dayName)) {
        newEvents.push({
          client_id: placement.client_id, title: placement.title || null,
          venue_name: placement.venue_name || null, event_type: 'staffing',
          service_line: placement.service_line, date: dateStr(cursor),
          start_time: placement.default_start_time || null, end_time: placement.default_end_time || null,
          staff_needed: placement.staff_needed, staff_assigned: placement.default_staff || [],
          status: 'scheduled', placement_id: placement.id, notes: null,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    if (newEvents.length === 0) { showToast('No events to generate for this range'); return }
    const { error } = await supabase.from('events').insert(newEvents)
    if (error) { if (import.meta.env.DEV) console.error('Generate events:', error.message); showToast('Failed to generate events'); return }
    loadEvents(); showToast(`${newEvents.length} events generated`)
  }

  const handleCreateInvoice = (ev) => {
    // Navigate to financials with event data in URL state
    navigate('/financials', { state: { fromEvent: { client_id: ev.client_id, service_line: ev.service_line, event_date: ev.date, event_start_time: ev.start_time, event_end_time: ev.end_time, venue_name: ev.venue_name, staff: ev.staff_assigned, event_id: ev.id } } })
  }

  const filteredEvents = events.filter(ev => {
    if (filterStatus && ev.status !== filterStatus) return false
    if (filterLine && ev.service_line !== filterLine) return false
    if (eventSearch) {
      const q = eventSearch.toLowerCase()
      return (ev.title || '').toLowerCase().includes(q) || (ev.venue_name || '').toLowerCase().includes(q) || (clientMap[ev.client_id] || '').toLowerCase().includes(q)
    }
    return true
  })

  if (loading) return <div className="clients-loading">Loading scheduling data...</div>

  return (
    <div className="clients">
      <div className="clients-header">
        <div>
          <h1>Scheduling</h1>
          <p className="clients-subtitle">Events calendar, staff assignments, recurring placements</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab === 'calendar' && <button className="clients-add-btn" onClick={() => { setDefaultDate(''); setShowEventModal({}) }}>+ New Event</button>}
          {tab === 'events' && <button className="clients-add-btn" onClick={() => { setDefaultDate(''); setShowEventModal({}) }}>+ New Event</button>}
          {tab === 'placements' && <button className="clients-add-btn" onClick={() => setShowPlacementModal({})}>+ New Placement</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="hub-stats" style={{ marginBottom: 24 }}>
        <div className="hub-stat-card"><div className="hub-stat-value">{thisWeekEvents.length}</div><div className="hub-stat-label">This Week</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{staffThisWeek}</div><div className="hub-stat-label">Staff Assigned</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value" style={{ color: unassigned > 0 ? COLORS.amber : undefined }}>{unassigned}</div><div className="hub-stat-label">Need Staff</div></div>
        <div className="hub-stat-card"><div className="hub-stat-value">{placements.filter(p => p.status === 'active').length}</div><div className="hub-stat-label">Active Placements</div></div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs" role="tablist" style={{ padding: 0, marginBottom: 16 }}>
        <button role="tab" aria-selected={tab === 'calendar'} className={`detail-tab ${tab === 'calendar' ? 'detail-tab--active' : ''}`} onClick={() => setTab('calendar')}>Calendar</button>
        <button role="tab" aria-selected={tab === 'events'} className={`detail-tab ${tab === 'events' ? 'detail-tab--active' : ''}`} onClick={() => setTab('events')}>Events ({events.length})</button>
        <button role="tab" aria-selected={tab === 'placements'} className={`detail-tab ${tab === 'placements' ? 'detail-tab--active' : ''}`} onClick={() => setTab('placements')}>Placements ({placements.length})</button>
      </div>

      {/* ─── CALENDAR TAB ─── */}
      {tab === 'calendar' && (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <button className={`modal-btn-cancel`} style={{ fontSize: 12, padding: '4px 14px', ...(calView === 'month' ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : {}) }} onClick={() => setCalView('month')}>Month</button>
            <button className={`modal-btn-cancel`} style={{ fontSize: 12, padding: '4px 14px', ...(calView === 'week' ? { background: 'rgba(255,255,255,0.1)', color: '#fff' } : {}) }} onClick={() => { setCalView('week'); setWeekOffset(0) }}>Week</button>
          </div>

          {calView === 'month' && (
            <>
              <div className="cal-nav">
                <button className="cal-nav-btn" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1) } else setCalMonth(m => m - 1) }}>←</button>
                <span className="cal-nav-title">{monthLabel}</span>
                <button className="cal-nav-btn" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1) } else setCalMonth(m => m + 1) }}>→</button>
              </div>
              <div className="cal-grid">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <div key={d} className="cal-header">{d}</div>)}
                {calDays.map((day, i) => {
                  const ds = dateStr(day.date)
                  const dayEvents = eventsByDate[ds] || []
                  const isToday = ds === dateStr(new Date())
                  return (
                    <div key={i} className={`cal-cell ${day.current ? '' : 'cal-cell--other'} ${isToday ? 'cal-cell--today' : ''}`}
                      onClick={() => { setDefaultDate(ds); setShowEventModal({}) }}>
                      <span className="cal-cell-date">{day.date.getDate()}</span>
                      {dayEvents.slice(0, 3).map(ev => (
                        <div key={ev.id} className="cal-event" style={{ borderLeftColor: ev.service_line === 'events' ? COLORS.amber : COLORS.blue }}
                          onClick={(e) => { e.stopPropagation(); setShowEventModal(ev) }}>
                          {ev.title || ev.venue_name || clientMap[ev.client_id] || 'Event'}
                        </div>
                      ))}
                      {dayEvents.length > 3 && <div className="cal-event-more" onClick={(e) => { e.stopPropagation(); setDayDetail({ date: ds, events: dayEvents }) }} style={{ cursor: 'pointer' }}>+{dayEvents.length - 3} more</div>}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {calView === 'week' && (() => {
            const today = new Date(); today.setHours(0, 0, 0, 0)
            const mondayOffset = (today.getDay() + 6) % 7
            const weekStart = new Date(today); weekStart.setDate(today.getDate() - mondayOffset + (weekOffset * 7))
            const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(weekStart.getDate() + i); return d })
            const weekLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            return (
              <>
                <div className="cal-nav">
                  <button className="cal-nav-btn" onClick={() => setWeekOffset(w => w - 1)}>←</button>
                  <span className="cal-nav-title">{weekLabel}</span>
                  <button className="cal-nav-btn" onClick={() => setWeekOffset(w => w + 1)}>→</button>
                  {weekOffset !== 0 && <button className="modal-btn-cancel" style={{ fontSize: 11, padding: '2px 10px', marginLeft: 8 }} onClick={() => setWeekOffset(0)}>Today</button>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden' }}>
                  {weekDays.map((day, i) => {
                    const ds = dateStr(day)
                    const dayEvents = eventsByDate[ds] || []
                    const isToday = ds === dateStr(new Date())
                    return (
                      <div key={i} style={{ background: 'var(--dark)', padding: 10, minHeight: 200, cursor: 'pointer' }}
                        onClick={() => { setDefaultDate(ds); setShowEventModal({}) }}>
                        <div style={{ fontFamily: 'var(--fh)', fontSize: 11, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: isToday ? COLORS.amber : 'var(--steel)', marginBottom: 4 }}>
                          {day.toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: isToday ? '#fff' : 'var(--steel)', marginBottom: 8 }}>
                          {day.getDate()}
                        </div>
                        {dayEvents.map(ev => (
                          <div key={ev.id} style={{ padding: '6px 8px', marginBottom: 4, borderRadius: 4, borderLeft: `3px solid ${ev.service_line === 'events' ? COLORS.amber : COLORS.blue}`, background: 'var(--char)', fontSize: 12, cursor: 'pointer' }}
                            onClick={(e) => { e.stopPropagation(); setShowEventModal(ev) }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>{ev.title || ev.venue_name || clientMap[ev.client_id] || 'Event'}</div>
                            {ev.start_time && <div style={{ fontSize: 11, color: 'var(--steel)' }}>{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}
        </>
      )}

      {/* ─── EVENTS TAB ─── */}
      {tab === 'events' && (
        <>
          <div className="clients-toolbar">
            <input className="clients-search" placeholder="Search events..." value={eventSearch} onChange={e => setEventSearch(e.target.value)} style={{ maxWidth: 200 }} />
            <select className="clients-filter" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All Statuses</option>
              {EVENT_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select className="clients-filter" value={filterLine} onChange={e => setFilterLine(e.target.value)}>
              <option value="">All Services</option>
              {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {filteredEvents.length === 0 ? (
            <div className="clients-empty">No events yet.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Date</th><th>Title / Venue</th><th>Client</th><th>Service</th><th>Staff</th><th>Status</th><th>Invoice</th><th></th></tr></thead>
                <tbody>
                  {filteredEvents.map(ev => (
                    <tr key={ev.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowEventModal(ev)}>{fmtDate(ev.date?.split('T')[0])}</td>
                      <td>{ev.title || ev.venue_name || '—'}</td>
                      <td>{clientMap[ev.client_id] || '—'}</td>
                      <td><ServiceBadge line={ev.service_line} /></td>
                      <td>{(ev.staff_assigned?.length || 0)}/{ev.staff_needed || 0}</td>
                      <td><StatusBadge status={ev.status} /></td>
                      <td>{ev.invoice_id ? <span style={{ color: COLORS.green, fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }}>Linked</span> : <button style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => handleCreateInvoice(ev)}>Create</button>}</td>
                      <td>
                        {confirmDeleteId === ev.id && confirmDeleteType === 'event' ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)' }} onClick={() => handleDeleteEvent(ev.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(ev.id); setConfirmDeleteType('event') }}>Del</button>
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

      {/* ─── PLACEMENTS TAB ─── */}
      {tab === 'placements' && (
        <>
          {placements.length === 0 ? (
            <div className="clients-empty">No placements yet. Create one for recurring staffing schedules.</div>
          ) : (
            <div className="clients-table-wrap">
              <table className="clients-table">
                <thead><tr><th>Client</th><th>Title</th><th>Schedule</th><th>Staff</th><th>Dates</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {placements.map(p => (
                    <tr key={p.id}>
                      <td className="clients-name" style={{ cursor: 'pointer' }} onClick={() => setShowPlacementModal(p)}>{clientMap[p.client_id] || '—'}</td>
                      <td>{p.title || '—'}</td>
                      <td style={{ fontFamily: 'var(--fh)', fontSize: 12, fontWeight: 600, letterSpacing: '0.5px' }}>{(p.schedule_pattern || '').split(',').map(d => DAY_LABELS[d] || d).join(', ')}</td>
                      <td>{p.staff_needed || 0}</td>
                      <td>{fmtDate(p.start_date)} — {fmtDate(p.end_date)}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td style={{ display: 'flex', gap: 4 }}>
                        <button style={{ background: 'none', border: 'none', color: COLORS.blue, cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => handleGenerateEvents(p)}>Generate</button>
                        {confirmDeleteId === p.id && confirmDeleteType === 'placement' ? (
                          <span style={{ display: 'flex', gap: 4 }}>
                            <button className="modal-btn-save" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--red)' }} onClick={() => handleDeletePlacement(p.id)}>Yes</button>
                            <button className="modal-btn-cancel" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => { setConfirmDeleteId(null); setConfirmDeleteType(null) }}>No</button>
                          </span>
                        ) : (
                          <button style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600 }} onClick={() => { setConfirmDeleteId(p.id); setConfirmDeleteType('placement') }}>Del</button>
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
      {showEventModal !== null && <EventModal event={showEventModal.id ? showEventModal : null} clients={clients} staff={staff} licenses={licenses} onClose={() => { setShowEventModal(null); setDefaultDate('') }} onSaved={() => { loadEvents(); showToast(showEventModal.id ? 'Event updated' : 'Event created') }} defaultDate={defaultDate} />}
      {showPlacementModal !== null && <PlacementModal placement={showPlacementModal.id ? showPlacementModal : null} clients={clients} onClose={() => setShowPlacementModal(null)} onSaved={() => { loadPlacements(); showToast(showPlacementModal.id ? 'Placement updated' : 'Placement created') }} />}
      {dayDetail && (
        <div className="modal-overlay" role="presentation" onClick={() => setDayDetail(null)}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 className="modal-title">{fmtDate(dayDetail.date)}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dayDetail.events.map(ev => (
                <div key={ev.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--char)', borderRadius: 6, borderLeft: `3px solid ${ev.service_line === 'events' ? COLORS.amber : COLORS.blue}`, cursor: 'pointer' }}
                  onClick={() => { setDayDetail(null); setShowEventModal(ev) }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{ev.title || ev.venue_name || clientMap[ev.client_id] || 'Event'}</div>
                    {ev.start_time && <div style={{ fontSize: 12, color: 'var(--steel)' }}>{ev.start_time}{ev.end_time ? ` – ${ev.end_time}` : ''}</div>}
                  </div>
                  <StatusBadge status={ev.status} />
                </div>
              ))}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="modal-btn-cancel" onClick={() => setDayDetail(null)}>Close</button>
              <button className="modal-btn-save" onClick={() => { setDayDetail(null); setDefaultDate(dayDetail.date); setShowEventModal({}) }}>+ New Event</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
