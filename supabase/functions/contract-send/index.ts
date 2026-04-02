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
const SIGNING_BASE_URL = Deno.env.get("SIGNING_BASE_URL") || "";

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { contract_id } = await req.json();
    if (!contract_id) {
      return new Response(JSON.stringify({ success: false, error: "contract_id is required" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: contract, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (error || !contract) {
      return new Response(JSON.stringify({ success: false, error: "Contract not found" }), {
        status: 404, headers: { "Content-Type": "application/json" },
      });
    }

    if (!contract.signer_email) {
      return new Response(JSON.stringify({ success: false, error: "No signer email set" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    if (!contract.filled_html) {
      return new Response(JSON.stringify({ success: false, error: "Contract has no content. Fill in the fields first." }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    if (contract.status === "signed") {
      return new Response(JSON.stringify({ success: false, error: "Contract is already signed" }), {
        status: 400, headers: { "Content-Type": "application/json" },
      });
    }

    if (!SIGNING_BASE_URL) {
      return new Response(JSON.stringify({ success: false, error: "Signing URL not configured" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const signingUrl = `${SIGNING_BASE_URL}?token=${contract.sign_token}`;
    const title = contract.title || contract.template_name || "Contract";

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="padding:24px 0;border-bottom:2px solid ${BRAND_COLOR};margin-bottom:24px;display:flex;align-items:center;gap:12px;">
          ${BRAND_LOGO_URL ? `<img src="${BRAND_LOGO_URL}" alt="" style="width:36px;height:36px;border-radius:6px;">` : ""}
          <span style="font-size:16px;font-weight:700;color:${BRAND_COLOR};">${escapeHtml(BRAND_NAME)}</span>
        </div>
        <h2 style="color:${BRAND_COLOR};margin-bottom:8px;">Contract Ready for Your Signature</h2>
        <p style="color:#4A4A4A;line-height:1.6;margin-bottom:24px;">
          You have a contract to review and sign: <strong>${escapeHtml(title)}</strong>.
          Please click the button below to review the full contract and provide your electronic signature.
        </p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${signingUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#FFFFFF;text-decoration:none;padding:14px 40px;border-radius:6px;font-size:16px;font-weight:700;">
            Review & Sign
          </a>
        </div>
        <p style="color:#929BAA;font-size:13px;line-height:1.5;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${signingUrl}" style="color:#3D5A80;word-break:break-all;">${signingUrl}</a>
        </p>
        <p style="color:#929BAA;font-size:12px;margin-top:24px;padding-top:16px;border-top:1px solid #D0D0D0;">
          This email was sent by ${escapeHtml(BRAND_NAME)}. If you have questions, reply to this email.
        </p>
      </div>
    `;

    // Update status FIRST so it's marked sent even if email response is slow
    const { error: updateErr } = await supabase.from("contracts").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", contract.id);
    if (updateErr) console.error("Failed to update contract status:", updateErr.message);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${BRAND_NAME} <${BRAND_FROM_EMAIL}>`,
        to: [contract.signer_email],
        reply_to: BRAND_REPLY_TO || undefined,
        subject: `Contract for your review: ${title}`,
        html: emailHtml,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      console.error("Resend error:", JSON.stringify(emailResult));
      return new Response(JSON.stringify({ success: false, error: "Failed to send email" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, emailResult }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
