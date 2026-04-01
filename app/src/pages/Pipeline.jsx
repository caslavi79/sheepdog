import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { COLORS } from '../lib/format'

const STAGES = [
  { id: 'lead', label: 'Lead' },
  { id: 'outreach_sent', label: 'Outreach Sent' },
  { id: 'responded', label: 'Responded' },
  { id: 'meeting_scheduled', label: 'Meeting Scheduled' },
  { id: 'proposal_sent', label: 'Proposal Sent' },
  { id: 'under_contract', label: 'Under Contract' },
  { id: 'lost', label: 'Lost' },
]

const SERVICE_LINES = ['events', 'staffing', 'both']

const STAGE_COLORS = {
  lead: '#7A8490',
  outreach_sent: '#3D5A80',
  responded: '#C9922E',
  meeting_scheduled: '#C9922E',
  proposal_sent: '#C23B22',
  under_contract: '#357A38',
  lost: '#3d2020',
}

const SERVICE_COLORS = { events: '#C23B22', staffing: '#3D5A80', both: '#C9922E' }

function ServiceDot({ line }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 7,
      height: 7,
      borderRadius: '50%',
      background: SERVICE_COLORS[line] || '#7A8490',
      marginRight: 5,
      flexShrink: 0,
    }} />
  )
}

function AddDealModal({ onClose, onSaved }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [form, setForm] = useState({
    contact_name: '', business_name: '', phone: '', email: '',
    service_line: 'events', stage: 'lead', value: '', notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      value: form.value ? parseFloat(form.value) : null,
    }
    const { error: err } = await supabase.from('pipeline').insert([payload])
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
        <h2 className="modal-title">Add Deal</h2>
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
          <div className="modal-row">
            <label className="modal-field">
              <span>Service Line</span>
              <select value={form.service_line} onChange={e => setForm({...form, service_line: e.target.value})}>
                {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>Stage</span>
              <select value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
            <label className="modal-field">
              <span>Est. Value ($)</span>
              <input type="number" min="0" step="0.01" value={form.value ?? ''} onChange={e => setForm({...form, value: e.target.value})} placeholder="500" />
            </label>
          </div>
          <label className="modal-field">
            <span>Notes</span>
            <textarea rows={1} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="How you found them, what they need..." />
          </label>
          {error && <p role="alert" style={{ color: '#C23B22', fontSize: 13 }}>{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="modal-btn-save" disabled={saving}>{saving ? 'Saving...' : 'Add Deal'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DealDetailModal({ deal, onClose, onUpdated, onDeleted, navigate }) {
  useEscapeKey(onClose)
  useBodyLock()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(deal)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    const { id, created_at, ...rest } = form
    const payload = {
      ...rest,
      value: form.value !== '' && form.value !== null ? parseFloat(form.value) : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('pipeline').update(payload).eq('id', deal.id)
    setSaving(false)
    if (error) { setSaveError(error.message); return }
    setEditing(false); onUpdated()
  }

  const handleDelete = async () => {
    const { error } = await supabase.from('pipeline').delete().eq('id', deal.id)
    if (error) { if (import.meta.env.DEV) console.error('Delete error:', error.message); setConfirmDelete(false); return }
    onDeleted()
    onClose()
  }

  const stageColor = STAGE_COLORS[deal.stage] || '#7A8490'

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="detail-panel" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{deal.contact_name}</h2>
            {deal.business_name && <p className="detail-business">{deal.business_name}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
              textTransform: 'uppercase', color: stageColor, background: `${stageColor}22`,
              padding: '3px 10px', borderRadius: 3
            }}>{STAGES.find(s => s.id === deal.stage)?.label || deal.stage}</span>
          </div>
        </div>

        {!editing ? (
          <div className="detail-body">
            <div className="detail-section">
              <h3 className="detail-section-title">Details</h3>
              <div className="detail-grid">
                <div className="detail-item"><span className="detail-label">Phone</span><span>{deal.phone || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Email</span><span>{deal.email || '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Service</span><span style={{ display: 'flex', alignItems: 'center' }}><ServiceDot line={deal.service_line} />{deal.service_line}</span></div>
                <div className="detail-item"><span className="detail-label">Est. Value</span><span>{deal.value != null ? `$${Number(deal.value).toLocaleString()}` : '—'}</span></div>
                <div className="detail-item"><span className="detail-label">Source</span><span>{deal.source === 'contact_form' ? 'Contact Form' : deal.source || 'Manual'}</span></div>
              </div>
              {deal.notes && <div className="detail-notes"><span className="detail-label">Notes</span><p>{deal.notes}</p></div>}
            </div>
            <div className="detail-section">
              <h3 className="detail-section-title">Quick Actions</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {!deal.client_id ? (
                  <button className="modal-btn-save" style={{ fontSize: 13, background: COLORS.blue }}
                    onClick={() => { onClose(); navigate('/clients', { state: { fromDeal: { deal_id: deal.id, contact_name: deal.contact_name, business_name: deal.business_name, phone: deal.phone, email: deal.email, service_line: deal.service_line } } }) }}>
                    Convert to Client
                  </button>
                ) : (
                  <button className="modal-btn-cancel" style={{ fontSize: 13, color: COLORS.green, borderColor: `${COLORS.green}44` }}
                    onClick={() => { onClose(); navigate('/clients') }}>
                    View Client
                  </button>
                )}
                {deal.client_id && (deal.stage === 'proposal_sent' || deal.stage === 'meeting_scheduled') && (
                  <button className="modal-btn-save" style={{ fontSize: 13, background: COLORS.amber }}
                    onClick={() => { onClose(); navigate(`/contracts?client_id=${deal.client_id}`) }}>
                    Send Contract
                  </button>
                )}
              </div>
            </div>
            <div className="detail-actions" style={{ justifyContent: 'space-between' }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#C23B22' }}>Delete this deal?</span>
                  <button className="modal-btn-cancel" onClick={() => setConfirmDelete(false)}>No</button>
                  <button className="modal-btn-save" style={{ background: '#C23B22' }} onClick={handleDelete}>Yes, Delete</button>
                </div>
              ) : (
                <button className="modal-btn-cancel" style={{ color: '#C23B22', borderColor: '#C23B2244' }} onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
              <button className="modal-btn-save" onClick={() => setEditing(true)}>Edit Deal</button>
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
              <div className="modal-row">
                <label className="modal-field"><span>Service Line</span>
                  <select value={form.service_line} onChange={e => setForm({...form, service_line: e.target.value})}>
                    {SERVICE_LINES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="modal-field"><span>Stage</span>
                  <select value={form.stage} onChange={e => setForm({...form, stage: e.target.value})}>
                    {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <label className="modal-field"><span>Est. Value ($)</span>
                  <input type="number" min="0" step="0.01" value={form.value ?? ''} onChange={e => setForm({...form, value: e.target.value})} />
                </label>
              </div>
              <label className="modal-field"><span>Notes</span>
                <textarea rows={1} onInput={e => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} value={form.notes || ''} onChange={e => setForm({...form, notes: e.target.value})} />
              </label>
              <div className="modal-actions">
                {saveError && <p role="alert" style={{ color: '#C23B22', fontSize: 13 }}>{saveError}</p>}
                <button type="button" className="modal-btn-cancel" onClick={() => { setForm(deal); setEditing(false); setSaveError('') }}>Cancel</button>
                <button className="modal-btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DealCard({ deal, onDragStart, onDragEnd, onClick, onStageChange }) {
  const stageColor = STAGE_COLORS[deal.stage] || '#7A8490'
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  return (
    <div
      className="pipeline-card"
      draggable={!isMobile}
      onDragStart={e => !isMobile && onDragStart(e, deal)}
      onDragEnd={!isMobile ? onDragEnd : undefined}
      onClick={() => onClick(deal)}
    >
      <div className="pipeline-card-top">
        <span className="pipeline-card-name">{deal.contact_name}</span>
        {deal.value != null && (
          <span className="pipeline-card-value">${Number(deal.value).toLocaleString()}</span>
        )}
      </div>
      {deal.business_name && (
        <p className="pipeline-card-biz">{deal.business_name}</p>
      )}
      <div className="pipeline-card-meta">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ServiceDot line={deal.service_line} />
          {deal.service_line}
          {deal.client_id && <span style={{ fontSize: 9, fontWeight: 700, color: COLORS.green, background: `${COLORS.green}22`, padding: '1px 5px', borderRadius: 2, letterSpacing: '0.5px', fontFamily: 'var(--fh)' }}>CLIENT</span>}
        </span>
        {isMobile && (
          <select
            value={deal.stage}
            onClick={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); onStageChange(deal, e.target.value) }}
            style={{
              marginLeft: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--white)', fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 600,
              letterSpacing: '1px', textTransform: 'uppercase', padding: '4px 8px', borderRadius: 3, cursor: 'pointer'
            }}
          >
            {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>
    </div>
  )
}

function PipelineColumn({ stage, deals, onDragOver, onDrop, onDragStart, onDragEnd, onCardClick, onStageChange, isDragOver }) {
  const stageColor = STAGE_COLORS[stage.id] || '#7A8490'
  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div
      className={`pipeline-column${isDragOver ? ' pipeline-column--over' : ''}${deals.length === 0 ? ' pipeline-column--empty' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(stage.id) }}
      onDrop={e => onDrop(e, stage.id)}
      onDragLeave={() => onDragOver(null)}
    >
      <div className="pipeline-col-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="pipeline-col-dot" style={{ background: stageColor }} />
          <span className="pipeline-col-label">{stage.label}</span>
          <span className="pipeline-col-count">{deals.length}</span>
        </div>
        {totalValue > 0 && (
          <span className="pipeline-col-value">${totalValue.toLocaleString()}</span>
        )}
      </div>
      <div className="pipeline-col-body">
        {deals.map(deal => (
          <DealCard
            key={deal.id}
            deal={deal}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
            onStageChange={onStageChange}
          />
        ))}
      </div>
    </div>
  )
}

export default function Pipeline() {
  const navigate = useNavigate()
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [dragError, setDragError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState('')
  const dragDeal = useRef(null)
  const fireToast = useToast()

  const showToast = (msg) => fireToast(setToast, msg)

  const loadDeals = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('pipeline').select('*').order('created_at', { ascending: false }).limit(100)
    if (error) { setLoadError('Failed to load deals. Please refresh.'); if (import.meta.env.DEV) console.error('Load deals error:', error.message) }
    else { setLoadError('') }
    setDeals(data || [])
    setLoading(false)
  }

  useEffect(() => { loadDeals() }, [])

  const handleDragStart = (e, deal) => {
    dragDeal.current = deal
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragEnd = () => {
    dragDeal.current = null
    setDragOverStage(null)
  }

  const handleDrop = async (e, newStage) => {
    e.preventDefault()
    const deal = dragDeal.current
    if (!deal || deal.stage === newStage) { setDragOverStage(null); return }

    const previousStage = deal.stage
    setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: newStage } : d))
    setDragOverStage(null)
    setDragError('')

    const { error } = await supabase.from('pipeline').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', deal.id)
    if (error) {
      // Rollback optimistic update
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: previousStage } : d))
      setDragError('Failed to move card — changes reverted.')
      setTimeout(() => setDragError(''), 4000)
    }
  }

  const dealsByStage = (stageId) => deals.filter(d => d.stage === stageId)

  const totalPipelineValue = deals
    .filter(d => d.stage !== 'lost')
    .reduce((sum, d) => sum + (d.value || 0), 0)

  const wonValue = deals
    .filter(d => d.stage === 'under_contract')
    .reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div className="pipeline-page">
      <div className="pipeline-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1>Pipeline</h1>
          <button className="clients-add-btn" onClick={() => setShowAdd(true)}>+ Add Deal</button>
        </div>
        <p>{deals.filter(d => d.stage !== 'lost').length} active deals
          {totalPipelineValue > 0 && ` · $${totalPipelineValue.toLocaleString()} in play`}
          {wonValue > 0 && ` · $${wonValue.toLocaleString()} under contract`}
        </p>
      </div>

      {dragError && (
        <div style={{ background: '#3d2020', border: '1px solid #C23B2244', color: '#C23B22', padding: '10px 16px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
          {dragError}
        </div>
      )}

      {loadError && (
        <div style={{ background: '#3d2020', border: '1px solid #C23B2244', color: '#C23B22', padding: '10px 16px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
          {loadError} <button onClick={loadDeals} style={{ marginLeft: 8, background: 'none', border: '1px solid #C23B22', color: '#C23B22', padding: '4px 12px', borderRadius: 3, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="clients-loading">Loading...</div>
      ) : (
        <div className="pipeline-board">
          {STAGES.map(stage => (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              deals={dealsByStage(stage.id)}
              onDragOver={setDragOverStage}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onCardClick={setSelected}
              onStageChange={async (deal, newStage) => {
                if (deal.stage === newStage) return
                const prev = deal.stage
                setDeals(d => d.map(x => x.id === deal.id ? { ...x, stage: newStage } : x))
                const { error } = await supabase.from('pipeline').update({ stage: newStage, updated_at: new Date().toISOString() }).eq('id', deal.id)
                if (error) {
                  setDeals(d => d.map(x => x.id === deal.id ? { ...x, stage: prev } : x))
                  setDragError('Failed to move card — changes reverted.')
                  setTimeout(() => setDragError(''), 4000)
                }
              }}
              isDragOver={dragOverStage === stage.id}
            />
          ))}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
      {showAdd && <AddDealModal onClose={() => setShowAdd(false)} onSaved={() => { loadDeals(); showToast('Deal added') }} />}
      {selected && (
        <DealDetailModal
          deal={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { loadDeals(); setSelected(null); showToast('Deal updated') }}
          onDeleted={() => { loadDeals(); showToast('Deal deleted') }}
          navigate={navigate}
        />
      )}
    </div>
  )
}
