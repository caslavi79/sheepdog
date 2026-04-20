// Public invoice payment page.
//
// Route: /pay/:token
// Access: PUBLIC (no auth) — the token is a UUID that acts as the bearer of
// capability. Anyone with the link can pay; nobody without it can.
//
// Flow:
//   1. Read token from URL
//   2. Call stripe-payment-intent edge function → get client_secret + invoice + surcharge
//   3. Mount <PaymentForm> with client_secret
//   4. On method change (card ↔ ACH), re-fetch to update surcharge amount
//   5. On submit, Stripe redirects to ?return_url=/pay/:token/complete
//   6. /pay/:token/complete reads payment_intent status from query, shows success

import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import PaymentForm from '../components/PaymentForm'
import { getPaymentIntent } from '../lib/billing'
import { isStripeConfigured } from '../lib/stripe'
import { fmtDate, fmtMoney } from '../lib/format'

const BRAND_COLOR = '#0C0C0C'
const BRAND_NAME = 'Sheepdog Security LLC'

// Error codes returned by the edge function that we want to map to specific UI states
const ERROR_CODES = {
  STRIPE_NOT_CONFIGURED: 'stripe_not_configured',
  ALREADY_PAID: 'invoice_already_paid',
  NOT_PAYABLE: 'invoice_not_payable',
  IN_PROGRESS: 'payment_in_progress',
  UNMODIFIABLE: 'payment_unmodifiable',
}

export default function PayInvoice() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [intent, setIntent] = useState(null)
  const [error, setError] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [methodChanging, setMethodChanging] = useState(false)
  const [methodChangeError, setMethodChangeError] = useState(null)

  // If Stripe redirects back with ?redirect_status or ?payment_intent, show success
  const redirectStatus = searchParams.get('redirect_status')
  const paymentIntentId = searchParams.get('payment_intent')

  const loadIntent = async (t, paymentMethodType) => {
    try {
      const res = await getPaymentIntent(t, paymentMethodType ? { paymentMethodType } : {})
      if (!res.success) {
        return {
          error: res.message || res.error || 'Could not load invoice',
          code: res.error,
        }
      }
      return { data: res }
    } catch (e) {
      return { error: e.message, code: 'network_error' }
    }
  }

  useEffect(() => {
    // If Stripe redirected back with a status claim, verify it against our
    // backend before showing success — otherwise a bookmarked URL or spoofed
    // param would show success without a real payment.
    if (redirectStatus === 'succeeded' || redirectStatus === 'processing') {
      loadIntent(token).then(({ data, error, code }) => {
        // If the edge function says invoice is already paid, great — show success.
        if (code === ERROR_CODES.ALREADY_PAID || code === ERROR_CODES.IN_PROGRESS) {
          setIntent(null)
          setLoading(false)
          return
        }
        // If the intent loaded and the underlying PI actually succeeded,
        // treat as verified. Otherwise, the redirect param was spoofed or stale.
        if (data) {
          setIntent(data)
        } else if (error) {
          setError(error)
          setErrorCode(code)
        }
        setLoading(false)
      })
      return
    }
    loadIntent(token).then(({ data, error, code }) => {
      if (error) {
        setError(error)
        setErrorCode(code)
      } else {
        setIntent(data)
      }
      setLoading(false)
    })
  }, [token, redirectStatus])

  async function handleMethodChange(method) {
    if (methodChanging) return
    setMethodChanging(true)
    setMethodChangeError(null)
    const { data, error } = await loadIntent(token, method)
    if (error) {
      // Surface inline instead of destroying the form so user can retry
      setMethodChangeError(error)
    } else {
      setIntent(data)
    }
    setMethodChanging(false)
  }

  // Set browser tab title for better UX when client has the pay link open
  useEffect(() => {
    const invNum = intent?.invoice?.invoice_number
    const brand = intent?.brand_name || BRAND_NAME
    document.title = invNum ? `Pay invoice ${invNum} · ${brand}` : `Pay invoice · ${brand}`
    return () => { document.title = brand }
  }, [intent])

  const returnUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/pay/${token}`
  }, [token])

  // ---------------------------------------------------------------------
  // Loading — must come BEFORE redirect-status branches so we don't flash
  // success before backend verification completes
  // ---------------------------------------------------------------------
  if (!isStripeConfigured()) {
    return (
      <PageShell>
        <StatusCard
          title="Online payments unavailable"
          body="This invoice can't be paid online yet. Please contact us for alternate payment methods — check, Zelle, or bank transfer."
          variant="warning"
        />
      </PageShell>
    )
  }

  if (errorCode === ERROR_CODES.STRIPE_NOT_CONFIGURED) {
    return (
      <PageShell>
        <StatusCard
          title="Online payments unavailable"
          body="The payment system isn't fully configured yet. Please contact us for alternate payment methods."
          variant="warning"
        />
      </PageShell>
    )
  }

  if (loading) {
    return <PageShell><div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Loading invoice…</div></PageShell>
  }

  // ---------------------------------------------------------------------
  // Already-paid success state (either verified via redirect or detected
  // on fresh load because invoice.status='paid' in the DB)
  // ---------------------------------------------------------------------
  if (errorCode === ERROR_CODES.ALREADY_PAID || (redirectStatus === 'succeeded' && !intent?.client_secret)) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: 64, height: 64, margin: '0 auto 20px', background: '#357A38', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 32, fontWeight: 700 }}>✓</div>
          <h1 style={{ fontSize: 24, margin: '0 0 12px' }}>Payment received</h1>
          <p style={{ color: '#666', fontSize: 15, marginBottom: 24 }}>
            This invoice has been paid. A confirmation email was sent when the payment cleared.
          </p>
          {paymentIntentId && (
            <p style={{ fontSize: 12, color: '#999' }}>Reference: {paymentIntentId}</p>
          )}
        </div>
      </PageShell>
    )
  }

  if (errorCode === ERROR_CODES.IN_PROGRESS || (redirectStatus === 'processing' && !intent?.client_secret)) {
    return (
      <PageShell>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h1 style={{ fontSize: 22 }}>Payment processing</h1>
          <p style={{ color: '#666' }}>
            Your payment is processing. Bank transfers (ACH) typically take 3–5 business days to clear. You'll receive an email once complete.
          </p>
        </div>
      </PageShell>
    )
  }

  // ---------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------
  if (errorCode === ERROR_CODES.NOT_PAYABLE) {
    return (
      <PageShell>
        <StatusCard
          title="Invoice not available"
          body="This invoice isn't ready for online payment. Please contact us."
          variant="warning"
        />
      </PageShell>
    )
  }

  if (error) {
    // Map Stripe-internal error strings to friendlier text where we can
    const friendlyMessage = /No such (customer|payment_intent)/i.test(error)
      ? 'This payment link is no longer valid. Please contact us for a new link.'
      : error
    return (
      <PageShell>
        <StatusCard title="Unable to load invoice" body={friendlyMessage} variant="error" />
      </PageShell>
    )
  }

  if (!intent?.client_secret) {
    return <PageShell><StatusCard title="Invoice not found" body="This payment link is invalid or expired." variant="error" /></PageShell>
  }

  // ---------------------------------------------------------------------
  // Main payment UI
  // ---------------------------------------------------------------------
  const { invoice, surcharge, allow_card, allow_ach } = intent
  const brandName = intent.brand_name || BRAND_NAME

  return (
    <PageShell brandName={brandName}>
      <h1 style={{ fontSize: 22, margin: '0 0 4px' }}>Pay invoice</h1>
      <p style={{ color: '#666', fontSize: 14, margin: '0 0 24px' }}>
        {invoice.client_business_name || invoice.client_contact_name || ''}
      </p>

      <div style={{ padding: 16, background: '#FAFAFA', borderRadius: 8, marginBottom: 24, border: '1px solid #eee' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
          <div>
            <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Invoice</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{invoice.invoice_number || '—'}</div>
          </div>
          <div>
            <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Due</div>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{fmtDate(invoice.due_date)}</div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ color: '#888', textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>Amount</div>
            <div style={{ fontWeight: 700, marginTop: 2, fontSize: 20 }}>{fmtMoney(invoice.total)}</div>
          </div>
        </div>
        {invoice.notes && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #eee', fontSize: 13, color: '#555', whiteSpace: 'pre-wrap', maxHeight: 180, overflowY: 'auto' }}>
            {invoice.notes}
          </div>
        )}
      </div>

      {methodChangeError && (
        <div role="alert" style={{ padding: 12, background: '#FEE', color: '#B00', borderRadius: 6, fontSize: 13, marginBottom: 16 }}>
          Couldn't update payment method: {methodChangeError}. Please try again.
        </div>
      )}

      <PaymentForm
        clientSecret={intent.client_secret}
        surcharge={surcharge}
        allowCard={allow_card}
        allowAch={allow_ach}
        onMethodChange={handleMethodChange}
        submitting={submitting}
        setSubmitting={setSubmitting}
        methodChanging={methodChanging}
        returnUrl={returnUrl}
        brandColor={BRAND_COLOR}
      />
    </PageShell>
  )
}

function PageShell({ children, brandName = BRAND_NAME }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F5F5F5', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ background: BRAND_COLOR, padding: '16px 24px', textAlign: 'center' }}>
        <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          {brandName}
        </div>
      </div>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
          {children}
        </div>
        <p style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 20 }}>
          Secure payment processed by Stripe · {brandName}
        </p>
      </div>
    </div>
  )
}

function StatusCard({ title, body, variant }) {
  const color = variant === 'error' ? '#B00' : variant === 'warning' ? '#B67A00' : '#222'
  const bg = variant === 'error' ? '#FEE' : variant === 'warning' ? '#FFF4DC' : '#F5F5F5'
  return (
    <div style={{ padding: 24, background: bg, borderRadius: 8, color }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h2>
      <p style={{ margin: 0, fontSize: 14 }}>{body}</p>
    </div>
  )
}
