// Shared Stripe client for edge functions.
//
// Usage:
//   import { getStripe, isStripeConfigured, stripeApi } from "../_shared/stripe.ts";
//
//   if (!isStripeConfigured()) return gracefulFallback();
//   const stripe = getStripe();
//   const intent = await stripeApi.paymentIntents.create(stripe, { amount: 1000, currency: "usd" });
//
// This module deliberately avoids the npm Stripe SDK (which pulls in Node
// polyfills on Deno edge). Instead we hit the REST API directly with fetch —
// smaller cold starts, no dependency pinning headaches.

const STRIPE_API_BASE = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2024-12-18.acacia";

export interface StripeClient {
  secretKey: string;
  accountId?: string; // for Stripe Connect usage later
}

export function isStripeConfigured(): boolean {
  return !!Deno.env.get("STRIPE_SECRET_KEY");
}

export function getStripe(): StripeClient {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured. Set via: npx supabase secrets set STRIPE_SECRET_KEY=sk_...");
  }
  return { secretKey };
}

// Encode an object as application/x-www-form-urlencoded in the shape Stripe
// expects (nested keys become bracketed: metadata[foo]=bar).
export function encodeStripeForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue;
    const encodedKey = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          parts.push(encodeStripeForm(item as Record<string, unknown>, `${encodedKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${encodedKey}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (typeof val === "object") {
      parts.push(encodeStripeForm(val as Record<string, unknown>, encodedKey));
    } else {
      parts.push(`${encodeURIComponent(encodedKey)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripeRequest<T = any>(
  client: StripeClient,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${client.secretKey}`,
    "Stripe-Version": STRIPE_API_VERSION,
  };
  if (client.accountId) headers["Stripe-Account"] = client.accountId;
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  let url = `${STRIPE_API_BASE}${path}`;
  let reqBody: string | undefined;

  if (method === "POST" && body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    reqBody = encodeStripeForm(body);
  } else if (method === "GET" && body && Object.keys(body).length > 0) {
    url += `?${encodeStripeForm(body)}`;
  }

  const res = await fetch(url, { method, headers, body: reqBody });

  // Stripe's edge/CDN can return non-JSON on 5xx (HTML error page). Read as
  // text first, then parse, so we don't throw an opaque SyntaxError.
  const text = await res.text();
  let json: any = null;
  if (text) {
    try { json = JSON.parse(text); } catch { /* leave json null; use text below */ }
  }

  if (!res.ok) {
    const msg = json?.error?.message || text?.slice(0, 200) || `Stripe API error ${res.status}`;
    const err = new Error(msg) as Error & { stripeError?: unknown; status?: number };
    err.stripeError = json?.error ?? { raw: text };
    err.status = res.status;
    throw err;
  }
  return json as T;
}

// Thin typed wrappers for the specific calls we use. Expand as needed.
export const stripeApi = {
  customers: {
    create: (c: StripeClient, body: Record<string, unknown>, idempotencyKey?: string) =>
      stripeRequest(c, "POST", "/customers", body, idempotencyKey),
    retrieve: (c: StripeClient, id: string) =>
      stripeRequest(c, "GET", `/customers/${id}`),
  },
  paymentIntents: {
    create: (c: StripeClient, body: Record<string, unknown>, idempotencyKey?: string) =>
      stripeRequest(c, "POST", "/payment_intents", body, idempotencyKey),
    retrieve: (c: StripeClient, id: string, expand?: string[]) =>
      stripeRequest(c, "GET", `/payment_intents/${id}`, expand ? { expand } : undefined),
    update: (c: StripeClient, id: string, body: Record<string, unknown>) =>
      stripeRequest(c, "POST", `/payment_intents/${id}`, body),
    cancel: (c: StripeClient, id: string) =>
      stripeRequest(c, "POST", `/payment_intents/${id}/cancel`),
  },
  paymentMethods: {
    retrieve: (c: StripeClient, id: string) =>
      stripeRequest(c, "GET", `/payment_methods/${id}`),
  },
  charges: {
    retrieve: (c: StripeClient, id: string, expand?: string[]) =>
      stripeRequest(c, "GET", `/charges/${id}`, expand ? { expand } : undefined),
  },
  balanceTransactions: {
    retrieve: (c: StripeClient, id: string) =>
      stripeRequest(c, "GET", `/balance_transactions/${id}`),
  },
};

// Verify a Stripe webhook signature. Stripe signs the raw body with HMAC-SHA256
// using the webhook signing secret. We reimplement the check here because the
// Stripe Node SDK's helper doesn't ship a Deno-compatible build.
//
// Header format: `t=TIMESTAMP,v1=SIG1[,v1=SIG2,...]`
export async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(",").map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2);

  // Only accept well-formed v1 signatures (64 lowercase hex chars for SHA-256).
  // Stripe may send multiple during key rotation — we must validate each.
  const signatures = parts
    .filter((p) => p.startsWith("v1="))
    .map((p) => p.slice(3))
    .filter((s) => /^[a-f0-9]{64}$/.test(s));

  if (!timestamp || signatures.length === 0) return false;

  const ts = parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return false;

  // One-sided tolerance: reject old timestamps (replay defense) but allow
  // small future drift from clock skew. Stripe's reference implementation
  // only checks for "too old", not "too new".
  const nowSec = Math.floor(Date.now() / 1000);
  if (ts < nowSec - toleranceSeconds) return false;

  const payload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison against any provided v1 signatures
  return signatures.some((given) => timingSafeEqual(given, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
