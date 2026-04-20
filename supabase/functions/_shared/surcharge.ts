// Card surcharge calculation.
//
// Strategy: approximate Stripe's own pricing (2.9% + $0.30 for domestic cards)
// and pass that through as a surcharge line item on credit card payments only.
// ACH/bank link payments get NO surcharge. Debit cards also get NO surcharge —
// federal Durbin rules prohibit surcharging debit regardless of state law.
//
// IMPORTANT: surcharging is gated on the SURCHARGING_ENABLED env var. This
// prevents accidentally surcharging before the 30-day Visa/Mastercard
// Surcharging Notification has been filed (a prerequisite per card-brand rules).
// Set `SURCHARGING_ENABLED=true` via `npx supabase secrets set` only AFTER the
// notification has been filed.
//
// Legal notes (reviewed 2026-04 but verify before going live):
//   - TX Finance Code §604A.0021 permits card surcharges with proper disclosure.
//   - Texas + card-brand rules require the word "surcharge" (not "fee") in the
//     disclosure, shown BEFORE the cardholder authorizes the transaction.
//   - Disclosure must show both the percentage and dollar amount of the surcharge.
//   - Surcharge must not exceed merchant's actual processing cost.
//   - Stripe-specific: file a Surcharging Notification with Visa 30 days before
//     starting. See https://stripe.com/docs/surcharging
//   - Must surcharge card brands equally (no Visa-only surcharge).

// Stripe domestic card pricing — update if Stripe changes their standard rate
export const CARD_PERCENT = 0.029;   // 2.9%
export const CARD_FLAT_CENTS = 30;   // $0.30

// ACH pricing at Stripe: 0.8% capped at $5.00 — we eat this, not surcharging
export const ACH_PERCENT = 0.008;
export const ACH_CAP_CENTS = 500;

export interface SurchargeBreakdown {
  baseAmountCents: number;      // invoice total (what client owes before fees)
  surchargeCents: number;       // fee added on top
  totalChargeCents: number;     // baseAmountCents + surchargeCents
  explanation: string;          // human-readable, shown to client before auth
}

/**
 * True iff the operator has explicitly enabled surcharging (via Supabase secret
 * `SURCHARGING_ENABLED=true`). Surcharging before the 30-day card-brand
 * notification is filed violates Visa/MC rules — this gate prevents that.
 */
export function isSurchargingEnabled(): boolean {
  return Deno.env.get("SURCHARGING_ENABLED") === "true";
}

/**
 * Given an invoice total (in cents) and the intended payment method, compute
 * the total we'll actually charge the card. For ACH or debit, surcharge is $0.
 *
 * The formula solves: total = base + (total × 0.029 + 30), i.e. we charge a
 * surcharge sufficient to recover Stripe's fee on the FULL amount charged. If
 * we only surcharged on the base amount, we'd still lose 2.9% × surcharge on
 * the surcharge itself. Solving for total:
 *   total = (base + 30) / (1 - 0.029)
 *   surcharge = total - base
 *
 * Rounding: uses Math.round (not ceil) so we don't over-collect vs Stripe's
 * actual fee. Stripe computes their fee on the charged amount and rounds to
 * the nearest cent, so Math.round here gives us sub-cent-accurate surcharge
 * matching — meaning we neither over-charge the payer nor significantly
 * under-recover (max ~0.5¢ drift on the merchant side).
 */
export function computeSurcharge(
  baseAmountCents: number,
  method: "card_credit" | "card_debit" | "us_bank_account" | "unknown",
): SurchargeBreakdown {
  // Guard: negative input is upstream bug — clamp to 0 so we never pass
  // negative amounts to Stripe (which would throw a less-obvious error).
  if (baseAmountCents <= 0) {
    return { baseAmountCents: Math.max(0, baseAmountCents), surchargeCents: 0, totalChargeCents: Math.max(0, baseAmountCents), explanation: "" };
  }

  // No surcharge unless ENABLED, OR on ACH/debit (Durbin) or unknown (safer
  // to absorb than risk illegal surcharge on ambiguous card types).
  if (!isSurchargingEnabled() || method !== "card_credit") {
    return {
      baseAmountCents,
      surchargeCents: 0,
      totalChargeCents: baseAmountCents,
      explanation: method === "us_bank_account"
        ? "No surcharge applies to bank payments."
        : "No surcharge applies to this payment method.",
    };
  }

  const totalChargeCents = Math.round((baseAmountCents + CARD_FLAT_CENTS) / (1 - CARD_PERCENT));
  const surchargeCents = totalChargeCents - baseAmountCents;
  const surchargePct = (surchargeCents / baseAmountCents) * 100;

  // Legal disclosure: TX + card-brand rules require the word "surcharge" (not
  // "fee"), plus both percentage and dollar amount, shown BEFORE authorization.
  return {
    baseAmountCents,
    surchargeCents,
    totalChargeCents,
    explanation: `A ${surchargePct.toFixed(2)}% surcharge ($${(surchargeCents / 100).toFixed(2)}) has been added to offset credit card processing costs. This surcharge does not exceed our cost of acceptance. Pay by bank (ACH) to avoid the surcharge.`,
  };
}

/** Classify a Stripe PaymentMethod into our internal method category. */
export function classifyPaymentMethod(pm: {
  type?: string;
  card?: { funding?: string } | null;
}): "card_credit" | "card_debit" | "us_bank_account" | "unknown" {
  if (pm.type === "us_bank_account") return "us_bank_account";
  if (pm.type === "card") {
    const funding = pm.card?.funding;
    if (funding === "credit") return "card_credit";
    if (funding === "debit" || funding === "prepaid") return "card_debit";
    return "unknown";
  }
  return "unknown";
}

/**
 * Convenience: dollars → cents, rounding to nearest cent.
 *
 * Uses .toFixed(2) to collapse float error before rounding — e.g. 100.555 in
 * JS is actually 100.55499999... which Math.round would map to 10055¢ instead
 * of the intuitive 10056¢. toFixed rounds the string representation first,
 * giving money-correct behavior.
 */
export function toCents(dollars: number | string): number {
  const n = typeof dollars === "string" ? parseFloat(dollars) : dollars;
  if (!Number.isFinite(n)) return 0;
  return Math.round(parseFloat(n.toFixed(2)) * 100);
}

/** Convenience: cents → dollars, always 2 decimal places. */
export function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}
