import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") || "claude-sonnet-4-20250514";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BRAND_FROM_EMAIL = Deno.env.get("BRAND_FROM_EMAIL") || "noreply@example.com";
const BRAND_REPLY_TO = Deno.env.get("BRAND_REPLY_TO") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AssistantRequest {
  action: string;
  message?: string;
  context?: { page?: string; record_id?: string; record_type?: string };
  session_id?: string;
  image_base64?: string;
  image_media_type?: string;
  data?: Record<string, unknown>;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [k: string]: unknown }>;
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function getTodayCT(): string {
  const d = new Date();
  const ct = new Date(d.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  return ct.getFullYear() + "-" + String(ct.getMonth() + 1).padStart(2, "0") + "-" + String(ct.getDate()).padStart(2, "0");
}

function getBaseSystemPrompt(): string {
  return `Sheepdog AI — ops assistant for Sheepdog Security LLC (Bryan-College Station TX). Security, mobile bartending, contracted staffing.
TODAY: ${getTodayCT()} (Central Time).

TABLES: pipeline(deals,stages:lead→under_contract→lost), clients, events, invoices(SHD-XXXX), staff, licenses, contractor_docs, contracts, placements, contact_submissions, pay_rate_defaults.

Be concise, use specific numbers and names. Never fabricate data.`;
}

function getPageContext(page?: string): string {
  const contexts: Record<string, string> = {
    hub: `Page: Dashboard — stats, alerts, module nav.`,
    pipeline: `Page: Pipeline — Kanban board, 7 stages, deal cards.`,
    clients: `Page: Clients — table with search/filters, detail panel.`,
    contracts: `Page: Contracts — 18 templates, editor, e-sign flow.`,
    scheduling: `Page: Scheduling — calendar, events, placements.`,
    financials: `Page: Financials — invoices, payouts, staff earnings.`,
    compliance: `Page: Compliance — staff roster, licenses, contractor docs.`,
    resources: `Page: Resources — 33 docs, brand guides, templates.`,
  };
  return contexts[page || ""] || "";
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function fetchBusinessSummary(supabase: ReturnType<typeof createClient>) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: pipeline },
    { data: clients },
    { data: invoices },
    { data: events },
    { data: staff },
    { data: licenses },
    { data: docs },
    { data: submissions },
    { data: contracts },
  ] = await Promise.all([
    supabase.from("pipeline").select("id, contact_name, business_name, stage, value, service_line, last_activity, source"),
    supabase.from("clients").select("id, contact_name, business_name, status, service_line"),
    supabase.from("invoices").select("id, client_id, invoice_number, total, status, due_date, payment_date"),
    supabase.from("events").select("id, title, venue_name, date, start_time, end_time, staff_needed, staff_assigned, status, invoice_id, client_id"),
    supabase.from("staff").select("id, name, role, status, background_check"),
    supabase.from("licenses").select("id, staff_id, license_type, expiration_date, status"),
    supabase.from("contractor_docs").select("id, staff_id, doc_type, status"),
    supabase.from("contact_submissions").select("id, created_at").gte("created_at", weekAgo),
    supabase.from("contracts").select("id, client_id, status, signer_name, sent_at, signed_at"),
  ]);

  // Compute summary stats
  const activeDeals = (pipeline || []).filter((d) => d.stage !== "lost");
  const leads = activeDeals.filter((d) => d.stage === "lead").length;
  const pipelineValue = activeDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
  const activeClients = (clients || []).filter((c) => c.status === "active").length;

  const overdueInvoices = (invoices || []).filter((i) => {
    if (i.status === "overdue") return true;
    if (i.status === "sent" && i.due_date) {
      return new Date(i.due_date + "T00:00:00") < now;
    }
    return false;
  });
  const outstandingTotal = (invoices || [])
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

  const expiredLicenses = (licenses || []).filter((l) => {
    if (!l.expiration_date) return false;
    return new Date(l.expiration_date + "T00:00:00") < now;
  });
  const expiringLicenses = (licenses || []).filter((l) => {
    if (!l.expiration_date) return false;
    const exp = new Date(l.expiration_date + "T00:00:00");
    const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysLeft >= 0 && daysLeft <= 30;
  });

  const missingDocs = (docs || []).filter((d) => d.status === "missing");

  const staleDeals = activeDeals.filter((d) => {
    if (!d.last_activity) return true;
    const daysSince = Math.floor((now.getTime() - new Date(d.last_activity).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 14;
  });

  const unsignedContracts = (contracts || []).filter((c) => {
    if (c.status !== "sent" || !c.sent_at) return false;
    const daysSince = Math.floor((now.getTime() - new Date(c.sent_at).getTime()) / (1000 * 60 * 60 * 24));
    return daysSince > 7;
  });

  const pastEventsNoInvoice = (events || []).filter((e) => {
    if (!e.date || e.invoice_id) return false;
    return new Date(e.date + "T00:00:00") < now && e.status !== "cancelled";
  });

  return {
    stats: {
      leads,
      pipelineValue,
      submissions7d: (submissions || []).length,
      activeClients,
      totalStaff: (staff || []).filter((s) => s.status === "active").length,
    },
    alerts: {
      overdueInvoices: overdueInvoices.length,
      outstandingTotal,
      expiredLicenses: expiredLicenses.length,
      expiringLicenses: expiringLicenses.length,
      missingDocs: missingDocs.length,
      staleDeals: staleDeals.length,
      unsignedContracts: unsignedContracts.length,
      pastEventsNoInvoice: pastEventsNoInvoice.length,
    },
    details: {
      overdueInvoices: overdueInvoices.map((i) => ({ invoice_number: i.invoice_number, total: i.total, due_date: i.due_date })),
      staleDeals: staleDeals.map((d) => ({ contact_name: d.contact_name, business_name: d.business_name, stage: d.stage, value: d.value, last_activity: d.last_activity })),
      expiringLicenses: expiringLicenses.map((l) => ({ staff_id: l.staff_id, license_type: l.license_type, expiration_date: l.expiration_date })),
      unsignedContracts: unsignedContracts.map((c) => ({ signer_name: c.signer_name, sent_at: c.sent_at })),
      pastEventsNoInvoice: pastEventsNoInvoice.map((e) => ({ title: e.title, venue_name: e.venue_name, date: e.date })),
    },
    raw: { pipeline, clients, invoices, events, staff, licenses, docs, contracts },
  };
}

// ---------------------------------------------------------------------------
// Claude API call
// ---------------------------------------------------------------------------

async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  opts?: { maxTokens?: number; model?: string }
): Promise<{ reply: string; usage: { input_tokens: number; output_tokens: number } }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts?.model || CLAUDE_MODEL,
      max_tokens: opts?.maxTokens || 2048,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error("Claude API error:", res.status, errBody);
    throw new Error(`Claude API returned ${res.status}`);
  }

  const body = await res.json();
  const reply = body.content
    ?.filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("") || "";

  return { reply, usage: body.usage || { input_tokens: 0, output_tokens: 0 } };
}

// ---------------------------------------------------------------------------
// Message logging
// ---------------------------------------------------------------------------

async function logMessage(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  actionType: string,
  contextPage?: string,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  const { data, error } = await supabase
    .from("assistant_messages")
    .insert({
      user_id: userId,
      session_id: sessionId,
      role,
      content,
      action_type: actionType,
      context_page: contextPage || null,
      metadata: metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to log message:", error.message);
    return null;
  }
  return data.id;
}

async function logAction(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  actionType: string,
  targetTable?: string,
  targetId?: string,
  payload?: Record<string, unknown>
) {
  const { error } = await supabase.from("assistant_actions").insert({
    message_id: messageId,
    action_type: actionType,
    target_table: targetTable || null,
    target_id: targetId || null,
    payload: payload || {},
  });
  if (error) console.error("Failed to log action:", error.message);
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleChat(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; session_id: string; usage?: Record<string, number> }> {
  const sessionId = req.session_id || crypto.randomUUID();
  const page = req.context?.page;

  // Log user message
  await logMessage(supabase, userId, sessionId, "user", req.message || "", "chat", page);

  // Load conversation history (last 20 messages in this session)
  const { data: history } = await supabase
    .from("assistant_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(20);

  const messages: ClaudeMessage[] = (history || []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // If no history yet (first message was just inserted), use the current message
  if (messages.length === 0) {
    messages.push({ role: "user", content: req.message || "" });
  }

  // Build system prompt with page context
  let systemPrompt = getBaseSystemPrompt();
  const pageCtx = getPageContext(page);
  if (pageCtx) {
    systemPrompt += `\n\nCURRENT PAGE CONTEXT:\n${pageCtx}`;
  }

  // For hub page, fetch and include business summary
  if (page === "hub" || page === "/" || !page) {
    try {
      const summary = await fetchBusinessSummary(supabase);
      systemPrompt += `\n\nCURRENT BUSINESS DATA:\n${JSON.stringify(summary.stats)}\nALERTS: ${JSON.stringify(summary.alerts)}`;
      if (summary.details.overdueInvoices.length > 0) {
        systemPrompt += `\nOVERDUE INVOICES: ${JSON.stringify(summary.details.overdueInvoices)}`;
      }
      if (summary.details.staleDeals.length > 0) {
        systemPrompt += `\nSTALE DEALS: ${JSON.stringify(summary.details.staleDeals)}`;
      }
    } catch (e) {
      console.error("Failed to fetch business summary for chat:", e);
    }
  }

  const { reply, usage } = await callClaude(systemPrompt, messages);

  // Log assistant response
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", reply, "chat", page, { usage });
  if (msgId) {
    await logAction(supabase, msgId, "chat_response");
  }

  return { reply, session_id: sessionId, usage };
}

async function handleDailyBriefing(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  page?: string
): Promise<{ reply: string; session_id: string; usage?: Record<string, number> }> {
  const sessionId = crypto.randomUUID();

  const summary = await fetchBusinessSummary(supabase);

  const systemPrompt = getBaseSystemPrompt() + `\n\nYou are generating a daily business briefing. Summarize the current state of the business in 3-5 concise paragraphs. Include:
1. Key stats (leads, pipeline value, active clients, active staff)
2. Urgent items that need attention today (overdue invoices, expiring licenses, stale deals)
3. Upcoming items (events this week, contracts pending signature)
4. One actionable recommendation

Be specific — use names, dollar amounts, and dates. Don't be generic.`;

  const dataContext = `Here is the current business data:\n\nSTATS: ${JSON.stringify(summary.stats)}\n\nALERTS: ${JSON.stringify(summary.alerts)}\n\nDETAILS:\nOverdue invoices: ${JSON.stringify(summary.details.overdueInvoices)}\nStale deals: ${JSON.stringify(summary.details.staleDeals)}\nExpiring licenses: ${JSON.stringify(summary.details.expiringLicenses)}\nUnsigned contracts: ${JSON.stringify(summary.details.unsignedContracts)}\nPast events without invoices: ${JSON.stringify(summary.details.pastEventsNoInvoice)}`;

  const messages: ClaudeMessage[] = [
    { role: "user", content: `Generate today's business briefing.\n\n${dataContext}` },
  ];

  const { reply, usage } = await callClaude(systemPrompt, messages);

  // Log
  await logMessage(supabase, userId, sessionId, "user", "Generate daily briefing", "daily_briefing", page);
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", reply, "daily_briefing", page, { usage });
  if (msgId) {
    await logAction(supabase, msgId, "briefing_generated", null, undefined, { stats: summary.stats, alerts: summary.alerts });
  }

  return { reply, session_id: sessionId, usage };
}

async function handleLeadScore(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; score: number; session_id: string }> {
  const sessionId = crypto.randomUUID();
  const dealId = req.data?.deal_id as string;

  if (!dealId) throw new Error("deal_id is required");

  // Fetch the deal
  const { data: deal, error: dealErr } = await supabase
    .from("pipeline")
    .select("*")
    .eq("id", dealId)
    .single();

  if (dealErr || !deal) throw new Error("Deal not found");

  // Fetch historical deals for comparison
  const { data: historicalDeals } = await supabase
    .from("pipeline")
    .select("stage, value, service_line, source, created_at")
    .in("stage", ["under_contract", "lost"]);

  const systemPrompt = getBaseSystemPrompt() + `\n\nYou are scoring a sales lead from 1-10. Consider:
- Service line demand (events tend to be higher value, staffing is recurring)
- Source (contact_form leads convert better than manual entries)
- Deal value relative to average
- How complete the contact info is (has phone + email = better)

You MUST respond with valid JSON only: {"score": <1-10>, "reasoning": "<2-3 sentences>"}`;

  const messages: ClaudeMessage[] = [{
    role: "user",
    content: `Score this lead:\n${JSON.stringify(deal)}\n\nHistorical deals for reference (last closed/lost):\n${JSON.stringify((historicalDeals || []).slice(0, 20))}`,
  }];

  const { reply } = await callClaude(systemPrompt, messages, { maxTokens: 256 });

  let score = 5;
  let reasoning = reply;
  try {
    const parsed = JSON.parse(reply);
    score = Number(parsed.score) || 5;
    reasoning = parsed.reasoning || reply;
  } catch {
    // If Claude didn't return JSON, use the raw text
  }

  // Log
  await logMessage(supabase, userId, sessionId, "user", `Score lead: ${deal.contact_name || deal.business_name}`, "lead_score", "pipeline");
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", reasoning, "lead_score", "pipeline", { score });
  if (msgId) {
    await logAction(supabase, msgId, "lead_scored", "pipeline", dealId, { score, reasoning });
  }

  return { reply: reasoning, score, session_id: sessionId };
}

async function handleFollowUpDraft(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; session_id: string }> {
  const sessionId = crypto.randomUUID();
  const dealId = req.data?.deal_id as string;

  if (!dealId) throw new Error("deal_id is required");

  const { data: deal, error: dealErr } = await supabase
    .from("pipeline")
    .select("*")
    .eq("id", dealId)
    .single();

  if (dealErr || !deal) throw new Error("Deal not found");

  // Check if there's a linked client for extra context
  let clientContext = "";
  if (deal.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", deal.client_id)
      .single();
    if (client) {
      clientContext = `\nLinked client record: ${JSON.stringify(client)}`;
    }
  }

  const systemPrompt = getBaseSystemPrompt() + `\n\nYou are drafting a follow-up message for a sales deal. Write a professional but friendly message that:
- References their specific inquiry/service need
- Is appropriate for the deal's current stage
- Includes a clear call to action
- Is 3-5 sentences, ready to send via text or email
- Matches a Texas security company's professional tone (confident, helpful, not salesy)

Return the message text only — no subject line, no formatting, just the message body.`;

  const messages: ClaudeMessage[] = [{
    role: "user",
    content: `Draft a follow-up for this deal:\n${JSON.stringify(deal)}${clientContext}\n\nTheir current stage is "${deal.stage}". Last activity was ${deal.last_activity || "unknown"}.`,
  }];

  const { reply } = await callClaude(systemPrompt, messages, { maxTokens: 512 });

  // Log
  await logMessage(supabase, userId, sessionId, "user", `Draft follow-up for ${deal.contact_name || deal.business_name}`, "follow_up_draft", "pipeline");
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", reply, "follow_up_draft", "pipeline");
  if (msgId) {
    await logAction(supabase, msgId, "follow_up_drafted", "pipeline", dealId);
  }

  return { reply, session_id: sessionId };
}

async function handleClientHealth(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; score: number; session_id: string }> {
  const sessionId = crypto.randomUUID();
  const clientId = req.data?.client_id as string;

  if (!clientId) throw new Error("client_id is required");

  const [
    { data: client },
    { data: clientInvoices },
    { data: clientEvents },
    { data: clientContracts },
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("invoices").select("id, total, status, due_date, payment_date, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20),
    supabase.from("events").select("id, title, date, status, staff_needed").eq("client_id", clientId).order("date", { ascending: false }).limit(20),
    supabase.from("contracts").select("id, status, signed_at, created_at").eq("client_id", clientId).order("created_at", { ascending: false }).limit(10),
  ]);

  if (!client) throw new Error("Client not found");

  const systemPrompt = getBaseSystemPrompt() + `\n\nYou are scoring a client relationship health from 1-10. Consider:
- Payment speed (how quickly they pay after invoice sent)
- Event frequency (how often they book)
- Contract status (all signed = good)
- Recency of last interaction
- Total revenue generated

You MUST respond with valid JSON only: {"score": <1-10>, "reasoning": "<2-3 sentences>", "risk": "low"|"medium"|"high"}`;

  const messages: ClaudeMessage[] = [{
    role: "user",
    content: `Score this client relationship:\nClient: ${JSON.stringify(client)}\nInvoices: ${JSON.stringify(clientInvoices || [])}\nEvents: ${JSON.stringify(clientEvents || [])}\nContracts: ${JSON.stringify(clientContracts || [])}`,
  }];

  const { reply } = await callClaude(systemPrompt, messages, { maxTokens: 256 });

  let score = 5;
  let reasoning = reply;
  let risk = "medium";
  try {
    const parsed = JSON.parse(reply);
    score = Number(parsed.score) || 5;
    reasoning = parsed.reasoning || reply;
    risk = parsed.risk || "medium";
  } catch {
    // Use raw text if JSON parse fails
  }

  // Log
  await logMessage(supabase, userId, sessionId, "user", `Health check: ${client.contact_name || client.business_name}`, "client_health", "clients");
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", reasoning, "client_health", "clients", { score, risk });
  if (msgId) {
    await logAction(supabase, msgId, "client_health_scored", "clients", clientId, { score, risk });
  }

  return { reply: reasoning, score, session_id: sessionId };
}

async function handleDuplicateCheck(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest
): Promise<{ matches: Array<{ id: string; type: string; name: string; business: string; stage?: string }> }> {
  const name = (req.data?.contact_name as string || "").trim();
  const business = (req.data?.business_name as string || "").trim();
  const email = (req.data?.email as string || "").trim();
  const phone = (req.data?.phone as string || "").trim();

  if (!name && !business && !email && !phone) {
    return { matches: [] };
  }

  const matches: Array<{ id: string; type: string; name: string; business: string; stage?: string }> = [];

  // Check pipeline
  const { data: deals } = await supabase.from("pipeline").select("id, contact_name, business_name, email, phone, stage");
  for (const d of deals || []) {
    if (
      (email && d.email && d.email.toLowerCase() === email.toLowerCase()) ||
      (phone && d.phone && d.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")) ||
      (business && d.business_name && d.business_name.toLowerCase().includes(business.toLowerCase())) ||
      (name && d.contact_name && d.contact_name.toLowerCase().includes(name.toLowerCase()))
    ) {
      matches.push({ id: d.id, type: "pipeline", name: d.contact_name || "", business: d.business_name || "", stage: d.stage });
    }
  }

  // Check clients
  const { data: clientsList } = await supabase.from("clients").select("id, contact_name, business_name, email, phone");
  for (const c of clientsList || []) {
    if (
      (email && c.email && c.email.toLowerCase() === email.toLowerCase()) ||
      (phone && c.phone && c.phone.replace(/\D/g, "") === phone.replace(/\D/g, "")) ||
      (business && c.business_name && c.business_name.toLowerCase().includes(business.toLowerCase())) ||
      (name && c.contact_name && c.contact_name.toLowerCase().includes(name.toLowerCase()))
    ) {
      matches.push({ id: c.id, type: "client", name: c.contact_name || "", business: c.business_name || "" });
    }
  }

  return { matches };
}

async function handleScreenshotAnalyze(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; analysis: Record<string, unknown>; session_id: string }> {
  const sessionId = crypto.randomUUID();

  if (!req.image_base64) throw new Error("image_base64 is required");

  const systemPrompt = getBaseSystemPrompt() + `\n\nYou are analyzing an uploaded image. Your job is to:
1. Identify what type of document/screenshot this is
2. Extract all relevant data fields
3. Suggest what action to take in the app

Document types you should recognize:
- "w9" — W-9 tax form → extract: name, tin/ssn (last 4 only), address, business_name
- "license" — TABC license, security license, or other cert → extract: name, license_number, expiration_date, issuing_authority, license_type
- "business_card" — → extract: name, business_name, phone, email, title
- "text_message" — screenshot of text/DM about an event request → extract: date, venue, staff_needed, start_time, end_time, notes
- "email" — email about event/business → extract: sender, subject, date, venue, details
- "invoice_receipt" — handwritten or printed receipt → extract: line_items (description + amount), total
- "schedule" — work schedule or availability → extract: dates, times, names
- "id_document" — driver's license or ID → extract: name (do NOT extract ID numbers, DOB, or other PII)
- "other" — anything else → describe what you see

You MUST respond with valid JSON: {"type": "<document_type>", "confidence": <0.0-1.0>, "extracted": {<relevant fields>}, "suggested_action": "<what to do in the app>", "summary": "<one sentence description>"}`;

  const messages: ClaudeMessage[] = [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: req.image_media_type || "image/png", data: req.image_base64 } },
      { type: "text", text: "Analyze this image and extract any relevant business data." },
    ],
  }];

  const { reply, usage } = await callClaude(systemPrompt, messages, { maxTokens: 1024 });

  let analysis: Record<string, unknown> = {};
  try {
    analysis = JSON.parse(reply);
  } catch {
    analysis = { type: "other", summary: reply, confidence: 0.5, extracted: {} };
  }

  // Log
  await logMessage(supabase, userId, sessionId, "user", "Uploaded image for analysis", "screenshot_analyze", req.context?.page, { has_image: true });
  const msgId = await logMessage(supabase, userId, sessionId, "assistant", analysis.summary as string || reply, "screenshot_analyze", req.context?.page, { usage, analysis });
  if (msgId) {
    await logAction(supabase, msgId, "screenshot_analyzed", null, undefined, { type: analysis.type, confidence: analysis.confidence });
  }

  return { reply: analysis.summary as string || reply, analysis, session_id: sessionId };
}

// ---------------------------------------------------------------------------
// Smart Intake — turn messy input into real database records
// ---------------------------------------------------------------------------

function getIntakeSystemPrompt(): string { return getBaseSystemPrompt() + `

SMART INTAKE: Turn messy input into database records. Create what you can, draft status for anything incomplete. Never invent data — leave unknown fields null.

TODAY: ${(() => { const d = new Date(); const ct = new Date(d.toLocaleString("en-US", { timeZone: "America/Chicago" })); return ct.getFullYear() + "-" + String(ct.getMonth() + 1).padStart(2, "0") + "-" + String(ct.getDate()).padStart(2, "0"); })()} (Central Time)

RULES: Create clients/pipeline first, then events/invoices referencing them. Resolve relative dates ("tomorrow","Saturday") to YYYY-MM-DD. Times to HH:MM:SS. Use {{ref:TABLE:INDEX}} to link records in same batch (e.g. client_id:"{{ref:clients:0}}").
MATCHING: Only reuse existing record IDs if the business name OR full name is an obvious exact match. Do NOT match on partial first names alone. "Case" in a text message is the SENDER, not necessarily an existing client — the CLIENT is whoever is REQUESTING the service. Create new pipeline/client records when in doubt.

TABLES:
- pipeline: contact_name(req), business_name, phone, email, service_line(events|staffing|both), stage(default:lead|outreach_sent|responded|meeting_scheduled|proposal_sent|under_contract|lost), value, notes
- clients: contact_name(req), business_name, phone, email, address, service_line, client_type(bar|venue|wedding-planner|corporate|greek-org|promoter|private|other), status(default:prospect), notes
- events: date(req,YYYY-MM-DD), client_id, title, venue_name, event_type, service_line, start_time, end_time, staff_needed(int), staff_assigned([{name,staff_id,role}]), status(MUST be:upcoming|confirmed|in-progress|completed|cancelled, default:upcoming), notes
- invoices: client_id(req), service_line, line_items([{description,hours,rate,total}]), subtotal, tax, total, status(ALWAYS "draft"), due_date, notes, internal_line_items([{name,staff_id,role,hours,pay_rate,pay_total}]), event_date, event_start_time, event_end_time, venue_name. invoice_number auto-generated.
- contracts: client_id, staff_id, template_name, title, status(ALWAYS "draft"), field_values(json), signer_email, notes
- staff: name(req), phone, email, role, default_pay_rate, status(default:active), background_check(default:none). Auto-creates w9+agreement docs.
- licenses: staff_id(req), license_type(general|tabc), license_number, issuing_authority, issue_date, expiration_date, notes

RESPOND WITH JSON:
{"interpretation":"<what you understood>","actions":[{"table":"<name>","op":"insert","data":{...}}],"feedback":"<what you created, what's incomplete>","next_steps":["..."],"warnings":["..."]}

For pure questions with no actionable data, return actions:[] and answer in feedback.`; }

async function getExistingRecords(supabase: ReturnType<typeof createClient>) {
  const [
    { data: staff },
    { data: clients },
    { data: pipeline },
  ] = await Promise.all([
    supabase.from("staff").select("id, name, role, email, phone, default_pay_rate, status").eq("status", "active"),
    supabase.from("clients").select("id, contact_name, business_name, email, phone, service_line, status").limit(200),
    supabase.from("pipeline").select("id, contact_name, business_name, email, phone, stage, client_id").limit(200),
  ]);
  return { staff: staff || [], clients: clients || [], pipeline: pipeline || [] };
}

async function generateInvoiceNumber(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data: allNums } = await supabase.from("invoices").select("invoice_number");
  const maxNum = (allNums || []).reduce((max: number, inv: { invoice_number: string }) => {
    const n = parseInt((inv.invoice_number || "").replace("SHD-", ""));
    return isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `SHD-${String(maxNum + 1).padStart(4, "0")}`;
}

function resolveRefs(data: Record<string, unknown>, refMap: Map<string, string[]>): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data)) {
    if (typeof val === "string" && val.startsWith("{{ref:")) {
      const match = val.match(/\{\{ref:(\w+):(\d+)\}\}/);
      if (match) {
        const [, table, indexStr] = match;
        const ids = refMap.get(table) || [];
        resolved[key] = ids[parseInt(indexStr)] || null;
      } else {
        resolved[key] = val;
      }
    } else {
      resolved[key] = val;
    }
  }
  return resolved;
}

async function executeActions(
  supabase: ReturnType<typeof createClient>,
  actions: Array<{ table: string; op: string; data: Record<string, unknown> }>,
  msgId: string | null
): Promise<Array<{ table: string; id: string; success: boolean; error?: string; data: Record<string, unknown> }>> {
  const results: Array<{ table: string; id: string; success: boolean; error?: string; data: Record<string, unknown> }> = [];
  const refMap = new Map<string, string[]>();

  for (const action of actions) {
    const { table, data: rawData } = action;

    // Resolve cross-references
    const data = resolveRefs(rawData, refMap);

    // Table-specific logic
    if (table === "invoices") {
      // Auto-generate invoice number
      if (!data.invoice_number) {
        data.invoice_number = await generateInvoiceNumber(supabase);
      }
      // Ensure draft status
      data.status = "draft";
      // Calculate totals if line_items provided
      if (Array.isArray(data.line_items)) {
        const subtotal = (data.line_items as Array<{ total?: number }>).reduce((s, li) => s + (Number(li.total) || 0), 0);
        data.subtotal = Math.round(subtotal * 100) / 100;
        data.total = Math.round((subtotal + (Number(data.tax) || 0)) * 100) / 100;
      }
    }

    if (table === "contracts") {
      data.status = "draft";
    }

    if (table === "pipeline") {
      data.stage = data.stage || "lead";
      const validStages = ["lead", "outreach_sent", "responded", "meeting_scheduled", "proposal_sent", "under_contract", "lost"];
      if (data.stage && !validStages.includes(data.stage as string)) data.stage = "lead";
      const validServiceLines = ["events", "staffing", "both"];
      if (data.service_line && !validServiceLines.includes(data.service_line as string)) data.service_line = "events";
    }

    if (table === "clients") {
      data.status = data.status || "prospect";
      const validServiceLines = ["events", "staffing", "both"];
      if (data.service_line && !validServiceLines.includes(data.service_line as string)) data.service_line = "events";
      const validStatuses = ["active", "inactive", "prospect"];
      if (data.status && !validStatuses.includes(data.status as string)) data.status = "prospect";
    }

    if (table === "events") {
      data.status = data.status || "upcoming";
      // Ensure staff_assigned is an array
      if (data.staff_assigned && !Array.isArray(data.staff_assigned)) {
        data.staff_assigned = [];
      }
    }

    try {
      const { data: row, error } = await supabase
        .from(table)
        .insert([data])
        .select("id")
        .single();

      if (error) {
        console.error(`Insert into ${table} failed:`, error.message);
        results.push({ table, id: "", success: false, error: error.message, data });
        continue;
      }

      const id = row.id;
      results.push({ table, id, success: true, data: { ...data, id } });

      // Track for cross-references
      if (!refMap.has(table)) refMap.set(table, []);
      refMap.get(table)!.push(id);

      // Post-insert cascades
      if (table === "staff") {
        // Auto-create contractor docs (w9 + agreement)
        await supabase.from("contractor_docs").insert([
          { staff_id: id, doc_type: "w9", status: "missing" },
          { staff_id: id, doc_type: "agreement", status: "missing" },
        ]);
      }

      // Link pipeline to client if both were just created
      if (table === "clients") {
        const pipelineIds = refMap.get("pipeline") || [];
        if (pipelineIds.length > 0) {
          // Link the most recent pipeline deal to this client
          const dealId = pipelineIds[pipelineIds.length - 1];
          await supabase.from("pipeline").update({
            client_id: id,
            last_activity: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq("id", dealId);
        }
      }

      // Link event to invoice if both created
      if (table === "invoices") {
        const eventIds = refMap.get("events") || [];
        if (eventIds.length > 0) {
          const eventId = eventIds[eventIds.length - 1];
          await supabase.from("events").update({
            invoice_id: id,
            updated_at: new Date().toISOString(),
          }).eq("id", eventId);
        }
      }

      // Log action
      if (msgId) {
        await logAction(supabase, msgId, `record_created`, table, id, data);
      }
    } catch (e) {
      console.error(`Error inserting into ${table}:`, e);
      results.push({ table, id: "", success: false, error: e.message, data });
    }
  }

  return results;
}

async function handleIntake(
  supabase: ReturnType<typeof createClient>,
  req: AssistantRequest,
  userId: string
): Promise<{ reply: string; actions_taken: unknown[]; session_id: string; intake: boolean }> {
  const sessionId = req.session_id || crypto.randomUUID();
  const page = req.context?.page;
  const hasImage = !!req.image_base64;

  // Fetch existing records so Claude can match names
  const existing = await getExistingRecords(supabase);

  // Build the prompt
  const staffList = existing.staff.map(s => `${s.name}(${s.id},${s.role || ''},$${s.default_pay_rate || 0})`).join(", ");
  const clientList = existing.clients.map(c => `${c.contact_name}${c.business_name ? '/' + c.business_name : ''}(${c.id})`).join(", ");
  const dealList = existing.pipeline.map(p => `${p.contact_name}${p.business_name ? '/' + p.business_name : ''}(${p.id},${p.stage}${p.client_id ? ',cid:' + p.client_id : ''})`).join(", ");

  const existingContext = `\nSTAFF: ${staffList || 'none'}\nCLIENTS: ${clientList || 'none'}\nDEALS: ${dealList || 'none'}`;

  const systemPrompt = getIntakeSystemPrompt() + existingContext;

  // Build messages (text + optional image)
  const contentParts: Array<{ type: string; [k: string]: unknown }> = [];
  if (hasImage) {
    contentParts.push({
      type: "image",
      source: { type: "base64", media_type: req.image_media_type || "image/png", data: req.image_base64 },
    });
  }
  contentParts.push({
    type: "text",
    text: req.message || "Process this image and create the appropriate records.",
  });

  const messages: ClaudeMessage[] = [{ role: "user", content: contentParts }];

  // Log user message
  await logMessage(supabase, userId, sessionId, "user", req.message || "(image upload)", "intake", page, { has_image: hasImage });

  // Call Claude
  const { reply, usage } = await callClaude(systemPrompt, messages, { maxTokens: 4096 });

  // Parse Claude's response
  let plan: {
    interpretation?: string;
    actions?: Array<{ table: string; op: string; data: Record<string, unknown> }>;
    feedback?: string;
    next_steps?: string[];
    warnings?: string[];
  } = {};

  try {
    // Try to extract JSON from the response (Claude sometimes wraps in markdown)
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      plan = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // If JSON parse fails, treat as a conversational response
    plan = {
      interpretation: "Couldn't parse structured response",
      actions: [],
      feedback: reply,
      next_steps: [],
      warnings: [],
    };
  }

  // Execute the action plan
  const actions = plan.actions || [];
  let actionResults: Array<{ table: string; id: string; success: boolean; error?: string; data: Record<string, unknown> }> = [];

  const msgId = await logMessage(supabase, userId, sessionId, "assistant", plan.feedback || reply, "intake", page, {
    usage,
    interpretation: plan.interpretation,
    action_count: actions.length,
    next_steps: plan.next_steps,
    warnings: plan.warnings,
  });

  if (actions.length > 0) {
    actionResults = await executeActions(supabase, actions, msgId);
  }

  // Build the response
  const createdRecords = actionResults
    .filter((r) => r.success)
    .map((r) => ({
      table: r.table,
      id: r.id,
      // Pull key display fields from the data
      label: (r.data.contact_name || r.data.name || r.data.title || r.data.invoice_number || r.data.template_name || r.table) as string,
      status: (r.data.status || r.data.stage || "created") as string,
      extra: r.table === "invoices" ? `$${Number(r.data.total || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}` :
             r.table === "events" ? `${r.data.date}${r.data.start_time ? " " + r.data.start_time : ""}` :
             r.table === "pipeline" ? `$${Number(r.data.value || 0).toLocaleString()}` :
             null,
    }));

  const failedRecords = actionResults.filter((r) => !r.success);

  // Build the full reply text — use actual results, not just Claude's plan
  let fullReply = "";
  if (plan.interpretation) fullReply += plan.interpretation + "\n\n";

  // Show what was ACTUALLY created (from DB results, not Claude's prediction)
  if (createdRecords.length > 0) {
    const recordSummary = createdRecords.map((r) => {
      const label = r.label || r.table;
      const tableLabel = r.table === "pipeline" ? "lead" : r.table === "clients" ? "client" : r.table === "events" ? "event" : r.table === "invoices" ? "draft invoice" : r.table === "contracts" ? "draft contract" : r.table === "staff" ? "staff member" : r.table;
      return `**${tableLabel}** for ${label}${r.extra ? ` (${r.extra})` : ""} — ${r.status}`;
    }).join("\n");
    fullReply += "**Created:**\n" + recordSummary + "\n\n";
  }

  if (plan.feedback) fullReply += plan.feedback;
  if (plan.next_steps && plan.next_steps.length > 0) {
    fullReply += "\n\n**Next steps:**\n" + plan.next_steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  }
  if (plan.warnings && plan.warnings.length > 0) {
    fullReply += "\n\n**Heads up:** " + plan.warnings.join(" ");
  }
  if (failedRecords.length > 0) {
    fullReply += "\n\n**Failed to create:** " + failedRecords.map((r) => `${r.table}: ${r.error}`).join(", ");
  }

  return {
    reply: fullReply,
    actions_taken: createdRecords,
    session_id: sessionId,
    intake: true,
  };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body: AssistantRequest = await req.json();
    const { action } = body;

    if (!action) {
      return new Response(JSON.stringify({ error: "action is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = getSupabase();

    // Extract user ID from auth header (optional — edge function uses service role,
    // but we pass the user's JWT for identity)
    let userId = "anonymous";
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) userId = user.id;
    }

    let result: Record<string, unknown>;

    switch (action) {
      case "chat":
        result = await handleChat(supabase, body, userId);
        break;

      case "daily_briefing":
        result = await handleDailyBriefing(supabase, userId, body.context?.page);
        break;

      case "lead_score":
        result = await handleLeadScore(supabase, body, userId);
        break;

      case "follow_up_draft":
        result = await handleFollowUpDraft(supabase, body, userId);
        break;

      case "client_health":
        result = await handleClientHealth(supabase, body, userId);
        break;

      case "duplicate_check":
        result = await handleDuplicateCheck(supabase, body);
        break;

      case "screenshot_analyze":
        result = await handleScreenshotAnalyze(supabase, body, userId);
        break;

      case "intake":
        result = await handleIntake(supabase, body, userId);
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("claude-assistant error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
