import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock, useToast } from '../lib/hooks'
import { COLORS } from '../lib/format'
import { askAssistant } from '../lib/assistant'

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
  lead: '#6B7280',
  outreach_sent: '#3D5A80',
  responded: '#C9922E',
  meeting_scheduled: '#C9922E',
  proposal_sent: '#C23B22',
  under_contract: '#357A38',
  lost: '#6B3A3A',
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
  const [duplicates, setDuplicates] = useState([])
  const dupTimerRef = useRef(null)

  const checkDuplicates = (updatedForm) => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current)
    dupTimerRef.current = setTimeout(async () => {
      const { contact_name, business_name, email, phone } = updatedForm
      if (!contact_name && !business_name && !email && !phone) { setDuplicates([]); return }
      try {
        const result = await askAssistant({ action: 'duplicate_check', data: { contact_name, business_name, email, phone } })
        setDuplicates(result.matches || [])
      } catch { /* silent */ }
    }, 500)
  }

  const updateForm = (updates) => {
    const next = { ...form, ...updates }
    setForm(next)
    checkDuplicates(next)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.contact_name.trim()) { setError('Contact name is required'); return }
    setSaving(true)
    setError('')
    const payload = {
      ...form,
      contact_name: form.contact_name.trim(),
      business_name: form.business_name || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
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
              <input required value={form.contact_name} onChange={e => updateForm({ contact_name: e.target.value })} placeholder="John Smith" />
            </label>
            <label className="modal-field">
              <span>Business Name</span>
              <input value={form.business_name} onChange={e => updateForm({ business_name: e.target.value })} placeholder="The Rusty Nail" />
            </label>
          </div>
          {duplicates.length > 0 && (
            <div className="ai-result-card" style={{ borderColor: 'rgba(201, 146, 46, 0.3)', background: 'rgba(201, 146, 46, 0.06)' }}>
              <div style={{ fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 700, color: '#C9922E', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Possible duplicates</div>
              {duplicates.map((d, i) => (
                <div key={i} style={{ fontSize: 13, color: 'var(--white)', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ color: '#C9922E' }}>●</span>
                  {d.name || d.business}{d.stage ? ` (${d.type} — ${d.stage})` : ` (${d.type})`}
                </div>
              ))}
            </div>
          )}
          <div className="modal-row">
            <label className="modal-field">
              <span>Phone</span>
              <input value={form.phone} onChange={e => updateForm({ phone: e.target.value })} placeholder="(979) 555-0123" />
            </label>
            <label className="modal-field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={e => updateForm({ email: e.target.value })} placeholder="john@example.com" />
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
      business_name: form.business_name || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
      value: form.value !== '' && form.value !== null ? parseFloat(form.value) : null,
      last_activity: new Date().toISOString(),
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

  const [currentStage, setCurrentStage] = useState(deal.stage)
  const stageColor = STAGE_COLORS[currentStage] || '#7A8490'
  const [aiScore, setAiScore] = useState(null)
  const [aiScoreLoading, setAiScoreLoading] = useState(false)
  const [aiDraft, setAiDraft] = useState('')
  const [aiDraftLoading, setAiDraftLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  const handleScoreLead = async () => {
    setAiScoreLoading(true)
    setAiError('')
    try {
      const result = await askAssistant({ action: 'lead_score', data: { deal_id: deal.id }, context: { page: 'pipeline' } })
      setAiScore({ score: result.score, reasoning: result.reply })
    } catch (err) { setAiError(err.message) }
    finally { setAiScoreLoading(false) }
  }

  const handleDraftFollowUp = async () => {
    setAiDraftLoading(true)
    setAiError('')
    try {
      const result = await askAssistant({ action: 'follow_up_draft', data: { deal_id: deal.id }, context: { page: 'pipeline' } })
      setAiDraft(result.reply || '')
    } catch (err) { setAiError(err.message) }
    finally { setAiDraftLoading(false) }
  }

  const handleStageChange = async (newStage) => {
    const prev = currentStage
    setCurrentStage(newStage)
    const { error } = await supabase.from('pipeline').update({ stage: newStage, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', deal.id)
    if (error) { setCurrentStage(prev); return }
    onUpdated()
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="detail-panel" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{deal.contact_name}</h2>
            {deal.business_name && <p className="detail-business">{deal.business_name}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={currentStage} onChange={e => handleStageChange(e.target.value)}
              style={{
                fontFamily: 'var(--fh)', fontSize: 13, fontWeight: 700, letterSpacing: '1px',
                textTransform: 'uppercase', color: '#fff', backgroundColor: stageColor,
                padding: '8px 32px 8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                appearance: 'none', WebkitAppearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='7' viewBox='0 0 12 7'%3E%3Cpath d='M1 1l5 5 5-5' stroke='white' stroke-width='2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
              }}>
              {STAGES.map(s => <option key={s.id} value={s.id} style={{ color: '#fff', background: '#1a1a1a' }}>{s.label}</option>)}
            </select>
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
                    onClick={() => { if (!window.confirm('Convert this deal to a new client?')) return; onClose(); navigate('/clients', { state: { fromDeal: { deal_id: deal.id, contact_name: deal.contact_name, business_name: deal.business_name, phone: deal.phone, email: deal.email, service_line: deal.service_line } } }) }}>
                    Convert to Client
                  </button>
                ) : (
                  <button className="modal-btn-cancel" style={{ fontSize: 13, color: COLORS.green, borderColor: `${COLORS.green}44` }}
                    onClick={() => { onClose(); navigate('/clients') }}>
                    View Client
                  </button>
                )}
                {deal.client_id && (deal.stage === 'proposal_sent' || deal.stage === 'meeting_scheduled') ? (
                  <button className="modal-btn-save" style={{ fontSize: 13, background: COLORS.amber }}
                    onClick={() => { onClose(); navigate(`/contracts?client_id=${deal.client_id}`) }}>
                    Send Contract
                  </button>
                ) : deal.client_id && deal.stage !== 'under_contract' && deal.stage !== 'lost' ? (
                  <button className="modal-btn-cancel" style={{ fontSize: 13, opacity: 0.5 }} disabled title="Move to Proposal Sent or Meeting Scheduled to send a contract">
                    Send Contract
                  </button>
                ) : null}
              </div>
            </div>
            <div className="detail-section">
              <h3 className="detail-section-title">AI Tools</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <button className="modal-btn-cancel ai-tool-btn" onClick={handleScoreLead} disabled={aiScoreLoading}>
                  {aiScoreLoading ? 'Scoring...' : 'Score Lead'}
                </button>
                <button className="modal-btn-cancel ai-tool-btn" onClick={handleDraftFollowUp} disabled={aiDraftLoading}>
                  {aiDraftLoading ? 'Drafting...' : 'Draft Follow-up'}
                </button>
              </div>
              {aiError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 8 }}>{aiError}</div>}
              {aiScore && (
                <div className="ai-result-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span className="ai-score-badge" data-score={aiScore.score <= 3 ? 'low' : aiScore.score <= 6 ? 'mid' : 'high'}>{aiScore.score}/10</span>
                    <span style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'var(--fh)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Lead Score</span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--white)', lineHeight: 1.5 }}>{aiScore.reasoning}</p>
                </div>
              )}
              {aiDraft && (
                <div className="ai-result-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'var(--fh)', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Follow-up Draft</span>
                    <button className="ai-copy-btn" onClick={() => { navigator.clipboard.writeText(aiDraft) }}>Copy</button>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--white)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{aiDraft}</p>
                </div>
              )}
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

const STAGE_IDS = STAGES.map(s => s.id)

function DealCard({ deal, onDragStart, onDragEnd, onClick, onStageChange }) {
  const stageColor = STAGE_COLORS[deal.stage] || '#7A8490'
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(deal); return }
    const idx = STAGE_IDS.indexOf(deal.stage)
    if (e.key === 'ArrowRight' && idx < STAGE_IDS.length - 1) { e.preventDefault(); onStageChange(deal, STAGE_IDS[idx + 1]) }
    if (e.key === 'ArrowLeft' && idx > 0) { e.preventDefault(); onStageChange(deal, STAGE_IDS[idx - 1]) }
  }
  return (
    <div
      className="pipeline-card"
      tabIndex={0}
      role="button"
      aria-label={`${deal.contact_name} — ${deal.stage}. Arrow keys to move between stages.`}
      onKeyDown={handleKeyDown}
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
          {deal.client_id && <span title="Linked to client record" style={{ fontSize: 9, fontWeight: 700, color: COLORS.green, background: `${COLORS.green}22`, padding: '1px 5px', borderRadius: 2, letterSpacing: '0.5px', fontFamily: 'var(--fh)' }}>CLIENT</span>}
        </span>
        {isMobile && (
          <select
            value={deal.stage}
            aria-label={`Change stage for ${deal.contact_name}`}
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
  const [search, setSearch] = useState('')
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
    if (data && data.length >= 100) setLoadError('Showing first 100 deals. Archive older deals to see more.')
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

    const { error } = await supabase.from('pipeline').update({ stage: newStage, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', deal.id)
    if (error) {
      setDeals(prev => prev.map(d => d.id === deal.id ? { ...d, stage: previousStage } : d))
      setDragError('Failed to move card — changes reverted.')
      setTimeout(() => setDragError(''), 4000)
    }
  }

  const [tab, setTab] = useState('pipeline')
  const [submissions, setSubmissions] = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [selectedSub, setSelectedSub] = useState(null)

  const loadSubmissions = async () => {
    setSubsLoading(true)
    const { data } = await supabase.from('contact_submissions').select('*').order('created_at', { ascending: false })
    setSubmissions(data || [])
    setSubsLoading(false)
  }

  useEffect(() => {
    if (tab === 'submissions' && submissions.length === 0) loadSubmissions()
  }, [tab])

  const deleteSubmission = async (id) => {
    if (!window.confirm('Delete this submission?')) return
    const { error, count } = await supabase.from('contact_submissions').delete({ count: 'exact' }).eq('id', id)
    if (error) { showToast('Delete failed: ' + error.message); return }
    if (count === 0) { showToast('Delete blocked — check RLS policy'); return }
    setSubmissions(s => s.filter(x => x.id !== id))
    if (selectedSub?.id === id) setSelectedSub(null)
    showToast('Submission deleted')
  }

  const filteredDeals = search
    ? deals.filter(d => {
        const q = search.toLowerCase()
        return (d.contact_name || '').toLowerCase().includes(q) || (d.business_name || '').toLowerCase().includes(q) || (d.email || '').toLowerCase().includes(q)
      })
    : deals
  const dealsByStage = (stageId) => filteredDeals.filter(d => d.stage === stageId)

  const totalPipelineValue = filteredDeals
    .filter(d => d.stage !== 'lost')
    .reduce((sum, d) => sum + (d.value || 0), 0)

  const wonValue = filteredDeals
    .filter(d => d.stage === 'under_contract')
    .reduce((sum, d) => sum + (d.value || 0), 0)

  return (
    <div className="pipeline-page">
      <div className="pipeline-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1>Pipeline</h1>
          {tab === 'pipeline' && <button className="clients-add-btn" onClick={() => setShowAdd(true)}>+ Add Deal</button>}
        </div>
      </div>
      <div className="detail-tabs" role="tablist" style={{ padding: 0, marginBottom: 16 }}>
        <button className={`detail-tab ${tab === 'pipeline' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'pipeline'} onClick={() => setTab('pipeline')}>Pipeline</button>
        <button className={`detail-tab ${tab === 'submissions' ? 'detail-tab--active' : ''}`} role="tab" aria-selected={tab === 'submissions'} onClick={() => setTab('submissions')}>Submissions{submissions.length > 0 ? ` (${submissions.length})` : ''}</button>
      </div>
      {tab === 'pipeline' && (
        <>
          <input className="clients-search" placeholder="Search deals..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250, flex: 'none', marginBottom: 8 }} />
          <p style={{ fontSize: 13, color: 'var(--steel)', marginBottom: 12 }}>{filteredDeals.filter(d => d.stage !== 'lost').length} active deals
            {totalPipelineValue > 0 && ` · $${totalPipelineValue.toLocaleString()} in play`}
            {wonValue > 0 && ` · $${wonValue.toLocaleString()} under contract`}
          </p>
        </>
      )}

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

      {tab === 'pipeline' ? (
        <>
          {loading ? (
            <div className="clients-loading">Loading...</div>
          ) : deals.length === 0 ? (
            <div className="clients-empty" style={{ textAlign: 'center', padding: 40 }}>
              <p>No deals yet. Add your first one to start tracking your pipeline.</p>
            </div>
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
                    const { error } = await supabase.from('pipeline').update({ stage: newStage, last_activity: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', deal.id)
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
        </>
      ) : (
        <div>
          {subsLoading ? (
            <div className="clients-loading">Loading...</div>
          ) : submissions.length === 0 ? (
            <div className="clients-empty" style={{ textAlign: 'center', padding: 40 }}>
              <p>No form submissions yet.</p>
            </div>
          ) : (
            <table className="clients-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Service</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {submissions.map(s => (
                  <tr key={s.id} onClick={() => setSelectedSub(s)} style={{ cursor: 'pointer' }}>
                    <td>{s.name || '—'}</td>
                    <td>{s.company || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.service || '—'}</td>
                    <td>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td>
                      <button
                        className="modal-btn-cancel"
                        style={{ fontSize: 11, color: '#C23B22', borderColor: '#C23B2244', padding: '3px 8px' }}
                        onClick={(e) => { e.stopPropagation(); deleteSubmission(s.id) }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selectedSub && (
            <div className="modal-overlay" role="presentation" onClick={() => setSelectedSub(null)}>
              <div className="detail-panel" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="detail-header">
                  <div>
                    <h2 className="detail-name">{selectedSub.name || 'No name'}</h2>
                    {selectedSub.company && <p className="detail-business">{selectedSub.company}</p>}
                  </div>
                  <button className="modal-btn-cancel" onClick={() => setSelectedSub(null)} style={{ fontSize: 12 }}>Close</button>
                </div>
                <div className="detail-body">
                  <div className="detail-section">
                    <h3 className="detail-section-title">Contact Info</h3>
                    <div className="detail-grid">
                      <div className="detail-item"><span className="detail-label">Phone</span><span>{selectedSub.phone || '—'}</span></div>
                      <div className="detail-item"><span className="detail-label">Email</span><span>{selectedSub.email || '—'}</span></div>
                      <div className="detail-item"><span className="detail-label">Service</span><span>{selectedSub.service || '—'}</span></div>
                      <div className="detail-item"><span className="detail-label">Submitted</span><span>{selectedSub.created_at ? new Date(selectedSub.created_at).toLocaleString() : '—'}</span></div>
                    </div>
                  </div>
                  {selectedSub.message && (
                    <div className="detail-section">
                      <h3 className="detail-section-title">Message</h3>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--white)', whiteSpace: 'pre-wrap' }}>{selectedSub.message}</p>
                    </div>
                  )}
                  <div className="detail-actions" style={{ justifyContent: 'space-between' }}>
                    <button
                      className="modal-btn-cancel"
                      style={{ color: '#C23B22', borderColor: '#C23B2244' }}
                      onClick={() => { deleteSubmission(selectedSub.id); setSelectedSub(null) }}
                    >
                      Delete
                    </button>
                    <button
                      className="modal-btn-save"
                      onClick={() => {
                        setSelectedSub(null)
                        setTab('pipeline')
                        setShowAdd(true)
                      }}
                    >
                      Create Deal from This
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
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
