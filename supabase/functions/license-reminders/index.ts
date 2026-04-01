import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const NOTIFY_EMAILS = [
  "benschultz519@gmail.com",
  "Joshk1288@gmail.com",
  "sheepdogsecurityllc@gmail.com",
];

const REMINDER_DAYS = [30, 14, 7];

Deno.serve(async (req: Request) => {
  // Allow GET (cron) or POST (manual trigger)
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get all licenses with expiration dates
    const { data: licenses, error: licError } = await supabase
      .from("licenses")
      .select("*, staff:staff_id(name, email)")
      .not("expiration_date", "is", null);

    if (licError) {
      return new Response(JSON.stringify({ error: licError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const reminders: Array<{
      staffName: string;
      licenseType: string;
      licenseNumber: string;
      expirationDate: string;
      daysLeft: number;
    }> = [];

    for (const lic of licenses || []) {
      const expDate = new Date(lic.expiration_date + "T00:00:00");
      const daysLeft = Math.ceil(
        (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Send reminder if expiration matches one of our reminder days
      if (REMINDER_DAYS.includes(daysLeft) || daysLeft < 0) {
        const staffName = lic.staff?.name || "Unknown Staff";
        reminders.push({
          staffName,
          licenseType: lic.license_type?.toUpperCase() || "LICENSE",
          licenseNumber: lic.license_number || "N/A",
          expirationDate: lic.expiration_date,
          daysLeft,
        });
      }
    }

    if (reminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No reminders to send today", checked: (licenses || []).length }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build email
    const expired = reminders.filter((r) => r.daysLeft < 0);
    const expiringSoon = reminders.filter((r) => r.daysLeft >= 0);

    let html = `<div style="font-family: Arial, sans-serif; max-width: 600px;">`;
    html += `<h2 style="color: #0C0C0C; margin-bottom: 16px;">Sheepdog License Reminders</h2>`;

    if (expired.length > 0) {
      html += `<h3 style="color: #D4483A; margin-top: 24px;">Expired</h3>`;
      for (const r of expired) {
        html += `<div style="background: #FFF5F5; border-left: 3px solid #D4483A; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0;">`;
        html += `<strong>${r.staffName}</strong> &mdash; ${r.licenseType} #${r.licenseNumber}<br>`;
        html += `<span style="color: #D4483A;">Expired ${Math.abs(r.daysLeft)} day${Math.abs(r.daysLeft) !== 1 ? "s" : ""} ago (${r.expirationDate})</span>`;
        html += `</div>`;
      }
    }

    if (expiringSoon.length > 0) {
      html += `<h3 style="color: #C9922E; margin-top: 24px;">Expiring Soon</h3>`;
      for (const r of expiringSoon) {
        const color = r.daysLeft <= 7 ? "#D4483A" : "#C9922E";
        html += `<div style="background: #FFFBF0; border-left: 3px solid ${color}; padding: 12px 16px; margin: 8px 0; border-radius: 0 6px 6px 0;">`;
        html += `<strong>${r.staffName}</strong> &mdash; ${r.licenseType} #${r.licenseNumber}<br>`;
        html += `<span style="color: ${color};">${r.daysLeft} day${r.daysLeft !== 1 ? "s" : ""} left (expires ${r.expirationDate})</span>`;
        html += `</div>`;
      }
    }

    html += `<p style="color: #929BAA; font-size: 13px; margin-top: 24px;">Manage licenses at <a href="https://app.sheepdogtexas.com/compliance">app.sheepdogtexas.com/compliance</a></p>`;
    html += `</div>`;

    const subject = expired.length > 0
      ? `[ACTION REQUIRED] ${expired.length} expired license${expired.length !== 1 ? "s" : ""} + ${expiringSoon.length} expiring soon`
      : `License reminder: ${expiringSoon.length} expiring within 30 days`;

    // Send email via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sheepdog Compliance <noreply@sheepdogtexas.com>",
        to: NOTIFY_EMAILS,
        reply_to: "sheepdogsecurityllc@gmail.com",
        subject,
        html,
      }),
    });

    const emailResult = await emailRes.json();

    return new Response(
      JSON.stringify({
        success: true,
        reminders: reminders.length,
        expired: expired.length,
        expiring: expiringSoon.length,
        emailResult,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
