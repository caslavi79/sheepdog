import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const RESEND_API_KEY = requireEnv("RESEND_API_KEY");
const BRAND_NAME = Deno.env.get("BRAND_NAME") || "Company";
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@example.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "";
const BRAND_COLOR = (Deno.env.get("BRAND_COLOR") || "#0C0C0C").replace(/[^#0-9A-Fa-f]/g, "").slice(0, 7) || "#0C0C0C";
const BRAND_LOGO_URL = Deno.env.get("BRAND_LOGO_URL") || "";

const NOTIFY_EMAILS = [
  "benschultz519@gmail.com",
  "Joshk1288@gmail.com",
  "sheepdogsecurityllc@gmail.com",
];

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

const ALLOWED_ORIGINS = [
  "https://sheepdogtexas.com",
  "https://www.sheepdogtexas.com",
  "https://app.sheepdogtexas.com",
  "http://localhost:5173",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing token", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: contract, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("sign_token", token)
      .single();

    if (error || !contract) {
      return new Response(renderPage("Contract Not Found", `<p style="text-align:center;color:#929BAA;margin-top:40px;">This contract link is invalid or has expired.</p>`), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // ─── GET: Return contract data as JSON (signing page is in the React app) ───
    if (req.method === "GET") {
      // Mark as viewed
      if (contract.status === "sent") {
        await supabase.from("contracts").update({ status: "viewed", updated_at: new Date().toISOString() }).eq("id", contract.id);
      }

      // Strip document wrappers from filled_html
      let contractContent = contract.filled_html || "";
      contractContent = contractContent
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<html[^>]*>/gi, "").replace(/<\/html>/gi, "")
        .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<body[^>]*>/gi, "").replace(/<\/body>/gi, "")
        .trim();

      return new Response(JSON.stringify({
        success: true,
        contract: {
          id: contract.id,
          title: contract.title || contract.template_name || "Contract",
          status: contract.status,
          filled_html: contractContent,
          signer_name: contract.signer_name || null,
          signed_at: contract.signed_at || null,
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── POST: Process signature ───
    if (req.method === "POST") {
      if (contract.status !== "sent" && contract.status !== "viewed") {
        return new Response(JSON.stringify({ success: false, error: "Contract is not in a signable state" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = await req.json();
      const { signer_name, signature_data } = body;

      if (!signer_name || !signature_data) {
        return new Response(JSON.stringify({ success: false, error: "Name and signature are required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const signerIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

      // Atomic update: only sign if still in signable state (prevents double-sign race)
      const { data: updated, error: updateErr } = await supabase.from("contracts").update({
        status: "signed",
        signer_name,
        signature_data,
        signed_at: new Date().toISOString(),
        signer_ip: signerIp,
        updated_at: new Date().toISOString(),
      }).eq("id", contract.id).in("status", ["sent", "viewed"]).select("id");

      if (!updated || updated.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Contract was already signed" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: "Failed to save signature" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Auto-update contractor_docs if this contract is linked to a staff member
      if (contract.staff_id) {
        const TEMPLATE_TO_DOC_TYPE: Record<string, string> = {
          'Independent Contractor Agreement': 'agreement',
          'W-9 Request Form': 'w9',
        };
        const docType = TEMPLATE_TO_DOC_TYPE[contract.template_name];
        if (docType) {
          await supabase.from("contractor_docs")
            .update({
              status: "received",
              signature_date: new Date().toISOString().split("T")[0],
              contract_id: contract.id,
              updated_at: new Date().toISOString(),
            })
            .eq("staff_id", contract.staff_id)
            .eq("doc_type", docType);
        }
      }

      // Auto-advance pipeline if client has a linked deal
      if (contract.client_id) {
        await supabase.from("pipeline")
          .update({
            stage: "under_contract",
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("client_id", contract.client_id)
          .in("stage", ["proposal_sent", "meeting_scheduled"]);
      }

      // Send confirmation emails
      const confirmHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;"><h2 style="color:${BRAND_COLOR};">Contract Signed</h2><p>This confirms that <strong>${escapeHtml(signer_name)}</strong> has signed <strong>${escapeHtml(contract.title || contract.template_name)}</strong>.</p><p style="color:#929BAA;font-size:13px;">Signed at ${new Date().toLocaleString("en-US")} from IP ${escapeHtml(signerIp)}.</p><p style="color:#929BAA;font-size:13px;margin-top:16px;">This is an automated confirmation from ${escapeHtml(BRAND_NAME)}.</p></div>`;

      const emailPromises = [
        // Confirmation to signer
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
            to: [contract.signer_email],
            reply_to: BRAND_REPLY_TO || undefined,
            subject: `Signed: ${contract.title || contract.template_name}`,
            html: confirmHtml,
          }),
        }),
        // Notification to team
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: `${BRAND_NAME} Contracts <${BRAND_FROM_EMAIL}>`,
            to: NOTIFY_EMAILS,
            reply_to: contract.signer_email,
            subject: `Contract signed: ${escapeHtml(contract.title || contract.template_name)} by ${escapeHtml(signer_name)}`,
            html: confirmHtml,
          }),
        }),
      ];

      const results = await Promise.allSettled(emailPromises);
      results.forEach((r, i) => { if (r.status === 'rejected') console.error(`Email ${i} failed:`, r.reason) });

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)} | ${escapeHtml(BRAND_NAME)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#F4F3F1;color:#4A4A4A;min-height:100vh}.page{max-width:800px;margin:0 auto;padding:32px 24px 80px}.header{display:flex;align-items:center;gap:12px;margin-bottom:32px;padding-bottom:16px;border-bottom:2px solid ${BRAND_COLOR}}${BRAND_LOGO_URL ? `.header img{width:40px;height:40px;border-radius:6px}` : ""}.header h1{font-size:18px;color:${BRAND_COLOR}}@media(max-width:600px){.page{padding:20px 16px 60px}.header h1{font-size:15px}}</style></head><body><div class="page"><div class="header">${BRAND_LOGO_URL ? `<img src="${BRAND_LOGO_URL}" alt="">` : ""}<h1>${escapeHtml(title)}</h1></div>${body}</div></body></html>`;
}
