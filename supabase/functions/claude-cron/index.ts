import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-20250514";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Sheepdog Security LLC";
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@sheepdogtexas.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "";
const BRAND_COLOR = (Deno.env.get("BRAND_COLOR") || "#0C0C0C").replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7) || "#0C0C0C";

const TEAM_EMAILS = [
  "benschultz519@gmail.com",
  "Joshk1288@gmail.com",
  "sheepdogsecurityllc@gmail.com",
];

const MAX_DEAL_ALERTS_PER_DAY = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function daysSince(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function daysUntil(dateStr: string): number {
  const now = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtMoney(val: number): string {
  return "$" + Number(val || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Pick variant based on day of week
function getDayVariant(): "a" | "b" | "c" {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ...
  if (day === 1) return "b"; // Monday
  if (day === 4 || day === 5) return "c"; // Thu/Fri
  return "a"; // Default
}

// Pick variant deterministically from a deal/invoice ID
function getHashVariant(id: string, count: number): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % count;
}

async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Claude API error:", res.status, err);
    throw new Error(`Claude API returned ${res.status}`);
  }

  const body = await res.json();
  return body.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") || "";
}

async function sendEmail(to: string[], subject: string, html: string, replyTo?: string): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
      to,
      reply_to: replyTo || BRAND_REPLY_TO || undefined,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    console.error("Resend error:", JSON.stringify(err));
    return false;
  }
  return true;
}

function wrapEmailHtml(content: string, footer?: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;">
  <div style="background:${escapeHtml(BRAND_COLOR)};padding:24px 32px;">
    <h1 style="margin:0;color:#fff;font-size:20px;">${escapeHtml(BRAND_NAME)}</h1>
  </div>
  <div style="padding:32px;">
    ${content}
  </div>
  <div style="padding:16px 32px;background:#f8f8f8;text-align:center;font-size:12px;color:#888;">
    ${footer || "Sheepdog Security LLC - Bryan-College Station, TX"}
  </div>
</div></body></html>`;
}

// Convert plain text template to HTML paragraphs
function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      return `<p style="margin:0 0 8px;color:#333;line-height:1.6;">${escapeHtml(trimmed)}</p>`;
    })
    .filter(Boolean)
    .join("\n    ");
}

// Build the phone line - prominent styling
function phoneBlock(phone: string | null): string {
  if (!phone) {
    return `<p style="margin:12px 0;padding:12px;background:#fff3cd;border-radius:4px;color:#856404;">No phone on file - check the CRM and update the contact.</p>`;
  }
  return `<p style="margin:12px 0;padding:12px;background:#f8f9fa;border-radius:4px;font-size:18px;font-weight:bold;color:#333;text-align:center;">${escapeHtml(phone)}</p>`;
}

// Pipeline button
function pipelineButton(): string {
  return `<a href="https://app.sheepdogtexas.com/pipeline" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${escapeHtml(BRAND_COLOR)};color:#fff;text-decoration:none;border-radius:4px;">Open Pipeline</a>`;
}

async function queueEmail(
  supabase: ReturnType<typeof createClient>,
  triggerType: string,
  triggerId: string | null,
  recipientEmail: string,
  recipientType: string,
  subject: string,
  htmlBody: string
): Promise<boolean> {
  // Idempotency: check if we already sent this trigger+id+recipient today
  const today = new Date().toISOString().slice(0, 10);

  if (triggerId) {
    const { data: existingWithId } = await supabase
      .from("smart_emails")
      .select("id")
      .eq("trigger_type", triggerType)
      .eq("trigger_id", triggerId)
      .eq("recipient_email", recipientEmail)
      .gte("created_at", today + "T00:00:00Z")
      .limit(1);
    if (existingWithId && existingWithId.length > 0) return false;
  } else {
    const { data: existing } = await supabase
      .from("smart_emails")
      .select("id")
      .eq("trigger_type", triggerType)
      .eq("recipient_email", recipientEmail)
      .gte("created_at", today + "T00:00:00Z")
      .limit(1);
    if (existing && existing.length > 0) return false;
  }

  // Insert into queue
  const { data: row, error: insertErr } = await supabase
    .from("smart_emails")
    .insert({
      trigger_type: triggerType,
      trigger_id: triggerId,
      recipient_email: recipientEmail,
      recipient_type: recipientType,
      subject,
      html_body: htmlBody,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertErr) {
    console.error("Failed to queue email:", insertErr.message);
    return false;
  }

  // Send immediately
  const sent = await sendEmail([recipientEmail], subject, htmlBody,
    recipientType === "client" || recipientType === "staff" ? "sheepdogsecurityllc@gmail.com" : undefined);

  // Update status
  await supabase
    .from("smart_emails")
    .update({
      status: sent ? "sent" : "failed",
      sent_at: sent ? new Date().toISOString() : null,
      error_message: sent ? null : "Resend delivery failed",
    })
    .eq("id", row.id);

  return sent;
}

// ---------------------------------------------------------------------------
// STALE DEAL TEMPLATES
// ---------------------------------------------------------------------------

interface DealData {
  id: string;
  contact_name: string | null;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  stage: string | null;
  value: number | null;
  service_line: string | null;
  days: number;
  notes: string | null;
}

function dealNotes(notes: string | null): string {
  return notes || "No notes on file.";
}

function staleDeal7d(d: DealData): { subject: string; body: string } {
  const variant = getDayVariant();
  const name = d.contact_name || "Contact";
  const biz = d.business_name || "Unknown";
  const val = fmtMoney(d.value || 0);

  if (variant === "b") {
    // Monday variant
    return {
      subject: `Start the week - ${biz} needs a follow-up`,
      body: `${name} at ${biz} hasn't heard from us in ${d.days} days. That's a full week.

${d.service_line || "N/A"} | ${d.stage || "N/A"} | ${val}

Their number:
${d.phone || "No phone on file"}

Notes: ${dealNotes(d.notes)}

Good week to close this. Pick up the phone.`,
    };
  }

  if (variant === "c") {
    // Thu/Fri variant
    return {
      subject: `Don't let ${biz} sit over the weekend`,
      body: `${name} at ${biz} - ${d.days} days with no touch.

${d.service_line || "N/A"} deal worth ${val}, stuck in ${d.stage || "N/A"}.

Call before the weekend:
${d.phone || "No phone on file"}

Notes: ${dealNotes(d.notes)}

People forget over weekends. Call today or lose Monday catching up.`,
    };
  }

  // Default weekday variant
  return {
    subject: `${name} - ${d.days} days, no movement`,
    body: `Quick flag on this one.

${name} at ${biz} has been sitting in ${d.stage || "N/A"} for ${d.days} days. ${d.service_line || "N/A"} deal, ${val}.

Give them a call:
${d.phone || "No phone on file"}

Last notes: ${dealNotes(d.notes)}

A 2-minute phone call keeps this from going cold.`,
  };
}

function staleDeal10d(d: DealData): { subject: string; body: string } {
  const name = d.contact_name || "Contact";
  const biz = d.business_name || "Unknown";
  const val = fmtMoney(d.value || 0);
  const idx = getHashVariant(d.id, 2);

  if (idx === 1) {
    return {
      subject: `${d.days} days - someone else is calling ${name}`,
      body: `If we're not talking to ${name}, someone else might be.

${biz} | ${d.service_line || "N/A"} | ${val}
Stage: ${d.stage || "N/A"} | Stale: ${d.days} days

Pick up the phone:
${d.phone || "No phone on file"}

Notes: ${dealNotes(d.notes)}

BCS isn't that big. If they need ${d.service_line || "security"}, they're shopping.`,
    };
  }

  return {
    subject: `${biz} is going cold - ${d.days} days`,
    body: `This deal is cooling off.

${name} at ${biz} - ${d.days} days in ${d.stage || "N/A"} with zero activity. ${d.service_line || "N/A"}, ${val}.

Call now:
${d.phone || "No phone on file"}

Notes: ${dealNotes(d.notes)}

Every day without contact makes the next call harder. Don't wait until it's awkward.`,
  };
}

function staleDeal14d(d: DealData): { subject: string; body: string } {
  const name = d.contact_name || "Contact";
  const biz = d.business_name || "Unknown";
  const val = fmtMoney(d.value || 0);
  const variant = getDayVariant();

  if (variant === "b") {
    // Mid-week "The Math"
    return {
      subject: `${val} is walking out the door - ${biz}`,
      body: `Let's do the math.

${val} in ${d.service_line || "N/A"} revenue. ${d.days} days without a single touchpoint. ${name} at ${biz} is not going to wait forever.

${d.phone || "No phone on file"}

Stage: ${d.stage || "N/A"}
Notes: ${dealNotes(d.notes)}

Either make contact today or move this to lost. We need an honest pipeline, not a wishful one.`,
    };
  }

  if (variant === "c") {
    // Late week "Final Flag"
    return {
      subject: `Last alert before ${biz} gets marked lost`,
      body: `This is the last automated flag on this deal.

${name} | ${biz}
${d.service_line || "N/A"} | ${val} | ${d.stage || "N/A"}
Stale: ${d.days} days

${d.phone || "No phone on file"} | ${d.email || "No email on file"}

Notes: ${dealNotes(d.notes)}

If there's no activity by end of week, this deal moves to lost automatically. If it's still alive, prove it. Make the call.`,
    };
  }

  // Default "Close it or kill it"
  return {
    subject: `${biz} - close it or kill it`,
    body: `${d.days} days. No calls, no emails, no movement.

${name} at ${biz} is done waiting for us. ${d.service_line || "N/A"} deal worth ${val}, stuck in ${d.stage || "N/A"}.

Call right now:
${d.phone || "No phone on file"}

Notes: ${dealNotes(d.notes)}

Two options: call them today and re-engage, or mark this deal lost. Dead weight in the pipeline helps nobody.`,
  };
}

function staleDeal21d(d: DealData): { subject: string; body: string } {
  const name = d.contact_name || "Contact";
  const biz = d.business_name || "Unknown";
  const val = fmtMoney(d.value || 0);

  return {
    subject: `${biz} - moving to lost in 48 hours`,
    body: `${name} at ${biz} - ${d.days} days with no activity.

${d.service_line || "N/A"} | ${val} | ${d.stage || "N/A"}

This deal will be automatically marked as lost in 48 hours unless someone logs activity.

${d.phone || "No phone on file"} | ${d.email || "No email on file"}

If this deal is still real, call them now and log it. If it's dead, let it go. Clean pipeline, clear head.`,
  };
}

// ---------------------------------------------------------------------------
// INVOICE TEMPLATES
// ---------------------------------------------------------------------------

interface InvoiceData {
  clientName: string;
  businessName: string | null;
  invoiceNumber: string;
  total: string;
  dueDate: string;
  overdueDays: number;
}

function invoiceOverdue3d(inv: InvoiceData): { subject: string; body: string } {
  const idx = getHashVariant(inv.invoiceNumber, 2);

  if (idx === 1) {
    return {
      subject: `Invoice #${inv.invoiceNumber} - past due`,
      body: `${inv.clientName},

Invoice #${inv.invoiceNumber} for ${inv.total} was due ${inv.dueDate} and is currently outstanding.

If this has already been handled, no action needed. Otherwise, we'd appreciate payment at your earliest convenience.

Questions? Call us at (979) 204-0945.

Sheepdog Security LLC
Bryan-College Station, TX`,
    };
  }

  return {
    subject: `Payment Reminder - Invoice #${inv.invoiceNumber}`,
    body: `${inv.clientName},

Quick reminder that Invoice #${inv.invoiceNumber} for ${inv.total} was due on ${inv.dueDate}.

If payment is already on the way, disregard this. If there's an issue with the invoice, call us at (979) 204-0945 and we'll sort it out.

We appreciate your business.

Sheepdog Security LLC
Bryan-College Station, TX`,
  };
}

function invoiceOverdue7d(inv: InvoiceData): { subject: string; body: string } {
  const idx = getHashVariant(inv.invoiceNumber, 2);

  if (idx === 1) {
    return {
      subject: `Second Notice - Invoice #${inv.invoiceNumber} | ${inv.total} outstanding`,
      body: `${inv.clientName},

This is a second notice regarding Invoice #${inv.invoiceNumber} for ${inv.total}, which was due on ${inv.dueDate}.

Our records show this invoice remains unpaid. Please remit payment or contact us to discuss.

(979) 204-0945

We value the relationship with ${inv.businessName || "your team"} and want to get this resolved.

Sheepdog Security LLC
Bryan-College Station, TX`,
    };
  }

  return {
    subject: `Following Up - Invoice #${inv.invoiceNumber} (7 days overdue)`,
    body: `${inv.clientName},

Following up on Invoice #${inv.invoiceNumber} for ${inv.total}, originally due ${inv.dueDate}. We haven't received payment yet.

If there's an issue or question about the invoice, we want to hear about it. Call us at (979) 204-0945.

If this is simply an oversight, we'd appreciate getting it squared away this week.

Sheepdog Security LLC
Bryan-College Station, TX`,
  };
}

function invoiceOverdue14d(inv: InvoiceData): { subject: string; body: string } {
  return {
    subject: `Immediate Attention - Invoice #${inv.invoiceNumber} is 14 days overdue`,
    body: `${inv.clientName},

Invoice #${inv.invoiceNumber} for ${inv.total} is now 14 days past the original due date of ${inv.dueDate}. This requires your immediate attention.

We've sent prior reminders and have not received payment or a response. Please contact us directly to resolve this.

(979) 204-0945

A member of our team will also be reaching out.

Sheepdog Security LLC
Bryan-College Station, TX`,
  };
}

function invoiceOverdue30d(inv: InvoiceData): { subject: string; body: string } {
  return {
    subject: `Final Notice - Invoice #${inv.invoiceNumber} | 30 days overdue`,
    body: `${inv.clientName},

This is our final automated reminder regarding Invoice #${inv.invoiceNumber} for ${inv.total}, originally due ${inv.dueDate}.

This invoice is now 30 days overdue. A member of our team will be contacting you directly to discuss resolution.

If you have questions in the meantime, call us at (979) 204-0945.

Sheepdog Security LLC
Bryan-College Station, TX`,
  };
}

// ---------------------------------------------------------------------------
// SHIFT NOTIFICATION TEMPLATES
// ---------------------------------------------------------------------------

interface ShiftData {
  staffName: string;
  eventTitle: string;
  venueName: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  role: string;
  notes: string | null;
}

function shiftTomorrow(s: ShiftData): { subject: string; body: string } {
  const venue = s.venueName || "TBD";
  const time = s.startTime
    ? `${s.startTime}${s.endTime ? ` - ${s.endTime}` : ""}`
    : "TBD";
  const notes = s.notes ? `\n${s.notes}` : "";

  return {
    subject: `Tomorrow: ${s.eventTitle} at ${venue}`,
    body: `${s.staffName},

You're on tomorrow. Here's your info.

WHERE: ${venue}
WHEN: ${s.date}
TIME: ${time}
ROLE: ${s.role}
${notes}
Show up on time, in uniform, ready to work. If you cannot make this shift, contact us NOW. Not tomorrow morning. Now.

Sheepdog Security LLC`,
  };
}

// ---------------------------------------------------------------------------
// Trigger handlers
// ---------------------------------------------------------------------------

async function checkStaleDeals(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data: deals } = await supabase
    .from("pipeline")
    .select("id, contact_name, business_name, phone, email, stage, value, service_line, last_activity, notes")
    .not("stage", "in", '("lost","under_contract")');

  if (!deals || deals.length === 0) return 0;

  // Anti-spam: cap deal alerts per day
  const today = new Date().toISOString().slice(0, 10);
  const { data: todayAlerts } = await supabase
    .from("smart_emails")
    .select("id")
    .like("trigger_type", "deal_stale_%")
    .eq("recipient_email", TEAM_EMAILS[0])
    .gte("created_at", today + "T00:00:00Z");

  const alertsSentToday = todayAlerts?.length || 0;
  if (alertsSentToday >= MAX_DEAL_ALERTS_PER_DAY) {
    console.log(`claude-cron: Deal alert cap reached (${alertsSentToday}/${MAX_DEAL_ALERTS_PER_DAY}). Skipping.`);
    return 0;
  }

  // Sort by stalest first so the most urgent deals get the limited slots
  const staleDealsSorted = deals
    .map((deal) => ({
      ...deal,
      days: deal.last_activity ? daysSince(deal.last_activity) : 30,
    }))
    .filter((d) => d.days >= 7)
    .sort((a, b) => b.days - a.days);

  let sent = 0;
  const remaining = MAX_DEAL_ALERTS_PER_DAY - alertsSentToday;

  for (const deal of staleDealsSorted) {
    if (sent >= remaining) break;

    const d: DealData = {
      id: deal.id,
      contact_name: deal.contact_name,
      business_name: deal.business_name,
      phone: deal.phone,
      email: deal.email,
      stage: deal.stage,
      value: deal.value,
      service_line: deal.service_line,
      days: deal.days,
      notes: deal.notes,
    };

    let template: { subject: string; body: string };
    let triggerType: string;

    if (d.days >= 21) {
      template = staleDeal21d(d);
      triggerType = "deal_stale_21d";
    } else if (d.days >= 14) {
      template = staleDeal14d(d);
      triggerType = "deal_stale_14d";
    } else if (d.days >= 10) {
      template = staleDeal10d(d);
      triggerType = "deal_stale_10d";
    } else {
      template = staleDeal7d(d);
      triggerType = "deal_stale_7d";
    }

    const html = wrapEmailHtml(
      textToHtml(template.body) + phoneBlock(d.phone) + pipelineButton()
    );

    let dealSent = false;
    for (const email of TEAM_EMAILS) {
      const queued = await queueEmail(supabase, triggerType, deal.id, email, "team", template.subject, html);
      if (queued && !dealSent) {
        dealSent = true;
        sent++;
      }
    }

    // Auto-close: mark deals 23+ days stale as lost
    if (d.days >= 23) {
      await supabase
        .from("pipeline")
        .update({ stage: "lost", updated_at: new Date().toISOString() })
        .eq("id", deal.id);
      console.log(`claude-cron: Auto-closed deal ${deal.id} (${d.days} days stale)`);
    }
  }
  return sent;
}

async function checkOverdueInvoices(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_number, total, status, due_date, payment_date")
    .in("status", ["sent", "overdue"]);

  if (!invoices || invoices.length === 0) return 0;

  // Get client info
  const clientIds = [...new Set(invoices.map((i) => i.client_id).filter(Boolean))];
  const { data: clients } = clientIds.length > 0
    ? await supabase.from("clients").select("id, contact_name, business_name, email").in("id", clientIds)
    : { data: [] };
  const clientMap = new Map((clients || []).map((c) => [c.id, c]));

  let sent = 0;
  for (const inv of invoices) {
    if (!inv.due_date) continue;
    const overdueDays = -daysUntil(inv.due_date);
    if (overdueDays < 3) continue;

    // Anti-spam: skip if payment logged in last 24h
    if (inv.payment_date && daysSince(inv.payment_date) < 1) continue;

    const client = clientMap.get(inv.client_id);
    if (!client?.email) {
      console.log(`claude-cron: Invoice ${inv.invoice_number} overdue but client has no email. Skipping.`);
      continue;
    }

    const invData: InvoiceData = {
      clientName: client.contact_name || client.business_name || "Client",
      businessName: client.business_name,
      invoiceNumber: inv.invoice_number || "N/A",
      total: "$" + Number(inv.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }),
      dueDate: inv.due_date,
      overdueDays,
    };

    let template: { subject: string; body: string };
    let triggerType: string;

    if (overdueDays >= 30) {
      template = invoiceOverdue30d(invData);
      triggerType = "invoice_overdue_30d";
    } else if (overdueDays >= 14) {
      template = invoiceOverdue14d(invData);
      triggerType = "invoice_overdue_14d";

      // Also alert the team for 14d+ overdue
      const teamSubject = `TEAM: Invoice #${inv.invoice_number} is ${overdueDays} days overdue - ${invData.clientName}`;
      const teamHtml = wrapEmailHtml(
        `<p style="margin:0 0 8px;color:#333;line-height:1.6;"><strong>Invoice #${escapeHtml(inv.invoice_number || "")}</strong> for <strong>${escapeHtml(invData.total)}</strong> from ${escapeHtml(invData.clientName)} is ${overdueDays} days overdue.</p>
        <p style="margin:0 0 8px;color:#333;">Due date: ${escapeHtml(inv.due_date)}</p>
        <p style="margin:0 0 8px;color:#d32f2f;font-weight:bold;">Someone needs to call this client today.</p>
        <a href="https://app.sheepdogtexas.com/financials" style="display:inline-block;margin-top:16px;padding:10px 20px;background:${escapeHtml(BRAND_COLOR)};color:#fff;text-decoration:none;border-radius:4px;">Open Financials</a>`
      );
      for (const teamEmail of TEAM_EMAILS) {
        await queueEmail(supabase, triggerType + "_team", inv.id, teamEmail, "team", teamSubject, teamHtml);
      }
    } else if (overdueDays >= 7) {
      template = invoiceOverdue7d(invData);
      triggerType = "invoice_overdue_7d";
    } else {
      template = invoiceOverdue3d(invData);
      triggerType = "invoice_overdue_3d";
    }

    const html = wrapEmailHtml(textToHtml(template.body));
    const queued = await queueEmail(supabase, triggerType, inv.id, client.email, "client", template.subject, html);
    if (queued) sent++;
  }
  return sent;
}

async function checkTomorrowEvents(supabase: ReturnType<typeof createClient>): Promise<number> {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const { data: events } = await supabase
    .from("events")
    .select("id, title, venue_name, date, start_time, end_time, staff_assigned, client_id, notes")
    .eq("date", tomorrowStr)
    .neq("status", "cancelled");

  if (!events || events.length === 0) return 0;

  // Get staff emails
  const allStaffIds = new Set<string>();
  for (const ev of events) {
    for (const s of ev.staff_assigned || []) {
      if (s.staff_id) allStaffIds.add(s.staff_id);
    }
  }

  const { data: staffList } = allStaffIds.size > 0
    ? await supabase.from("staff").select("id, name, email").in("id", [...allStaffIds])
    : { data: [] };
  const staffMap = new Map((staffList || []).map((s) => [s.id, s]));

  let sent = 0;
  for (const ev of events) {
    for (const assigned of ev.staff_assigned || []) {
      const staff = staffMap.get(assigned.staff_id);
      if (!staff?.email) continue;

      const shiftData: ShiftData = {
        staffName: staff.name,
        eventTitle: ev.title || "Event",
        venueName: ev.venue_name,
        date: ev.date,
        startTime: ev.start_time,
        endTime: ev.end_time,
        role: assigned.role || "Guard",
        notes: ev.notes,
      };

      const template = shiftTomorrow(shiftData);
      const html = wrapEmailHtml(textToHtml(template.body));
      const queued = await queueEmail(supabase, "event_tomorrow", ev.id, staff.email, "staff", template.subject, html);
      if (queued) sent++;
    }
  }
  return sent;
}

async function checkWeeklyBriefing(supabase: ReturnType<typeof createClient>): Promise<number> {
  // Only send on Mondays
  const now = new Date();
  if (now.getDay() !== 1) return 0;

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: pipeline },
    { data: clients },
    { data: invoices },
    { data: events },
    { data: staff },
    { data: submissions },
  ] = await Promise.all([
    supabase.from("pipeline").select("stage, value, last_activity, contact_name, business_name"),
    supabase.from("clients").select("id, status"),
    supabase.from("invoices").select("id, total, status, due_date, payment_date"),
    supabase.from("events").select("id, title, date, status, staff_needed, staff_assigned, invoice_id"),
    supabase.from("staff").select("id, status"),
    supabase.from("contact_submissions").select("id").gte("created_at", weekAgo),
  ]);

  const activeDeals = (pipeline || []).filter((d) => d.stage !== "lost");
  const pipelineValue = activeDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const overdueInvoices = (invoices || []).filter((i) => i.status === "overdue" || (i.status === "sent" && i.due_date && daysUntil(i.due_date) < 0));
  const paidThisWeek = (invoices || []).filter((i) => i.status === "paid" && i.payment_date && daysSince(i.payment_date) <= 7);
  const revenueThisWeek = paidThisWeek.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

  const summaryData = `
Pipeline: ${activeDeals.length} active deals worth $${pipelineValue.toLocaleString()}
New submissions this week: ${(submissions || []).length}
Active clients: ${(clients || []).filter((c) => c.status === "active").length}
Active staff: ${(staff || []).filter((s) => s.status === "active").length}
Revenue collected this week: $${revenueThisWeek.toLocaleString()}
Overdue invoices: ${overdueInvoices.length} totaling $${overdueInvoices.reduce((s, i) => s + (Number(i.total) || 0), 0).toLocaleString()}
Stale deals (14+ days): ${activeDeals.filter((d) => d.last_activity && daysSince(d.last_activity) > 14).length}
  `.trim();

  try {
    const briefing = await callClaude(
      `You are Sheepdog Security's AI assistant writing a weekly business briefing email. Be concise, use bullet points, and highlight 2-3 top priorities for the week. Use dollar amounts and specific numbers. Keep it to 150 words max. No em dashes. Texas-friendly, direct tone.`,
      `Generate the weekly briefing for Monday, ${now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.\n\n${summaryData}`
    );

    const subject = `Weekly Briefing - ${now.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    const html = wrapEmailHtml(`
      <h2 style="margin:0 0 16px;color:#333;">Weekly Business Briefing</h2>
      <div style="color:#555;line-height:1.8;white-space:pre-wrap;">${escapeHtml(briefing)}</div>
      <a href="https://app.sheepdogtexas.com/" style="display:inline-block;margin-top:20px;padding:10px 20px;background:${escapeHtml(BRAND_COLOR)};color:#fff;text-decoration:none;border-radius:4px;">Open Dashboard</a>
    `);

    let sent = 0;
    for (const email of TEAM_EMAILS) {
      const queued = await queueEmail(supabase, "weekly_briefing", null, email, "team", subject, html);
      if (queued) sent++;
    }
    return sent;
  } catch (e) {
    console.error("Failed to generate weekly briefing:", e);
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const supabase = getSupabase();

    console.log("claude-cron: Starting trigger checks...");

    const results = {
      stale_deals: 0,
      overdue_invoices: 0,
      tomorrow_events: 0,
      weekly_briefing: 0,
    };

    // Run all checks
    results.stale_deals = await checkStaleDeals(supabase);
    results.overdue_invoices = await checkOverdueInvoices(supabase);
    results.tomorrow_events = await checkTomorrowEvents(supabase);
    results.weekly_briefing = await checkWeeklyBriefing(supabase);

    const totalSent = Object.values(results).reduce((a, b) => a + b, 0);
    console.log(`claude-cron: Complete. ${totalSent} emails sent.`, results);

    return new Response(
      JSON.stringify({ success: true, sent: totalSent, details: results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("claude-cron error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
