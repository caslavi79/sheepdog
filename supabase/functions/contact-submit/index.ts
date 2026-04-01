import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Allowed origins — lock CORS to only these domains
const ALLOWED_ORIGINS = [
  "https://sheepdogtexas.com",
  "https://www.sheepdogtexas.com",
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Persistent rate limiting via Supabase — survives cold starts
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

async function isRateLimited(supabase: ReturnType<typeof createClient>, ip: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  // Count recent requests from this IP
  const { count, error } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("endpoint", "contact-submit")
    .gte("created_at", windowStart);

  if (error) {
    // If we can't check rate limits, fail closed (block the request) and log
    console.error("Rate limit check failed:", error.message);
    return true;
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX) return true;

  // Record this request
  const { error: insertErr } = await supabase.from("rate_limits").insert({ ip, endpoint: "contact-submit" });
  if (insertErr) {
    console.error("Rate limit insert failed:", insertErr.message);
  }

  // Clean up ALL old entries (not just this IP) to prevent unbounded table growth
  supabase
    .from("rate_limits")
    .delete()
    .lt("created_at", windowStart)
    .then(({ error: cleanupErr }) => {
      if (cleanupErr) console.error("Rate limit cleanup failed:", cleanupErr.message);
    });

  return false;
}

// Escape HTML to prevent injection in email bodies
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
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Parse JSON body first — before rate limiting so malformed requests don't consume slots
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Honeypot — if filled, it's a bot. Return 200 so bots think they succeeded.
  if (body.website) {
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { name, phone, email, service, message, company } = body as Record<string, string>;

  // Type check — all fields must be strings
  for (const [key, val] of Object.entries({ name, email, service, message })) {
    if (typeof val !== "string") {
      return new Response(
        JSON.stringify({ error: `${key} must be a string` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  // Validate required fields
  if (!name || !email || !service || !message) {
    return new Response(
      JSON.stringify({
        error: "Name, email, service, and message are required",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Input length limits
  const MAX_LENGTHS: Record<string, number> = {
    name: 200, email: 320, phone: 30, service: 50, message: 5000, company: 200,
  };
  for (const [key, max] of Object.entries(MAX_LENGTHS)) {
    const val = (body as Record<string, string>)[key];
    if (typeof val === "string" && val.length > max) {
      return new Response(
        JSON.stringify({ error: `${key} exceeds maximum length of ${max} characters` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  }

  // Validate service against allowlist
  const VALID_SERVICES = [
    "events-security", "events-bartending", "events-both",
    "staffing", "field-ops", "logistics", "facility", "warehouse", "project", "ongoing",
    "other",
  ];
  if (!VALID_SERVICES.includes(service)) {
    return new Response(
      JSON.stringify({ error: "Invalid service type" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_\`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(email)) {
    return new Response(
      JSON.stringify({ error: "Invalid email format" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Rate limit AFTER validation so bad requests don't consume slots
  // Use x-real-ip (set by Supabase's proxy, not spoofable) with x-forwarded-for as fallback
  const ip =
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const limited = await isRateLimited(supabase, ip);
  if (limited) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again in a few minutes.",
      }),
      {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {

    // Verify email domain has MX records (with 3s timeout to prevent hangs)
    const domain = email.split("@")[1];
    try {
      const dns = await Promise.race([
        Deno.resolveDns(domain, "MX"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), 3000)),
      ]);
      if (!dns || dns.length === 0) {
        return new Response(
          JSON.stringify({ error: "Email domain does not accept mail" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } catch {
      // On timeout or DNS failure, allow the request through — don't block legit users
      // The email format regex already validated the basic structure
    }

    // Sanitize inputs for use in HTML email bodies
    const safeName    = escapeHtml(name);
    const safePhone   = escapeHtml(phone || "");
    const safeEmail   = escapeHtml(email);
    const safeService = escapeHtml(service);
    const safeMessage = escapeHtml(message);
    const safeCompany = escapeHtml(company || "");

    // Insert raw values into DB (Supabase parameterizes, no injection risk)
    const { error: dbError } = await supabase
      .from("contact_submissions")
      .insert({ name, phone, email, service, message, company: company || null });

    if (dbError) throw dbError;

    // Auto-create pipeline deal so no lead slips through
    const serviceToPipeline: Record<string, string> = {
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

    const { error: pipelineError } = await supabase
      .from("pipeline")
      .insert({
        contact_name: name,
        business_name: company || null,
        email: email,
        phone: phone || null,
        service_line: serviceToPipeline[service] || "events",
        stage: "lead",
        source: "contact_form",
        notes: message,
      });

    if (pipelineError) {
      console.error("Pipeline auto-create failed:", pipelineError.message);
      // Don't throw — contact submission is already saved, emails will still send
    }

    // Service labels for display
    const serviceLabels: Record<string, string> = {
      "events-security":   "Event Security",
      "events-bartending": "Mobile Bartending",
      "events-both":       "Security + Bartending",
      "staffing":          "Contracted Staffing",
      "field-ops":         "Field Operations",
      "logistics":         "Logistics Support",
      "facility":          "Facility Maintenance",
      "warehouse":         "Warehouse Staffing",
      "project":           "Project-Based Labor",
      "ongoing":           "Ongoing Placements",
      "other":             "Not sure yet",
    };
    const serviceDisplay = serviceLabels[service] || safeService;

    // Internal notification email to team
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

    // Confirmation email HTML
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

    // Send both emails in parallel — don't let one block the other
    const resendHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RESEND_API_KEY}`,
    };

    const [internalResult, confirmResult] = await Promise.allSettled([
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify({
          from: "Sheepdog Lead <noreply@sheepdogtexas.com>",
          to: [
            "benschultz519@gmail.com",
            "Joshk1288@gmail.com",
            "sheepdogsecurityllc@gmail.com",
          ],
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

    if (internalResult.status === "rejected") {
      console.error("Resend internal email failed:", internalResult.reason);
    } else if (!internalResult.value.ok) {
      console.error("Resend internal email error:", await internalResult.value.text());
    }
    if (confirmResult.status === "rejected") {
      console.error("Resend confirmation email failed:", confirmResult.reason);
    } else if (!confirmResult.value.ok) {
      console.error("Resend confirmation email error:", await confirmResult.value.text());
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Contact submit error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
