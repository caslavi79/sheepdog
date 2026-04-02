import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Company";
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@example.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "";
const BRAND_COLOR = (Deno.env.get("BRAND_COLOR") || "#0C0C0C").replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7) || "#0C0C0C";

const NOTIFY_EMAILS = [
  "benschultz519@gmail.com",
  "Joshk1288@gmail.com",
  "sheepdogsecurityllc@gmail.com",
];

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysBetween(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const [y, m, d] = dateStr.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  return Math.ceil((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all sent invoices with due dates
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, client_id, total, due_date, status")
      .eq("status", "sent")
      .not("due_date", "is", null);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    // Get client emails
    const clientIds = [...new Set((invoices || []).map(i => i.client_id).filter(Boolean))];
    const { data: clients } = await supabase
      .from("clients")
      .select("id, contact_name, business_name, email")
      .in("id", clientIds.length > 0 ? clientIds : ["00000000-0000-0000-0000-000000000000"]);

    const clientMap = Object.fromEntries((clients || []).map(c => [c.id, c]));

    const reminders: { invoice: any; client: any; daysOverdue: number; urgency: string }[] = [];

    for (const inv of invoices || []) {
      if (!inv.due_date) continue;
      const daysOverdue = daysBetween(inv.due_date);
      // Send reminders at 7 days overdue and 14 days overdue
      if (daysOverdue === 7 || daysOverdue === 14) {
        const client = clientMap[inv.client_id];
        if (client?.email) {
          reminders.push({
            invoice: inv,
            client,
            daysOverdue,
            urgency: daysOverdue >= 14 ? "final" : "first",
          });
        }
      }
    }

    if (reminders.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No reminders to send today" }), { status: 200 });
    }

    let sent = 0;

    for (const { invoice, client, daysOverdue, urgency } of reminders) {
      const clientName = escapeHtml(client.business_name || client.contact_name || "");
      const title = invoice.invoice_number || "Invoice";
      const urgencyColor = urgency === "final" ? "#D4483A" : "#C9922E";
      const urgencyLabel = urgency === "final" ? "FINAL REMINDER" : "PAYMENT REMINDER";

      const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:${BRAND_COLOR};padding:24px;border-radius:8px 8px 0 0;text-align:center;">
          <h1 style="color:#fff;font-size:18px;margin:0;">${urgencyLabel}</h1>
        </div>
        <div style="border-top:3px solid ${urgencyColor};padding:24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
          <p style="font-size:15px;color:#333;">Hi ${clientName},</p>
          <p style="font-size:14px;color:#555;margin:12px 0;">This is a ${urgency === "final" ? "final" : "friendly"} reminder that invoice <strong>${escapeHtml(title)}</strong> for <strong>${fmtMoney(Number(invoice.total || 0))}</strong> was due <strong>${daysOverdue} days ago</strong>.</p>
          <div style="background:#f8f8f8;padding:16px;border-radius:6px;margin:16px 0;">
            <div style="font-size:13px;color:#888;margin-bottom:4px;">Invoice: ${escapeHtml(title)}</div>
            <div style="font-size:13px;color:#888;margin-bottom:4px;">Due Date: ${invoice.due_date}</div>
            <div style="font-size:18px;font-weight:700;color:${urgencyColor};">Amount Due: ${fmtMoney(Number(invoice.total || 0))}</div>
          </div>
          <p style="font-size:14px;color:#555;">Please arrange payment at your earliest convenience. If you've already paid, please disregard this notice.</p>
          <p style="font-size:13px;color:#888;margin-top:24px;">— ${escapeHtml(BRAND_NAME)}</p>
        </div>
      </div>`;

      // Email to client
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
          to: [client.email],
          reply_to: BRAND_REPLY_TO || undefined,
          subject: `${urgencyLabel}: ${title} — ${fmtMoney(Number(invoice.total || 0))} overdue`,
          html: emailHtml,
        }),
      });

      // Notify team
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${BRAND_NAME} Billing <${BRAND_FROM_EMAIL}>`,
          to: NOTIFY_EMAILS,
          subject: `Payment reminder sent: ${title} — ${clientName} (${daysOverdue}d overdue)`,
          html: `<p>Payment reminder sent to <strong>${escapeHtml(client.email)}</strong> for invoice ${escapeHtml(title)} (${fmtMoney(Number(invoice.total || 0))}, ${daysOverdue} days overdue).</p>`,
        }),
      });

      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent, reminders: reminders.length }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
  }
});
