// PaymentForm
//
// Wrapped Stripe Elements with method toggle (card vs bank link). Used by the
// public /pay/:token page. Not used by the authenticated admin app — staff
// don't take card numbers over the phone.
//
// The parent page fetches the client_secret via getPaymentIntent() and passes
// it in. When the client selects "Pay by bank" we call getPaymentIntent again
// with payment_method_type='us_bank_account' so the edge function can drop the
// surcharge to $0 before confirmation.

import { useEffect, useMemo, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { getStripe } from '../lib/stripe'
import { fmtMoney } from '../lib/format'

function InnerForm({ surcharge, allowCard, allowAch, onMethodChange, submitting, setSubmitting, methodChanging, returnUrl, brandColor }) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState(null)
  const [selectedMethod, setSelectedMethod] = useState(allowAch && allowCard ? 'card' : (allowCard ? 'card' : 'us_bank_account'))

  function handleMethodChange(next) {
    if (next === selectedMethod || methodChanging) return
    setSelectedMethod(next)
    onMethodChange?.(next)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements || submitting) return
    // Block submit while parent is refetching intent after method toggle —
    // otherwise we could submit with stale clientSecret/surcharge mismatch
    // (Stripe would charge the old amount even though UI shows the new one).
    if (methodChanging) {
      setError('Please wait while we update your payment total.')
      return
    }
    // Sanity check — our UI-selected method must match what the intent was
    // last computed against. If parent hasn't updated surcharge yet, bail.
    if (surcharge?.payment_method_type && surcharge.payment_method_type !== selectedMethod) {
      setError('Still updating — one moment…')
      return
    }
    setError(null)
    setSubmitting(true)

    const { error: submitError } = await elements.submit()
    if (submitError) {
      setError(submitError.message || 'Could not submit payment details')
      setSubmitting(false)
      return
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    })

    // confirmPayment only returns here if there was an immediate error; on
    // success the browser is redirected to return_url
    if (confirmError) {
      setError(confirmError.message || 'Payment could not be processed')
      setSubmitting(false)
    }
  }

  // Defensive: if both methods are disallowed (shouldn't happen — parent
  // shouldn't mount us), show error rather than a broken form.
  if (!allowCard && !allowAch) {
    return (
      <div style={{ padding: 16, background: '#FEE', color: '#B00', borderRadius: 8 }}>
        No payment methods are enabled for this invoice. Please contact us.
      </div>
    )
  }

  const bothAllowed = allowCard && allowAch
  const surchargeApplies = selectedMethod === 'card' && (surcharge?.surcharge_amount || 0) > 0
  // Fallback so buttons never read "Pay $undefined" while surcharge is loading
  const displayTotal = surchargeApplies
    ? (surcharge?.total_amount ?? surcharge?.base_amount ?? 0)
    : (surcharge?.base_amount ?? 0)

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {bothAllowed && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, opacity: methodChanging ? 0.6 : 1, pointerEvents: methodChanging ? 'none' : 'auto' }}>
          <button
            type="button"
            onClick={() => handleMethodChange('us_bank_account')}
            disabled={methodChanging}
            style={methodBtnStyle(selectedMethod === 'us_bank_account', brandColor)}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>Bank (ACH)</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>No fee · recommended</div>
          </button>
          <button
            type="button"
            onClick={() => handleMethodChange('card')}
            disabled={methodChanging}
            style={methodBtnStyle(selectedMethod === 'card', brandColor)}
          >
            <div style={{ fontSize: 14, fontWeight: 700 }}>Credit / Debit Card</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Processing fee applies</div>
          </button>
        </div>
      )}

      <div style={{ padding: 16, border: '1px solid #e5e5e5', borderRadius: 8, background: '#fafafa' }}>
        <PaymentElement
          options={{
            layout: 'tabs',
            paymentMethodOrder: selectedMethod === 'us_bank_account' ? ['us_bank_account', 'card'] : ['card', 'us_bank_account'],
          }}
        />
      </div>

      {surcharge?.explanation && (
        <div style={{
          padding: 12,
          background: surchargeApplies ? '#FFF8E1' : '#F5F5F5',
          borderRadius: 6,
          fontSize: 13,
          color: '#555',
          border: surchargeApplies ? '1px solid #F0D77A' : '1px solid #E5E5E5',
        }}>
          {surcharge.explanation}
        </div>
      )}

      <div style={{ borderTop: '1px solid #eee', paddingTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#666' }}>
          <span>Invoice total</span>
          <span>{fmtMoney(surcharge?.base_amount ?? 0)}</span>
        </div>
        {surchargeApplies && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: '#666' }}>
            <span>Surcharge</span>
            <span>+ {fmtMoney(surcharge.surcharge_amount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, marginTop: 8 }}>
          <span>You pay</span>
          <span>{fmtMoney(displayTotal)}</span>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ padding: 12, background: '#FEE', color: '#B00', borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting || methodChanging}
        style={{
          padding: '14px 20px',
          background: brandColor,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 700,
          cursor: (submitting || methodChanging) ? 'wait' : 'pointer',
          opacity: (submitting || methodChanging) ? 0.7 : 1,
        }}
      >
        {submitting ? 'Processing…' : methodChanging ? 'Updating…' : `Pay ${fmtMoney(displayTotal)}`}
      </button>

      <p style={{ fontSize: 11, color: '#999', textAlign: 'center', margin: 0 }}>
        Powered by Stripe · Your payment info never touches our servers
      </p>
    </form>
  )
}

function methodBtnStyle(selected, brandColor) {
  return {
    padding: '12px 14px',
    background: selected ? '#fff' : '#f8f8f8',
    border: `2px solid ${selected ? brandColor : '#e5e5e5'}`,
    borderRadius: 8,
    cursor: 'pointer',
    textAlign: 'left',
    color: '#222',
    transition: 'all 0.15s',
  }
}

/**
 * Outer wrapper that initializes the Stripe Elements provider with the
 * client_secret. Key on the client_secret to force remount when the surcharge
 * updates (method change => new amount => need new Elements).
 */
export default function PaymentForm(props) {
  const { clientSecret } = props
  const stripePromise = useMemo(() => getStripe(), [])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!stripePromise) return
    stripePromise.then(() => setReady(true))
  }, [stripePromise])

  if (!stripePromise) {
    return (
      <div style={{ padding: 24, background: '#FEE', borderRadius: 8, color: '#B00' }}>
        Online payment is not configured yet. Please contact us for alternate payment methods.
      </div>
    )
  }

  if (!ready || !clientSecret) {
    return <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>Loading payment form…</div>
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            // Stripe uses colorPrimary for focus rings, selected-tab underlines,
            // and radio highlights. A near-black brand color (#0C0C0C) makes
            // these nearly invisible and fails WCAG focus-visible contrast.
            // Use a dedicated accent for interactive state instead.
            colorPrimary: '#3D5A80',
            borderRadius: '8px',
          },
        },
      }}
      key={clientSecret}
    >
      <InnerForm {...props} />
    </Elements>
  )
}
