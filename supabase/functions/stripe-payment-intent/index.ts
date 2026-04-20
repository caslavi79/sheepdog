// stripe-payment-intent
//
// Called from two places:
//   1. Public /pay/:token page — GET with ?token=<invoice_payment_link_token>
//      Returns { client_secret, invoice, surcharge_preview } so the browser
//      can mount Stripe Elements. No auth required — the token IS the auth.
//
//   2. Public /pay/:token page — POST with { token, payment_method_type }
//      Recomputes surcharge based on actual method chosen (card vs bank),
//      updates the PaymentIntent amount, returns updated client_secret.
//
// This function is safe to run before the Stripe account is live. Without
// STRIPE_SECRET_KEY set, it returns a clear "not configured" error and the
// UI falls back to the existing manual payment flow.
//
// Future Stripe Connect hook: to route funds to a staff member's connected
// account, pass `transfer_data[destination]` in the PaymentIntent create call.
// See the commented block below marked CONNECT-TODO.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStripe,
  isStripeConfigured,
  stripeApi,
} from "../_shared/stripe.ts";
import {
  computeSurcharge,
  toCents,
  toDollars,
} from "../_shared/surcharge.ts";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Sheepdog Security LLC";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // public — token acts as auth
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!isStripeConfigured()) {
    return jsonResponse({
      success: false,
      error: "stripe_not_configured",
      message: "Online payments are not yet enabled. Please pay by check, Zelle, or bank transfer — your invoice has instructions.",
    }, 503);
  }

  try {
    const url = new URL(req.url);

    // Parse POST body once (GETs have no body). Handles both body+query and
    // query-only callers; avoids double-consumption via req.clone().
    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
    }

    const token = url.searchParams.get("token") || (body.token as string | undefined) || null;
    const requestedMethodType = body.payment_method_type as "card" | "us_bank_account" | undefined;

    if (!token) {
      return jsonResponse({ success: false, error: "Missing payment token" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const stripe = getStripe();

    // Look up invoice by public token
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, client_id, invoice_number, total, status, due_date, notes, allow_card, allow_ach, stripe_payment_intent_id, payment_link_token, updated_at")
      .eq("payment_link_token", token)
      .maybeSingle();

    if (invErr || !invoice) {
      return jsonResponse({ success: false, error: "Invoice not found or link is invalid" }, 404);
    }

    if (invoice.status === "paid") {
      return jsonResponse({ success: false, error: "invoice_already_paid", message: "This invoice has already been paid." }, 410);
    }

    // Allowlist invoice statuses that can accept payment. Draft invoices may
    // have placeholder totals or unfinalized line items and must not be
    // publicly payable.
    if (!["sent", "overdue"].includes(invoice.status)) {
      return jsonResponse({
        success: false,
        error: "invoice_not_payable",
        message: "This invoice is not currently available for payment. Please contact us.",
      }, 403);
    }

    const baseAmountCents = toCents(Number(invoice.total || 0));
    if (baseAmountCents < 50) {
      // Stripe minimum is $0.50 USD
      return jsonResponse({ success: false, error: "Invoice amount is below the $0.50 minimum." }, 400);
    }

    // Pull lightweight client context for the payment page / Stripe Customer
    const { data: client } = invoice.client_id
      ? await supabase.from("clients").select("id, contact_name, business_name, email, phone").eq("id", invoice.client_id).maybeSingle()
      : { data: null };

    // Ensure a Stripe Customer exists for this client (lazily created)
    let stripeCustomerId: string | null = null;
    if (client) {
      const { data: existing } = await supabase
        .from("stripe_customers")
        .select("stripe_customer_id")
        .eq("client_id", client.id)
        .maybeSingle();

      if (existing?.stripe_customer_id) {
        stripeCustomerId = existing.stripe_customer_id;
      } else {
        const customer = await stripeApi.customers.create(stripe, {
          email: client.email || undefined,
          name: client.business_name || client.contact_name || undefined,
          phone: client.phone || undefined,
          metadata: { client_id: client.id },
        }, `client-${client.id}`); // idempotency: one customer per client id
        stripeCustomerId = (customer as { id: string }).id;
        await supabase.from("stripe_customers").insert({
          client_id: client.id,
          stripe_customer_id: stripeCustomerId,
        });
      }
    }

    // For the initial GET we don't know the method yet. We optimistically quote
    // the credit-card surcharge so the client sees the "worst case" up front,
    // then the POST call drops it to $0 if they choose ACH.
    const assumedCategory = requestedMethodType === "us_bank_account"
      ? "us_bank_account"
      : requestedMethodType === "card"
        ? "card_credit"
        : "card_credit"; // default to credit-card pricing for initial quote

    const breakdown = computeSurcharge(baseAmountCents, assumedCategory);

    // Build payment_method_types list from invoice preferences
    const paymentMethodTypes: string[] = [];
    if (invoice.allow_card !== false) paymentMethodTypes.push("card");
    if (invoice.allow_ach !== false) paymentMethodTypes.push("us_bank_account");
    if (paymentMethodTypes.length === 0) paymentMethodTypes.push("card"); // fallback

    // Reuse existing PI if one is already open for this invoice, else create.
    //
    // Terminal states handled explicitly:
    //   - succeeded: invoice.status would have been flipped to 'paid' by
    //     webhook, which would have failed the status gate above. Defense in depth.
    //   - canceled: we rotate and create a new PI (user probably came back days later)
    //   - processing: payment is mid-flight. Do NOT create a second PI — return
    //     the existing client_secret so Elements can show a processing message.
    let paymentIntent: any;

    if (invoice.stripe_payment_intent_id) {
      try {
        const existing: any = await stripeApi.paymentIntents.retrieve(stripe, invoice.stripe_payment_intent_id);
        if (existing.status === "succeeded") {
          return jsonResponse({ success: false, error: "invoice_already_paid", message: "This invoice has already been paid." }, 410);
        }
        if (existing.status === "processing") {
          return jsonResponse({
            success: false,
            error: "payment_in_progress",
            message: "A payment for this invoice is already being processed. Please wait a few minutes — you'll receive an email confirmation when it clears.",
          }, 409);
        }
        // Reuse actionable intents — the update may fail if the PI is in a
        // state that doesn't accept amount changes (e.g., already confirmed).
        if (["requires_payment_method", "requires_confirmation", "requires_action"].includes(existing.status)) {
          try {
            paymentIntent = await stripeApi.paymentIntents.update(stripe, invoice.stripe_payment_intent_id, {
              amount: breakdown.totalChargeCents,
              metadata: {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number || "",
                base_amount_cents: breakdown.baseAmountCents,
                surcharge_cents: breakdown.surchargeCents,
                client_id: invoice.client_id || "",
              },
            });
            // Keep payments row in sync with new amounts/surcharge
            await supabase.from("payments").update({
              amount: toDollars(breakdown.totalChargeCents),
              base_amount: toDollars(breakdown.baseAmountCents),
              surcharge_amount: toDollars(breakdown.surchargeCents),
              updated_at: new Date().toISOString(),
            }).eq("stripe_payment_intent_id", paymentIntent.id);
          } catch (updErr) {
            return jsonResponse({
              success: false,
              error: "payment_unmodifiable",
              message: "Your payment is already being submitted. Please wait a moment, or refresh this page if you need to start over.",
            }, 409);
          }
        }
        // canceled or other terminal-ish states: fall through and create a new PI
      } catch {
        // PI retrieval failed (maybe it was deleted) — fall through to create
      }
    }

    if (!paymentIntent) {
      // Scope the idempotency key to a window so it doesn't permanently lock
      // us to a terminal PI on retries. `updated_at` changes whenever the
      // invoice is modified; including it means a rotation happens naturally
      // when the invoice is edited, and the key stays stable for retries
      // within a single "state" of the invoice.
      const idempotencyKey = `invoice-${invoice.id}-${invoice.updated_at || Date.now()}`;

      paymentIntent = await stripeApi.paymentIntents.create(stripe, {
        amount: breakdown.totalChargeCents,
        currency: "usd",
        customer: stripeCustomerId || undefined,
        payment_method_types: paymentMethodTypes,
        description: `${BRAND_NAME} invoice ${invoice.invoice_number || invoice.id.slice(0, 8)}`,
        receipt_email: client?.email || undefined,
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number || "",
          base_amount_cents: breakdown.baseAmountCents,
          surcharge_cents: breakdown.surchargeCents,
          client_id: invoice.client_id || "",
        },
        // CONNECT-TODO: when enabling Stripe Connect for staff payouts, add:
        //   transfer_data: { destination: staffConnectAccountId, amount: staffPayoutCents }
        //   application_fee_amount: platformFeeCents
        // to route a portion of the payment directly to the staff member's
        // connected account. Requires stripe_connect_accounts row for the staff
        // member and onboarding_complete=true.
      }, idempotencyKey);

      await supabase.from("invoices").update({
        stripe_payment_intent_id: paymentIntent.id,
        surcharge_amount: toDollars(breakdown.surchargeCents),
        updated_at: new Date().toISOString(),
      }).eq("id", invoice.id);

      // Seed a payments row so the webhook has something to update
      await supabase.from("payments").insert({
        invoice_id: invoice.id,
        client_id: invoice.client_id,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: stripeCustomerId,
        amount: toDollars(breakdown.totalChargeCents),
        base_amount: toDollars(breakdown.baseAmountCents),
        surcharge_amount: toDollars(breakdown.surchargeCents),
        status: paymentIntent.status,
      });
    }

    return jsonResponse({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total: Number(invoice.total || 0),
        due_date: invoice.due_date,
        notes: invoice.notes,
        client_business_name: client?.business_name || null,
        client_contact_name: client?.contact_name || null,
      },
      surcharge: {
        base_amount: toDollars(breakdown.baseAmountCents),
        surcharge_amount: toDollars(breakdown.surchargeCents),
        total_amount: toDollars(breakdown.totalChargeCents),
        explanation: breakdown.explanation,
        applies_to: assumedCategory,
        payment_method_type: requestedMethodType || "card",
      },
      allow_card: invoice.allow_card !== false,
      allow_ach: invoice.allow_ach !== false,
      brand_name: BRAND_NAME,
    });
  } catch (err) {
    const e = err as Error & { stripeError?: unknown; status?: number };
    return jsonResponse({
      success: false,
      error: e.message,
      stripe_error: e.stripeError,
    }, e.status || 500);
  }
});
