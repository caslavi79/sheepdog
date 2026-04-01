import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

Deno.serve(async (req: Request) => {
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

    // ─── GET: Render signing page ───
    if (req.method === "GET") {
      if (contract.status === "signed") {
        return new Response(renderPage("Contract Signed", `
          <div style="text-align:center;margin-top:40px;">
            <div style="font-size:48px;margin-bottom:16px;">✓</div>
            <h2 style="color:#357A38;margin-bottom:8px;">Contract Signed</h2>
            <p style="color:#929BAA;">This contract was signed on ${new Date(contract.signed_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
            <p style="color:#929BAA;margin-top:4px;">Signed by: ${escapeHtml(contract.signer_name || "—")}</p>
          </div>
        `), { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" } });
      }

      // Mark as viewed
      if (contract.status === "sent") {
        await supabase.from("contracts").update({ status: "viewed", updated_at: new Date().toISOString() }).eq("id", contract.id);
      }

      const signingHtml = `
        <div style="margin-bottom:32px;">
          ${contract.filled_html || "<p>No contract content available.</p>"}
        </div>
        <div style="border-top:2px solid ${BRAND_COLOR};padding-top:32px;margin-top:32px;">
          <h2 style="font-family:Arial,sans-serif;font-size:20px;color:${BRAND_COLOR};margin-bottom:16px;">Sign This Contract</h2>
          <form id="signForm">
            <label style="display:block;margin-bottom:16px;">
              <span style="display:block;font-size:13px;font-weight:700;color:#4A4A4A;margin-bottom:4px;">Full Legal Name *</span>
              <input id="signerName" type="text" required placeholder="Enter your full name"
                style="width:100%;padding:12px;border:1px solid #D0D0D0;border-radius:6px;font-size:16px;font-family:Arial,sans-serif;" />
            </label>
            <label style="display:block;margin-bottom:8px;">
              <span style="display:block;font-size:13px;font-weight:700;color:#4A4A4A;margin-bottom:4px;">Signature *</span>
            </label>
            <canvas id="sigCanvas" width="600" height="180"
              style="border:1px solid #D0D0D0;border-radius:6px;cursor:crosshair;width:100%;max-width:600px;touch-action:none;background:#FAFAFA;"></canvas>
            <div style="display:flex;gap:8px;margin:8px 0 20px;">
              <button type="button" id="clearBtn" style="background:none;border:1px solid #D0D0D0;color:#929BAA;padding:6px 14px;border-radius:4px;font-size:13px;cursor:pointer;">Clear Signature</button>
            </div>
            <label style="display:flex;align-items:flex-start;gap:10px;margin-bottom:24px;cursor:pointer;">
              <input type="checkbox" id="agreeCheck" required style="margin-top:3px;width:18px;height:18px;" />
              <span style="font-size:14px;color:#4A4A4A;">I have read and agree to the terms of this contract. I understand that my electronic signature is legally binding.</span>
            </label>
            <button type="submit" id="submitBtn"
              style="background:${BRAND_COLOR};color:#FFFFFF;border:none;padding:14px 32px;border-radius:6px;font-size:16px;font-weight:700;cursor:pointer;width:100%;">
              Sign & Submit
            </button>
            <p id="errorMsg" style="color:#D4483A;font-size:13px;margin-top:8px;display:none;"></p>
          </form>
        </div>
        <script>
          const canvas = document.getElementById('sigCanvas');
          const ctx = canvas.getContext('2d');
          let drawing = false, hasDrawn = false;
          const rect = () => canvas.getBoundingClientRect();
          const getPos = (e) => {
            const r = rect();
            const t = e.touches ? e.touches[0] : e;
            return [(t.clientX - r.left) * (canvas.width / r.width), (t.clientY - r.top) * (canvas.height / r.height)];
          };
          const start = (e) => { e.preventDefault(); drawing = true; ctx.beginPath(); const [x,y] = getPos(e); ctx.moveTo(x,y); };
          const draw = (e) => { if (!drawing) return; e.preventDefault(); hasDrawn = true; const [x,y] = getPos(e); ctx.lineTo(x,y); ctx.strokeStyle = '${BRAND_COLOR}'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.stroke(); };
          const stop = () => { drawing = false; };
          canvas.addEventListener('mousedown', start); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stop); canvas.addEventListener('mouseleave', stop);
          canvas.addEventListener('touchstart', start); canvas.addEventListener('touchmove', draw); canvas.addEventListener('touchend', stop); canvas.addEventListener('touchcancel', stop);
          document.getElementById('clearBtn').addEventListener('click', () => { ctx.clearRect(0, 0, canvas.width, canvas.height); hasDrawn = false; });

          document.getElementById('signForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('signerName').value.trim();
            const errEl = document.getElementById('errorMsg');
            const btn = document.getElementById('submitBtn');
            if (!name) { errEl.textContent = 'Please enter your full name.'; errEl.style.display = 'block'; return; }
            if (!hasDrawn) { errEl.textContent = 'Please draw your signature above.'; errEl.style.display = 'block'; return; }
            if (!document.getElementById('agreeCheck').checked) { errEl.textContent = 'Please agree to the terms.'; errEl.style.display = 'block'; return; }
            errEl.style.display = 'none';
            btn.disabled = true; btn.textContent = 'Submitting...';
            try {
              const res = await fetch(window.location.href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ signer_name: name, signature_data: canvas.toDataURL('image/png') })
              });
              const data = await res.json();
              if (data.success) {
                document.getElementById('signForm').innerHTML = '<div style="text-align:center;padding:40px 0;"><div style="font-size:48px;margin-bottom:16px;">✓</div><h2 style="color:#357A38;">Contract Signed</h2><p style="color:#929BAA;margin-top:8px;">A confirmation has been sent to your email.</p></div>';
              } else {
                errEl.textContent = data.error || 'Something went wrong. Please try again.'; errEl.style.display = 'block';
                btn.disabled = false; btn.textContent = 'Sign & Submit';
              }
            } catch (err) {
              errEl.textContent = 'Network error. Please try again.'; errEl.style.display = 'block';
              btn.disabled = false; btn.textContent = 'Sign & Submit';
            }
          });
        </script>
      `;

      return new Response(renderPage(contract.title || "Contract", signingHtml), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
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
