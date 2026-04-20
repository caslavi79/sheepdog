// Billing service — thin wrappers around the stripe-payment-intent edge function
// plus helpers used by both the admin Financials page and the public /pay page.

import { FUNCTIONS_URL } from './stripe'
import { supabase } from './supabase'

/**
 * Public: fetch a PaymentIntent client_secret for an invoice given its payment
 * link token. No auth required — the token is the bearer of capability.
 *
 * Returns the raw JSON plus `ok` and `status` so callers can distinguish:
 *   - success === true — client_secret populated
 *   - status === 503 && error === 'stripe_not_configured' — server keys missing
 *   - status === 410 && error === 'invoice_already_paid' — pay flow complete
 *   - status === 403 && error === 'invoice_not_payable' — draft/cancelled invoice
 *   - status === 409 && error === 'payment_in_progress' — ACH in flight
 */
export async function getPaymentIntent(token, { paymentMethodType } = {}) {
  const isPost = !!paymentMethodType

  // For POST, put everything in the body — avoids redundant query-string
  // copy of the token. For GET, query string is the only channel.
  const url = isPost
    ? `${FUNCTIONS_URL}/stripe-payment-intent`
    : `${FUNCTIONS_URL}/stripe-payment-intent?token=${encodeURIComponent(token)}`

  const res = await fetch(url, {
    method: isPost ? 'POST' : 'GET',
    headers: isPost ? { 'Content-Type': 'application/json' } : {},
    body: isPost ? JSON.stringify({ token, payment_method_type: paymentMethodType }) : undefined,
  })

  const json = await res.json().catch(() => ({ success: false, error: 'invalid_response', message: 'Server returned an unexpected response.' }))
  return { ok: res.ok, status: res.status, ...json }
}

/** Admin: full public pay URL for an invoice. */
export function buildPayUrl(invoice) {
  if (!invoice?.payment_link_token) return null
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://app.sheepdogtexas.com'
  return `${origin}/pay/${invoice.payment_link_token}`
}

/**
 * Admin: ensure an invoice has a payment_link_token. Default is set at row
 * creation by the DB, but older invoices may not have one.
 *
 * Accepts either an invoice object (preferred — short-circuits if token is
 * already loaded) or an invoice id (fallback — requires a SELECT).
 *
 * The UPDATE uses `payment_link_token IS NULL` in the filter to prevent a
 * race where two admins click "Copy Pay Link" concurrently on the same
 * legacy invoice and the last write wins. Only the first UPDATE succeeds;
 * the second returns zero rows and we re-select to get the winner's token.
 */
export async function ensurePayToken(invoiceOrId) {
  // Short-circuit if the caller already has the token loaded
  if (typeof invoiceOrId === 'object' && invoiceOrId?.payment_link_token) {
    return invoiceOrId.payment_link_token
  }
  const invoiceId = typeof invoiceOrId === 'object' ? invoiceOrId.id : invoiceOrId

  const { data: existing, error } = await supabase
    .from('invoices')
    .select('payment_link_token')
    .eq('id', invoiceId)
    .maybeSingle()
  if (error) throw error
  if (existing?.payment_link_token) return existing.payment_link_token

  // Conditional update: only write if still null. Returns zero rows on race loss.
  const newToken = crypto.randomUUID()
  const { data: updated } = await supabase
    .from('invoices')
    .update({ payment_link_token: newToken })
    .eq('id', invoiceId)
    .is('payment_link_token', null)
    .select('payment_link_token')

  if (updated && updated.length > 0) return updated[0].payment_link_token

  // Race lost — re-read to get whatever the winner wrote
  const { data: final, error: finalErr } = await supabase
    .from('invoices')
    .select('payment_link_token')
    .eq('id', invoiceId)
    .single()
  if (finalErr) throw finalErr
  return final.payment_link_token
}

/** Admin: list payments for an invoice (attempts + outcomes). */
export async function listPayments(invoiceId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Note: fmtCents lives in format.js to stay alongside other money formatting.
