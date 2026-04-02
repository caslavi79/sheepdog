import { useState, useEffect, useRef } from 'react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const BRAND_COLOR = '#0C0C0C'

export default function Sign() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const [contract, setContract] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signed, setSigned] = useState(false)
  const [signerName, setSignerName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const hasDrawnRef = useRef(false)

  useEffect(() => {
    if (!token) { setError('No signing token provided.'); setLoading(false); return }
    fetch(`${SUPABASE_URL}/functions/v1/contract-sign?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) { setError(data.error || 'Contract not found.'); return }
        setContract(data.contract)
        if (data.contract.status === 'signed') setSigned(true)
      })
      .catch(() => setError('Failed to load contract.'))
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (!canvasRef.current || signed || !contract) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const getPos = (e) => {
      const r = canvas.getBoundingClientRect()
      const t = e.touches ? e.touches[0] : e
      return [(t.clientX - r.left) * (canvas.width / r.width), (t.clientY - r.top) * (canvas.height / r.height)]
    }
    const start = (e) => { e.preventDefault(); drawingRef.current = true; ctx.beginPath(); const [x, y] = getPos(e); ctx.moveTo(x, y) }
    const draw = (e) => { if (!drawingRef.current) return; e.preventDefault(); hasDrawnRef.current = true; const [x, y] = getPos(e); ctx.lineTo(x, y); ctx.strokeStyle = BRAND_COLOR; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke() }
    const stop = () => { drawingRef.current = false }
    canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stop); canvas.addEventListener('mouseleave', stop)
    canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', draw); canvas.addEventListener('touchend', stop); canvas.addEventListener('touchcancel', stop)
    return () => {
      canvas.removeEventListener('mousedown', start); canvas.removeEventListener('mousemove', draw); canvas.removeEventListener('mouseup', stop); canvas.removeEventListener('mouseleave', stop)
      canvas.removeEventListener('touchstart', start); canvas.removeEventListener('touchmove', draw); canvas.removeEventListener('touchend', stop); canvas.removeEventListener('touchcancel', stop)
    }
  }, [contract, signed])

  const clearSig = () => {
    if (!canvasRef.current) return
    canvasRef.current.getContext('2d').clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    hasDrawnRef.current = false
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!signerName.trim()) { setSubmitError('Please enter your full name.'); return }
    if (!hasDrawnRef.current) { setSubmitError('Please draw your signature.'); return }
    if (!agreed) { setSubmitError('Please agree to the terms.'); return }
    setSubmitError('')
    setSubmitting(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/contract-sign?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signer_name: signerName.trim(), signature_data: canvasRef.current.toDataURL('image/png') }),
      })
      const data = await res.json()
      if (data.success) { setSigned(true) } else { setSubmitError(data.error || 'Failed to submit.') }
    } catch { setSubmitError('Network error. Please try again.') }
    finally { setSubmitting(false) }
  }

  if (loading) return (
    <div className="sign-page">
      <div className="sign-container"><p style={{ textAlign: 'center', color: '#929BAA' }}>Loading contract...</p></div>
    </div>
  )

  if (error) return (
    <div className="sign-page">
      <div className="sign-container"><p style={{ textAlign: 'center', color: '#D4483A' }}>{error}</p></div>
    </div>
  )

  if (signed) return (
    <div className="sign-page">
      <div className="sign-container" style={{ textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
        <h2 style={{ color: '#357A38', marginBottom: 8 }}>Contract Signed</h2>
        <p style={{ color: '#929BAA' }}>
          {contract?.signed_at
            ? `Signed on ${new Date(contract.signed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by ${contract.signer_name || '—'}`
            : 'A confirmation has been sent to your email.'}
        </p>
      </div>
    </div>
  )

  return (
    <div className="sign-page">
      <div className="sign-container">
        <div className="sign-header">
          <img src="https://sheepdogtexas.com/favicon.jpg" alt="" style={{ width: 40, height: 40, borderRadius: 6 }} />
          <h1>{contract?.title || 'Contract'}</h1>
        </div>
        {contract?.filled_html && (
          <div className="sign-content">
            <iframe
              srcDoc={contract.filled_html}
              sandbox="allow-same-origin"
              style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
              title="Contract Content"
            />
          </div>
        )}
        <div className="sign-form-section">
          <h2>Sign This Contract</h2>
          <form onSubmit={handleSubmit}>
            <label className="sign-field">
              <span>Full Legal Name *</span>
              <input type="text" value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Enter your full name" required />
            </label>
            <label className="sign-field"><span>Signature *</span></label>
            <canvas ref={canvasRef} width={600} height={180} className="sign-canvas" />
            <button type="button" className="sign-clear" onClick={clearSig}>Clear Signature</button>
            <label className="sign-agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>I have read and agree to the terms of this contract. I understand that my electronic signature is legally binding.</span>
            </label>
            {submitError && <p className="sign-error">{submitError}</p>}
            <button type="submit" className="sign-submit" disabled={submitting}>
              {submitting ? 'Submitting...' : 'Sign & Submit'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
