import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useEscapeKey, useBodyLock } from '../lib/hooks'

const SERVICE_LABELS = {
  'events-security': 'Event Security',
  'events-bartending': 'Mobile Bartending',
  'events-both': 'Security + Bartending',
  'staffing': 'Contracted Staffing',
  'field-ops': 'Field Operations',
  'logistics': 'Logistics Support',
  'facility': 'Facility Maintenance',
  'warehouse': 'Warehouse Staffing',
  'project': 'Project-Based Labor',
  'ongoing': 'Ongoing Placements',
  'other': 'Not sure yet',
}

const PAGE_SIZE = 25

function SubmissionDetail({ sub, onClose }) {
  useEscapeKey(onClose)
  useBodyLock()
  const date = new Date(sub.created_at)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="detail-header">
          <div>
            <h2 className="detail-name">{sub.name}</h2>
            {sub.company && <p className="detail-business">{sub.company}</p>}
          </div>
          <span style={{
            fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
            textTransform: 'uppercase', color: '#7A8490', background: 'rgba(122,132,144,0.15)',
            padding: '3px 10px', borderRadius: 3
          }}>{SERVICE_LABELS[sub.service] || sub.service}</span>
        </div>
        <div className="detail-body">
          <div className="detail-section">
            <h3 className="detail-section-title">Contact Info</h3>
            <div className="detail-grid">
              <div className="detail-item"><span className="detail-label">Email</span><span>{sub.email}</span></div>
              <div className="detail-item"><span className="detail-label">Phone</span><span>{sub.phone || '—'}</span></div>
              <div className="detail-item"><span className="detail-label">Submitted</span><span>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
            </div>
          </div>
          <div className="detail-section">
            <h3 className="detail-section-title">Message</h3>
            <p style={{ color: 'var(--slate)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{sub.message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Submissions() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, count, error } = await supabase
      .from('contact_submissions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)
    if (error) { setLoadError('Failed to load submissions. Please refresh.'); if (import.meta.env.DEV) console.error('Load submissions error:', error.message) }
    setSubmissions(data || [])
    setTotalCount(count || 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [page])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  return (
    <div className="clients-page">
      <div className="clients-header">
        <div>
          <h1>Submissions</h1>
          <p>{totalCount} contact form submission{totalCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {loadError && (
        <div style={{ background: '#3d2020', border: '1px solid #C23B2244', color: '#C23B22', padding: '10px 16px', borderRadius: 4, fontSize: 13, marginBottom: 12 }}>
          {loadError} <button onClick={load} style={{ marginLeft: 8, background: 'none', border: '1px solid #C23B22', color: '#C23B22', padding: '4px 12px', borderRadius: 3, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div className="clients-loading">Loading...</div>
      ) : submissions.length === 0 ? (
        <div className="clients-loading">No submissions yet.</div>
      ) : (
        <div className="clients-table-wrap">
          <table className="clients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Company</th>
                <th>Service</th>
                <th>Email</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(sub => {
                const date = new Date(sub.created_at)
                return (
                  <tr key={sub.id} onClick={() => setSelected(sub)} style={{ cursor: 'pointer' }}>
                    <td className="clients-name">{sub.name}</td>
                    <td>{sub.company || '—'}</td>
                    <td>{SERVICE_LABELS[sub.service] || sub.service}</td>
                    <td>{sub.email}</td>
                    <td>{date.toLocaleDateString()}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="pagination-btn" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="pagination-info">Page {page + 1} of {totalPages}</span>
          <button className="pagination-btn" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {selected && <SubmissionDetail sub={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
