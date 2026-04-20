// stripe-webhook
//
// Receives webhook events from Stripe, verifies the signature, and updates
// our local state:
//   - payments row status + fee/net amounts
//   - invoices status → 'paid' when PI succeeds
//   - dispute tracking
//   - notification emails to sheepdogsecurityllc@gmail.com (and client)
//
// Events we handle today:
//   payment_intent.succeeded         → mark paid, email everyone
//   payment_intent.payment_failed    → log failure, alert ops
//   payment_intent.canceled          → just log
//   charge.refunded                  → track refund amount
//   charge.dispute.created           → alert ops urgently
//   charge.dispute.closed            → update dispute_status
//
// Idempotency: Stripe can redeliver events on error. We dedupe on
// stripe_events.stripe_event_id — second delivery of the same event is a no-op.
//
// To register this endpoint in Stripe dashboard:
//   URL: https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/stripe-webhook
//   Events: payment_intent.*, charge.refunded, charge.dispute.*
//   Copy signing secret → `npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getStripe,
  isStripeConfigured,
  stripeApi,
  verifyStripeSignature,
} from "../_shared/stripe.ts";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Sheepdog Security LLC";
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@sheepdogtexas.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "sheepdogsecurityllc@gmail.com";
const BRAND_COLOR = (Deno.env.get("BRAND_COLOR") || "#0C0C0C").replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7) || "#0C0C0C";
const BRAND_LOGO_URL = Deno.env.get("BRAND_LOGO_URL") || "";

// Ops inbox for payment notifications
const OPS_EMAIL = "sheepdogsecurityllc@gmail.com";

function escapeHtml(str: string): string {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(n: number): string {
  return `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendEmail(to: string | string[], subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      reply_to: BRAND_REPLY_TO || undefined,
      subject,
      html,
    }),
  });
  const json = await res.json().catch(() => null);
  // Surface Resend failures in Supabase logs so silent email drops are visible.
  // We don't throw here — webhook handlers decide whether email failures are
  // retryable per-event. See each handler's call site.
  if (!res.ok) {
    console.error("Resend send failed:", { status: res.status, to, subject, body: json });
  }
  return { ok: res.ok, json };
}

function emailShell(title: string, bodyHtml: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:${BRAND_COLOR};padding:24px;border-radius:8px 8px 0 0;text-align:center;">
      ${BRAND_LOGO_URL ? `<img src="${escapeHtml(BRAND_LOGO_URL)}" alt="" style="width:40px;height:40px;border-radius:6px;margin-bottom:8px;">` : ""}
      <h1 style="color:#fff;font-size:20px;margin:0;">${escapeHtml(title)}</h1>
    </div>
    <div style="padding:24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
      ${bodyHtml}
      <p style="font-size:12px;color:#888;margin-top:24px;border-top:1px solid #eee;padding-top:16px;">Automated notification from ${escapeHtml(BRAND_NAME)}.</p>
    </div>
  </div>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!isStripeConfigured()) {
    // Not yet live; swallow the event so Stripe doesn't retry forever
    return new Response(JSON.stringify({ received: false, reason: "stripe_not_configured" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET not set — refusing unverified webhook");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();

  const verified = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!verified) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Idempotency: insert event row first. If it already exists (unique violation
  // on stripe_event_id), check whether it was successfully processed before
  // short-circuiting. This prevents a common bug: the first delivery crashes
  // mid-handler, leaving a row with processed_at=NULL; retries would otherwise
  // skip and the payment would never actually get processed.
  const { error: eventInsertErr } = await supabase.from("stripe_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
  });

  if (eventInsertErr) {
    if (eventInsertErr.code === "23505") {
      // Already seen — only skip if it was fully processed. Otherwise retry.
      const { data: existing } = await supabase
        .from("stripe_events")
        .select("processed_at")
        .eq("stripe_event_id", event.id)
        .maybeSingle();

      if (existing?.processed_at) {
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      // Fall through to retry the handler. Clear any stale error.
      await supabase.from("stripe_events").update({ error: null })
        .eq("stripe_event_id", event.id);
    } else {
      console.error("Failed to log stripe event:", eventInsertErr);
    }
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        await handlePaymentSucceeded(supabase, event);
        break;
      case "payment_intent.payment_failed":
        await handlePaymentFailed(supabase, event);
        break;
      case "payment_intent.canceled":
        await updatePaymentStatus(supabase, event.data.object.id, "canceled");
        break;
      case "charge.refunded":
        await handleChargeRefunded(supabase, event);
        break;
      case "charge.dispute.created":
        await handleDisputeCreated(supabase, event);
        break;
      case "charge.dispute.closed":
        await handleDisputeClosed(supabase, event);
        break;
      default:
        // Acknowledge but don't process
        break;
    }

    await supabase.from("stripe_events").update({ processed_at: new Date().toISOString() })
      .eq("stripe_event_id", event.id);

    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = (err as Error).message;
    console.error("Webhook handler error:", msg);
    await supabase.from("stripe_events").update({ error: msg })
      .eq("stripe_event_id", event.id);
    // Return 500 so Stripe retries
    return new Response(JSON.stringify({ received: false, error: msg }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});

// -------------------------------------------------------------------------
// Event handlers
// -------------------------------------------------------------------------

async function handlePaymentSucceeded(supabase: any, event: any) {
  const pi = event.data.object;
  const stripe = getStripe();

  // Pull the charge + balance transaction to get Stripe's actual fee
  const chargeId: string | undefined = pi.latest_charge;
  let stripeFee = 0;
  let netAmount = 0;
  let receiptUrl: string | null = null;
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardFunding: string | null = null;
  let methodType = "unknown";

  if (chargeId) {
    try {
      const charge: any = await stripeApi.charges.retrieve(stripe, chargeId, ["balance_transaction", "payment_method_details"]);
      receiptUrl = charge.receipt_url || null;
      const bt = charge.balance_transaction;
      if (bt && typeof bt === "object") {
        stripeFee = (bt.fee || 0) / 100;
        netAmount = (bt.net || 0) / 100;
      }
      const pmd = charge.payment_method_details;
      if (pmd?.card) {
        // Consistent with _shared/surcharge.ts::classifyPaymentMethod so
        // downstream reporting/filtering sees the same method values from
        // both the intent-create and webhook-update code paths.
        const funding = pmd.card.funding;
        methodType = funding === "credit"
          ? "card_credit"
          : (funding === "debit" || funding === "prepaid")
            ? "card_debit"
            : "card";
        cardBrand = pmd.card.brand || null;
        cardLast4 = pmd.card.last4 || null;
        cardFunding = pmd.card.funding || null;
      } else if (pmd?.us_bank_account) {
        methodType = "us_bank_account";
      }
    } catch (err) {
      console.error("Failed to fetch charge details:", err);
    }
  }

  const invoiceId = pi.metadata?.invoice_id;

  // Update payments row. Record how many rows matched so we can detect
  // "orphan" PIs (created outside our system — e.g., manual dashboard charges).
  const { data: updatedPayments } = await supabase.from("payments").update({
    status: "succeeded",
    stripe_charge_id: chargeId,
    stripe_fee: stripeFee || null,
    net_amount: netAmount || null,
    method: methodType,
    card_brand: cardBrand,
    card_last4: cardLast4,
    card_funding: cardFunding,
    receipt_url: receiptUrl,
    updated_at: new Date().toISOString(),
  }).eq("stripe_payment_intent_id", pi.id).select("id");

  if (!updatedPayments || updatedPayments.length === 0) {
    // Orphan PI — we didn't create this through stripe-payment-intent. Log and
    // alert ops so they can reconcile manually. Don't silently pretend we handled it.
    console.warn("Orphan PI succeeded with no matching payments row:", pi.id);
    await sendEmail(
      OPS_EMAIL,
      `⚠ Orphan payment succeeded: ${fmtMoney((pi.amount || 0) / 100)}`,
      emailShell("Orphan payment — needs reconciliation", `
        <p style="font-size:15px;color:#333;">A Stripe payment succeeded with no matching row in our <code>payments</code> table.</p>
        <p>This likely means the charge was created manually in the Stripe dashboard, or our app lost track of a PaymentIntent.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#888;">PaymentIntent</td><td><code>${escapeHtml(pi.id)}</code></td></tr>
          <tr><td style="padding:6px 0;color:#888;">Amount</td><td>${fmtMoney((pi.amount || 0) / 100)}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Charge</td><td><code>${escapeHtml(chargeId || "(none)")}</code></td></tr>
        </table>
        <p>Please reconcile in the Stripe dashboard and update the corresponding invoice manually.</p>`),
    );
    // Nothing else to do since there's no invoice linkage. Outer handler
    // will mark the event as processed.
    return;
  }

  if (invoiceId) {
    // payment_method uses a simpler set of values consistent with the manual
    // payment_method field already used by invoices (cash/check/zelle/venmo/card/ach).
    const invoicePaymentMethod = methodType === "us_bank_account" ? "ach" : "card";
    await supabase.from("invoices").update({
      status: "paid",
      payment_date: new Date().toISOString().split("T")[0],
      payment_method: invoicePaymentMethod,
      updated_at: new Date().toISOString(),
    }).eq("id", invoiceId);
  }

  // Fetch invoice + client for emails
  const { data: invoice } = invoiceId
    ? await supabase.from("invoices").select("invoice_number, total, client_id").eq("id", invoiceId).maybeSingle()
    : { data: null };
  const { data: client } = invoice?.client_id
    ? await supabase.from("clients").select("contact_name, business_name, email").eq("id", invoice.client_id).maybeSingle()
    : { data: null };

  const totalPaid = (pi.amount || 0) / 100;
  const baseAmount = parseFloat(pi.metadata?.base_amount_cents || "0") / 100;
  const surcharge = parseFloat(pi.metadata?.surcharge_cents || "0") / 100;
  const invNum = invoice?.invoice_number || pi.metadata?.invoice_number || pi.id.slice(-8);
  const clientLabel = client?.business_name || client?.contact_name || "Unknown client";

  // Ops notification
  const opsBody = `
    <p style="font-size:15px;color:#333;">A payment just cleared.</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Client</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(clientLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Invoice</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(invNum)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Invoice total</td><td style="padding:6px 0;">${fmtMoney(baseAmount)}</td></tr>
      ${surcharge > 0 ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;">Card surcharge</td><td style="padding:6px 0;">${fmtMoney(surcharge)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Total charged</td><td style="padding:6px 0;font-weight:700;">${fmtMoney(totalPaid)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Stripe fee</td><td style="padding:6px 0;color:#b00;">−${fmtMoney(stripeFee)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Net deposited</td><td style="padding:6px 0;font-weight:700;color:#0a7b3a;">${fmtMoney(netAmount)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Method</td><td style="padding:6px 0;">${escapeHtml(methodType)}${cardLast4 ? ` •••• ${cardLast4}` : ""}</td></tr>
    </table>
    ${receiptUrl ? `<p><a href="${escapeHtml(receiptUrl)}" style="color:${BRAND_COLOR};">View Stripe receipt →</a></p>` : ""}`;

  await sendEmail(OPS_EMAIL, `Payment received: ${fmtMoney(totalPaid)} from ${clientLabel}`, emailShell("Payment received", opsBody));

  // Client confirmation
  if (client?.email) {
    const clientBody = `
      <p style="font-size:15px;color:#333;">Thanks for your payment. This email confirms receipt.</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Invoice</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(invNum)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Amount paid</td><td style="padding:6px 0;font-weight:700;">${fmtMoney(totalPaid)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;font-size:13px;">Payment method</td><td style="padding:6px 0;">${methodType === "us_bank_account" ? "Bank transfer (ACH)" : `Card${cardLast4 ? ` ending in ${cardLast4}` : ""}`}</td></tr>
      </table>
      ${receiptUrl ? `<p style="margin:24px 0;text-align:center;"><a href="${escapeHtml(receiptUrl)}" style="background:${BRAND_COLOR};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">View receipt</a></p>` : ""}
      <p style="font-size:14px;color:#555;">If you have any questions, reply to this email or call us.</p>`;

    await sendEmail(client.email, `Payment confirmation — ${invNum}`, emailShell("Payment received", clientBody));
  }
}

async function handlePaymentFailed(supabase: any, event: any) {
  const pi = event.data.object;
  const failureCode = pi.last_payment_error?.code || null;
  const failureMessage = pi.last_payment_error?.message || "Payment failed";

  await supabase.from("payments").update({
    status: "failed",
    failure_code: failureCode,
    failure_message: failureMessage,
    updated_at: new Date().toISOString(),
  }).eq("stripe_payment_intent_id", pi.id);

  const invoiceId = pi.metadata?.invoice_id;
  const { data: invoice } = invoiceId
    ? await supabase.from("invoices").select("invoice_number, client_id").eq("id", invoiceId).maybeSingle()
    : { data: null };
  const { data: client } = invoice?.client_id
    ? await supabase.from("clients").select("contact_name, business_name, email").eq("id", invoice.client_id).maybeSingle()
    : { data: null };

  const clientLabel = client?.business_name || client?.contact_name || "Unknown";
  const invNum = invoice?.invoice_number || pi.metadata?.invoice_number || pi.id.slice(-8);
  const amount = (pi.amount || 0) / 100;

  const body = `
    <p style="font-size:15px;color:#b00;"><strong>A payment attempt failed.</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Client</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(clientLabel)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Invoice</td><td style="padding:6px 0;">${escapeHtml(invNum)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Amount</td><td style="padding:6px 0;">${fmtMoney(amount)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Reason</td><td style="padding:6px 0;">${escapeHtml(failureMessage)}</td></tr>
      ${failureCode ? `<tr><td style="padding:6px 0;color:#888;font-size:13px;">Code</td><td style="padding:6px 0;"><code>${escapeHtml(failureCode)}</code></td></tr>` : ""}
    </table>
    <p style="font-size:14px;color:#555;">The client may retry from the same payment link. Consider following up if this is a recurring failure.</p>`;

  await sendEmail(OPS_EMAIL, `Payment FAILED: ${fmtMoney(amount)} from ${clientLabel}`, emailShell("Payment failed", body));
}

async function updatePaymentStatus(supabase: any, paymentIntentId: string, status: string) {
  await supabase.from("payments").update({
    status,
    updated_at: new Date().toISOString(),
  }).eq("stripe_payment_intent_id", paymentIntentId);
}

async function handleChargeRefunded(supabase: any, event: any) {
  const charge = event.data.object;
  const refundedAmount = (charge.amount_refunded || 0) / 100;
  const totalAmount = (charge.amount || 0) / 100;
  const isFullRefund = charge.amount_refunded >= charge.amount;

  await supabase.from("payments").update({
    refunded_amount: refundedAmount,
    updated_at: new Date().toISOString(),
  }).eq("stripe_charge_id", charge.id);

  // On a FULL refund, revert the linked invoice from 'paid' back to 'refunded'
  // so AR views surface it as needing attention. Partial refunds leave the
  // invoice as paid (the receivable was met; the partial is a write-off).
  let invoiceLabel = "";
  if (isFullRefund) {
    const { data: payment } = await supabase
      .from("payments")
      .select("invoice_id, invoices(invoice_number)")
      .eq("stripe_charge_id", charge.id)
      .maybeSingle();

    if (payment?.invoice_id) {
      await supabase.from("invoices").update({
        status: "refunded",
        payment_date: null,
        updated_at: new Date().toISOString(),
      }).eq("id", payment.invoice_id);
      invoiceLabel = (payment as any)?.invoices?.invoice_number || "";
    }
  }

  const body = `
    <p>A refund was issued on charge <code>${escapeHtml(charge.id)}</code>.</p>
    <p><strong>Refunded:</strong> ${fmtMoney(refundedAmount)} of ${fmtMoney(totalAmount)} ${isFullRefund ? "(FULL REFUND)" : "(partial)"}</p>
    ${invoiceLabel ? `<p>Invoice <strong>${escapeHtml(invoiceLabel)}</strong> has been reverted to <em>refunded</em> status.</p>` : ""}`;
  await sendEmail(OPS_EMAIL, `Refund issued: ${fmtMoney(refundedAmount)}${isFullRefund ? " (full)" : ""}`, emailShell("Refund issued", body));
}

async function handleDisputeCreated(supabase: any, event: any) {
  const dispute = event.data.object;
  const chargeId = dispute.charge;

  // Flag both the payment AND the linked invoice. Dashboards filtering by
  // invoices.status='paid' shouldn't see disputed revenue as cleanly settled.
  const { data: payment } = await supabase.from("payments")
    .update({
      dispute_status: dispute.status,
      status: "disputed",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_charge_id", chargeId)
    .select("invoice_id")
    .maybeSingle();

  if (payment?.invoice_id) {
    await supabase.from("invoices").update({
      status: "disputed",
      updated_at: new Date().toISOString(),
    }).eq("id", payment.invoice_id);
  }

  const body = `
    <p style="color:#b00;font-size:16px;"><strong>⚠ A dispute was filed. ACTION REQUIRED.</strong></p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Amount</td><td style="padding:6px 0;font-weight:700;">${fmtMoney((dispute.amount || 0) / 100)}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Reason</td><td style="padding:6px 0;">${escapeHtml(dispute.reason || "unknown")}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Status</td><td style="padding:6px 0;">${escapeHtml(dispute.status || "")}</td></tr>
      <tr><td style="padding:6px 0;color:#888;font-size:13px;">Evidence due</td><td style="padding:6px 0;">${dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toLocaleDateString() : "see Stripe"}</td></tr>
    </table>
    <p><a href="https://dashboard.stripe.com/disputes/${escapeHtml(dispute.id)}" style="background:#b00;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Respond in Stripe →</a></p>`;

  await sendEmail(OPS_EMAIL, `🚨 DISPUTE FILED: ${fmtMoney((dispute.amount || 0) / 100)}`, emailShell("Dispute filed", body));
}

async function handleDisputeClosed(supabase: any, event: any) {
  const dispute = event.data.object;
  await supabase.from("payments").update({
    dispute_status: dispute.status,
    updated_at: new Date().toISOString(),
  }).eq("stripe_charge_id", dispute.charge);

  const body = `<p>Dispute closed with status: <strong>${escapeHtml(dispute.status)}</strong> on charge <code>${escapeHtml(dispute.charge)}</code>.</p>`;
  await sendEmail(OPS_EMAIL, `Dispute closed: ${dispute.status}`, emailShell("Dispute closed", body));
}
