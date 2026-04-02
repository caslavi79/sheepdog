import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEscapeKey, useBodyLock } from '../lib/hooks'
import { askAssistant } from '../lib/assistant'
import { supabase } from '../lib/supabase'

const TABLE_LABELS = {
  pipeline: 'LEAD',
  clients: 'CLIENT',
  events: 'EVENT',
  invoices: 'INVOICE',
  contracts: 'CONTRACT',
  staff: 'STAFF',
  licenses: 'LICENSE',
}

const TABLE_COLORS = {
  pipeline: '#3D5A80',
  clients: '#357A38',
  events: '#C9922E',
  invoices: '#D4483A',
  contracts: '#7A8490',
  staff: '#357A38',
  licenses: '#C9922E',
}

const TABLE_ROUTES = {
  pipeline: '/pipeline',
  clients: '/clients',
  events: '/scheduling',
  invoices: '/financials',
  contracts: '/contracts',
  staff: '/compliance',
  licenses: '/compliance',
}

export default function AssistantPanel({ onClose, currentPage }) {
  const navigate = useNavigate()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID())
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEscapeKey(onClose)
  useBodyLock()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!showHistory) inputRef.current?.focus()
  }, [showHistory])

  const loadSessions = async () => {
    setSessionsLoading(true)
    const { data } = await supabase
      .from('assistant_messages')
      .select('session_id, content, role, created_at')
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(100)

    // Group by session_id, take the first user message as the preview
    const seen = new Map()
    for (const row of data || []) {
      if (!seen.has(row.session_id)) {
        seen.set(row.session_id, {
          session_id: row.session_id,
          preview: row.content?.slice(0, 80) || '(image)',
          created_at: row.created_at,
        })
      }
    }
    setSessions([...seen.values()])
    setSessionsLoading(false)
  }

  const loadSession = async (sid) => {
    const { data } = await supabase
      .from('assistant_messages')
      .select('role, content, metadata')
      .eq('session_id', sid)
      .order('created_at', { ascending: true })

    const loaded = (data || []).map((m) => ({
      role: m.role,
      content: m.content,
      actions_taken: m.metadata?.actions_taken || [],
      intake: m.metadata?.action_count != null,
    }))
    setMessages(loaded)
    setSessionId(sid)
    setShowHistory(false)
  }

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleFileDrop = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const clearImage = () => {
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const resizeAndEncode = (file, maxWidth = 1024) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        let w = img.width, h = img.height
        if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        resolve(dataUrl.split(',')[1])
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })

  const handleSend = async () => {
    const text = input.trim()
    if (!text && !imageFile) return

    const userMsg = { role: 'user', content: text, image: imagePreview }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    let imageBase64 = null
    let imageMediaType = null
    if (imageFile) {
      imageBase64 = await resizeAndEncode(imageFile)
      imageMediaType = 'image/jpeg'
    }
    clearImage()

    try {
      // Always use intake — it handles both actionable data AND pure questions
      const result = await askAssistant({
        action: 'intake',
        message: text || undefined,
        context: { page: currentPage },
        sessionId,
        imageBase64,
        imageMediaType,
      })

      if (result.session_id) setSessionId(result.session_id)

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: result.reply || 'Done.',
          actions_taken: result.actions_taken || [],
          intake: true,
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err.message}`, isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewSession = () => {
    setMessages([])
    setSessionId(crypto.randomUUID())
    clearImage()
    setShowHistory(false)
  }

  const handleToggleHistory = () => {
    if (!showHistory) loadSessions()
    setShowHistory(!showHistory)
  }

  const handleViewRecord = (table) => {
    const route = TABLE_ROUTES[table]
    if (route) {
      onClose()
      navigate(route)
    }
  }

  // Simple markdown-ish rendering for bold and numbered lists
  const renderText = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => {
      // Bold: **text**
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={j}>{part.slice(2, -2)}</strong>
        }
        return part
      })
      return <div key={i} style={line === '' ? { height: 8 } : undefined}>{parts}</div>
    })
  }

  return (
    <div className="assistant-overlay" role="presentation" onClick={onClose}>
      <div
        className={`assistant-panel${dragOver ? ' assistant-panel--dragover' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Sheepdog AI Assistant"
        onClick={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileDrop(e.dataTransfer?.files?.[0]) }}
      >
        {/* Header */}
        <div className="assistant-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 0 1 10 10c0 6-10 12-10 12S2 18 2 12A10 10 0 0 1 12 2z" />
            </svg>
            <span className="assistant-title">Sheepdog AI</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="assistant-header-btn"
              onClick={handleToggleHistory}
              title={showHistory ? 'Back to chat' : 'Chat history'}
              aria-label={showHistory ? 'Back to chat' : 'Chat history'}
              style={showHistory ? { color: 'var(--red)' } : undefined}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </button>
            <button
              className="assistant-header-btn"
              onClick={handleNewSession}
              title="New conversation"
              aria-label="New conversation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button
              className="assistant-header-btn"
              onClick={onClose}
              title="Close"
              aria-label="Close assistant"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* Messages or History */}
        <div className="assistant-messages">
          {showHistory ? (
            <div className="assistant-history">
              <div style={{ fontSize: 12, color: 'var(--steel)', fontFamily: 'var(--fh)', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
                Recent Conversations
              </div>
              {sessionsLoading ? (
                <div style={{ color: 'var(--steel)', fontSize: 13 }}>Loading...</div>
              ) : sessions.length === 0 ? (
                <div style={{ color: 'var(--steel)', fontSize: 13 }}>No conversations yet.</div>
              ) : sessions.map((s) => (
                <button
                  key={s.session_id}
                  className="assistant-history-item"
                  onClick={() => loadSession(s.session_id)}
                >
                  <span className="assistant-history-preview">{s.preview}</span>
                  <span className="assistant-history-date">
                    {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="assistant-empty">
              <p style={{ fontSize: 14, color: 'var(--steel)', textAlign: 'center', marginTop: 32, lineHeight: 1.6 }}>
                Drop screenshots, jot quick notes, paste details — I'll create the records for you.
              </p>
            </div>
          ) : null}
          {!showHistory && messages.map((msg, i) => (
            <div key={i} className={`assistant-msg assistant-msg--${msg.role}${msg.isError ? ' assistant-msg--error' : ''}`}>
              {msg.image && (
                <img src={msg.image} alt="Uploaded" className="assistant-msg-image" />
              )}
              <div className="assistant-msg-text">{msg.intake ? renderText(msg.content) : msg.content}</div>
              {/* Action cards for created records */}
              {msg.actions_taken && msg.actions_taken.length > 0 && (
                <div className="intake-actions">
                  {msg.actions_taken.map((action, j) => (
                    <button
                      key={j}
                      className="intake-action-card"
                      onClick={() => handleViewRecord(action.table)}
                    >
                      <span
                        className="intake-action-badge"
                        style={{ background: TABLE_COLORS[action.table] || '#7A8490' }}
                      >
                        {TABLE_LABELS[action.table] || action.table.toUpperCase()}
                      </span>
                      <span className="intake-action-label">{action.label}</span>
                      {action.extra && (
                        <span className="intake-action-extra">{action.extra}</span>
                      )}
                      <span className="intake-action-status">{action.status}</span>
                      <svg className="intake-action-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!showHistory && loading && (
            <div className="assistant-msg assistant-msg--assistant">
              <div className="assistant-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="assistant-image-preview">
            <img src={imagePreview} alt="Preview" />
            <button onClick={clearImage} className="assistant-image-remove" aria-label="Remove image">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Input */}
        <div className="assistant-input-area">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <button
            className="assistant-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload image"
            aria-label="Upload image"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
          <textarea
            ref={inputRef}
            className="assistant-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Drop details, screenshots, notes..."
            rows={1}
            disabled={loading}
          />
          <button
            className="assistant-send-btn"
            onClick={handleSend}
            disabled={loading || (!input.trim() && !imageFile)}
            aria-label="Send message"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
