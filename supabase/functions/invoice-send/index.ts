import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Company";
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@example.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "";
const BRAND_COLOR = (Deno.env.get("BRAND_COLOR") || "#0C0C0C").replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7) || "#0C0C0C";
const BRAND_LOGO_URL = Deno.env.get("BRAND_LOGO_URL") || "";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { invoice_id, recipient_email } = await req.json();

    if (!invoice_id) {
      return new Response(JSON.stringify({ success: false, error: "invoice_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch invoice with client info
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .single();

    if (invErr || !invoice) {
      return new Response(JSON.stringify({ success: false, error: "Invoice not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client email
    let toEmail = recipient_email;
    if (!toEmail && invoice.client_id) {
      const { data: client } = await supabase
        .from("clients")
        .select("email, contact_name, business_name")
        .eq("id", invoice.client_id)
        .single();
      toEmail = client?.email;
    }

    if (!toEmail) {
      return new Response(JSON.stringify({ success: false, error: "No recipient email. Set client email or provide recipient_email." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build line items table
    const items = (invoice.line_items || []).filter((li: any) => li.description);
    const lineItemsHtml = items.length > 0
      ? `<table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <thead><tr>
            <th style="text-align:left;padding:8px;border-bottom:2px solid #eee;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Description</th>
            <th style="padding:8px;border-bottom:2px solid #eee;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Hours</th>
            <th style="padding:8px;border-bottom:2px solid #eee;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Rate</th>
            <th style="text-align:right;padding:8px;border-bottom:2px solid #eee;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;">Total</th>
          </tr></thead>
          <tbody>${items.map((li: any) => `<tr>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:14px;">${escapeHtml(li.description)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${li.hours || ""}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:14px;text-align:center;">${fmtMoney(Number(li.rate || 0))}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;font-size:14px;text-align:right;">${fmtMoney(Number(li.total || 0))}</td>
          </tr>`).join("")}</tbody>
        </table>`
      : "";

    const title = invoice.invoice_number || "Invoice";
    const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:${BRAND_COLOR};padding:24px;border-radius:8px 8px 0 0;text-align:center;">
        ${BRAND_LOGO_URL ? `<img src="${BRAND_LOGO_URL}" alt="" style="width:40px;height:40px;border-radius:6px;margin-bottom:8px;">` : ""}
        <h1 style="color:#fff;font-size:20px;margin:0;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#333;margin-bottom:16px;">You have an invoice from <strong>${escapeHtml(BRAND_NAME)}</strong>.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div><span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Invoice #</span><br><strong>${escapeHtml(title)}</strong></div>
          <div><span style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;">Due Date</span><br><strong>${invoice.due_date || "—"}</strong></div>
        </div>
        ${lineItemsHtml}
        <div style="text-align:right;font-size:13px;color:#666;margin-top:8px;">Subtotal: ${fmtMoney(Number(invoice.subtotal || 0))}</div>
        <div style="text-align:right;font-size:13px;color:#666;">Tax: ${fmtMoney(Number(invoice.tax || 0))}</div>
        <div style="text-align:right;font-size:22px;font-weight:700;color:${BRAND_COLOR};margin:12px 0;">Total: ${fmtMoney(Number(invoice.total || 0))}</div>
        ${invoice.notes ? `<div style="margin-top:16px;padding:12px;background:#f8f8f8;border-radius:6px;font-size:13px;color:#555;">${escapeHtml(invoice.notes)}</div>` : ""}
        <p style="font-size:13px;color:#888;margin-top:24px;">This invoice was sent by ${escapeHtml(BRAND_NAME)}. Please contact us if you have any questions.</p>
      </div>
    </div>`;

    // Send email
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
        to: [toEmail],
        reply_to: BRAND_REPLY_TO || undefined,
        subject: `Invoice ${title} from ${BRAND_NAME}`,
        html: emailHtml,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      return new Response(JSON.stringify({ success: false, error: emailResult.message || "Failed to send email" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update invoice status to sent if still draft
    if (invoice.status === "draft") {
      await supabase.from("invoices").update({
        status: "sent",
        updated_at: new Date().toISOString(),
      }).eq("id", invoice.id);
    }

    return new Response(JSON.stringify({ success: true, emailResult }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
