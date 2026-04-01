import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://sheepdogtexas.com",
  "https://www.sheepdogtexas.com",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> | null {
  if (!requestOrigin || !ALLOWED_ORIGINS.includes(requestOrigin)) {
    return null;
  }
  return {
    "Access-Control-Allow-Origin": requestOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const VALID_SERVICES = [
  "events-security", "events-bartending", "events-both",
  "staffing", "field-ops", "logistics", "facility", "warehouse", "project", "ongoing",
  "other",
];

const SERVICE_TO_PIPELINE: Record<string, string> = {
  "events-security": "events",
  "events-bartending": "events",
  "events-both": "events",
  "staffing": "staffing",
  "field-ops": "staffing",
  "logistics": "staffing",
  "facility": "staffing",
  "warehouse": "staffing",
  "project": "staffing",
  "ongoing": "staffing",
  "other": "events",
};

const SERVICE_LABELS: Record<string, string> = {
  "events-security": "Event Security",
  "events-bartending": "Mobile Bartending",
  "events-both": "Security + Bartending",
  "staffing": "Contracted Staffing",
  "field-ops": "Field Operations",
  "logistics": "Logistics Support",
  "facility": "Facility Maintenance",
  "warehouse": "Warehouse Staffing",
  "project": "Project-Based Labor",
  "ongoing": "Ongoing Placements",
  "other": "Not sure yet",
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(requestOrigin);

  if (req.method === "OPTIONS") {
    if (!corsHeaders) return new Response("Forbidden", { status: 403 });
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
    });
  }

  try {
    // Parse JSON
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    // Honeypot
    if (body.website || body.confirm_email_hp) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    const name = body.name;
    const phone = body.phone;
    const email = body.email;
    const service = body.service;
    const message = body.message;
    const company = body.company;

    // Type check required fields
    if (typeof name !== "string" || typeof email !== "string" ||
        typeof service !== "string" || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Invalid field types" }), {
        status: 400,
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    // Required fields
    if (!name || !email || !service || !message) {
      return new Response(
        JSON.stringify({ error: "Name, email, service, and message are required" }),
        { status: 400, headers: { ...(corsHeaders || {}), "Content-Type": "application/json" } },
      );
    }

    // Length limits
    if (name.length > 200 || email.length > 320 || message.length > 5000) {
      return new Response(JSON.stringify({ error: "Input too long" }), {
        status: 400,
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    // Service allowlist
    if (!VALID_SERVICES.includes(service)) {
      return new Response(JSON.stringify({ error: "Invalid service type" }), {
        status: 400,
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    // Email format
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), {
        status: 400,
        headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
      });
    }

    // Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Rate limit
    const ip =
      req.headers.get("x-real-ip") ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: rlError } = await supabase
      .from("rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .eq("endpoint", "contact-submit")
      .gte("created_at", windowStart);

    if (rlError) {
      console.error("Rate limit check failed:", rlError.message);
      // Fail closed
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again in a few minutes." }),
        { status: 429, headers: { ...(corsHeaders || {}), "Content-Type": "application/json" } },
      );
    }

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again in a few minutes." }),
        { status: 429, headers: { ...(corsHeaders || {}), "Content-Type": "application/json" } },
      );
    }

    // Record rate limit hit
    await supabase.from("rate_limits").insert({ ip, endpoint: "contact-submit" });

    // Cleanup old rate limit entries (fire-and-forget)
    supabase.from("rate_limits").delete().lt("created_at", windowStart)
      .then(({ error: e }) => { if (e) console.error("Rate limit cleanup failed:", e.message); });

    // MX check with timeout (non-blocking on failure)
    const domain = email.split("@")[1];
    try {
      const dns = await Promise.race([
        Deno.resolveDns(domain, "MX"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
      ]);
      if (!dns || dns.length === 0) {
        return new Response(JSON.stringify({ error: "Email domain does not accept mail" }), {
          status: 400,
          headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
        });
      }
    } catch {
      // Allow through on timeout or DNS failure
    }

    // Sanitize for HTML emails
    const safeName = escapeHtml(name);
    const safePhone = escapeHtml(typeof phone === "string" ? phone : "");
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);
    const safeCompany = escapeHtml(typeof company === "string" ? company : "");
    const serviceDisplay = SERVICE_LABELS[service] || service;

    // Insert into contact_submissions
    const submissionData: Record<string, unknown> = { name, phone: typeof phone === "string" ? phone : null, email, service, message };
    // Only include company if it has a value (column may not exist yet on older schemas)
    if (typeof company === "string" && company) submissionData.company = company;

    const { error: dbError } = await supabase
      .from("contact_submissions")
      .insert(submissionData);

    if (dbError) {
      console.error("DB insert failed:", dbError.message);
      // If it failed because of the company column, retry without it
      if (dbError.message.includes("company")) {
        const { error: retryErr } = await supabase
          .from("contact_submissions")
          .insert({ name, phone: typeof phone === "string" ? phone : null, email, service, message });
        if (retryErr) throw retryErr;
      } else {
        throw dbError;
      }
    }

    // Auto-create pipeline deal
    const { error: pipelineError } = await supabase
      .from("pipeline")
      .insert({
        contact_name: name,
        business_name: typeof company === "string" ? company : null,
        email,
        phone: typeof phone === "string" ? phone : null,
        service_line: SERVICE_TO_PIPELINE[service] || "events",
        stage: "lead",
        source: "contact_form",
        notes: message,
      });

    if (pipelineError) {
      console.error("Pipeline auto-create failed:", pipelineError.message);
    }

    // Build emails
    const internalHtml = `
      <h2>New Quote Request</h2>
      <p><strong>Name:</strong> ${safeName}</p>${safeCompany ? `
      <p><strong>Company:</strong> ${safeCompany}</p>` : ""}
      <p><strong>Phone:</strong> ${safePhone || "Not provided"}</p>
      <p><strong>Email:</strong> ${safeEmail}</p>
      <p><strong>Service:</strong> ${serviceDisplay}</p>
      <p><strong>Message:</strong></p>
      <p>${safeMessage}</p>
      <hr>
      <p style="color:#7A8490;font-size:12px;">Submitted from sheepdogtexas.com</p>
    `;

    const confirmHtml = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;color:#2A2A2A">
        <h2 style="color:#0C0C0C;margin-bottom:4px">Thanks for reaching out, ${safeName}.</h2>
        <p style="color:#4A4A4A;font-size:16px;line-height:1.6">We received your request and will be in touch within 24 hours. If you need immediate assistance, feel free to call or text us anytime.</p>
        <p style="color:#4A4A4A;font-size:16px;line-height:1.6">Need to add more details or update your request? Just reply to this email.</p>
        <p style="font-size:20px;font-weight:bold;margin:24px 0"><a href="tel:9792040945" style="color:#0C0C0C;text-decoration:none">📞 (979) 204-0945</a></p>
        <hr style="border:none;border-top:1px solid #D0D0D0;margin:24px 0">
        <h3 style="color:#6B6B6B;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin-bottom:12px">Your Submission Summary</h3>
        <table style="width:100%;font-size:15px;color:#4A4A4A;line-height:1.8">
          <tr><td style="font-weight:600;width:120px;vertical-align:top">Name</td><td>${safeName}</td></tr>${safeCompany ? `
          <tr><td style="font-weight:600;vertical-align:top">Company</td><td>${safeCompany}</td></tr>` : ""}
          <tr><td style="font-weight:600;vertical-align:top">Phone</td><td>${safePhone || "Not provided"}</td></tr>
          <tr><td style="font-weight:600;vertical-align:top">Email</td><td>${safeEmail}</td></tr>
          <tr><td style="font-weight:600;vertical-align:top">Service</td><td>${serviceDisplay}</td></tr>
          <tr><td style="font-weight:600;vertical-align:top">Details</td><td>${safeMessage}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #D0D0D0;margin:24px 0">
        <p style="color:#7A8490;font-size:13px">Sheepdog Security LLC · Bryan-College Station, TX<br><a href="https://sheepdogtexas.com" style="color:#7A8490">sheepdogtexas.com</a></p>
      </div>
    `;

    // Send both emails in parallel
    const resendHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    };

    const [intRes, confRes] = await Promise.allSettled([
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify({
          from: "Sheepdog Lead <noreply@sheepdogtexas.com>",
          to: ["benschultz519@gmail.com", "Joshk1288@gmail.com", "sheepdogsecurityllc@gmail.com"],
          subject: `[${serviceDisplay}] New Quote Request from ${safeName}`,
          html: internalHtml,
          reply_to: safeEmail,
        }),
      }),
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify({
          from: "Sheepdog <noreply@sheepdogtexas.com>",
          to: [email],
          reply_to: "sheepdogsecurityllc@gmail.com",
          subject: "We got your request — Sheepdog",
          html: confirmHtml,
        }),
      }),
    ]);

    if (intRes.status === "rejected") console.error("Internal email failed:", intRes.reason);
    else if (!intRes.value.ok) console.error("Internal email error:", await intRes.value.text());
    if (confRes.status === "rejected") console.error("Confirmation email failed:", confRes.reason);
    else if (!confRes.value.ok) console.error("Confirmation email error:", await confRes.value.text());

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...(corsHeaders || {}), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Contact submit error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...(getCorsHeaders(req.headers.get("origin")) || {}), "Content-Type": "application/json" },
    });
  }
});
