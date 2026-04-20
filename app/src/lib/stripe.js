// Stripe.js client-side loader. Lazy — Stripe.js is only fetched when a
// component actually needs it (payment page) so the bundle stays slim for
// the rest of the app.
//
// Set VITE_STRIPE_PUBLISHABLE_KEY in app/.env when the Stripe account is live.
// Until then, isStripeConfigured() returns false and the UI can render a
// graceful fallback message.

import { loadStripe } from '@stripe/stripe-js'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY

let stripePromise = null

/** Returns a promise resolving to the Stripe instance, or null if not configured. */
export function getStripe() {
  if (!publishableKey) return null
  if (!stripePromise) stripePromise = loadStripe(publishableKey)
  return stripePromise
}

/** True if VITE_STRIPE_PUBLISHABLE_KEY is set (Stripe UI should render). */
export function isStripeConfigured() {
  return !!publishableKey
}

/**
 * Base URL for edge functions. `VITE_SUPABASE_URL` is required by the app (see
 * lib/supabase.js, which throws if missing) — this reference assumes the app
 * has already booted and that invariant is satisfied.
 */
export const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
