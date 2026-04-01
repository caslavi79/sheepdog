# Sheepdog Project — System Overview

Everything a new Claude Code session needs to pick up where we left off.

## Architecture

Two repos, one Supabase project, one Resend account.

| Layer | URL | Repo | Hosting |
|-------|-----|------|---------|
| Client-facing site | sheepdogtexas.com | github.com/caslavi79/sheepdog | GitHub Pages (static HTML) |
| Backend operations app | app.sheepdogtexas.com | github.com/caslavi79/sheepdog-app | GitHub Pages (Vite/React) |
| Database + Auth + Edge Functions | sezzqhmsfulclcqmfwja.supabase.co | — | Supabase (cloud) |
| Transactional email | Resend (noreply@sheepdogtexas.com) | — | Resend (cloud) |

The client-facing site and the app code both live in the `sheepdog` repo. The `sheepdog-app` repo is just the deploy target for the built app.

## Supabase

- **Project ref:** `sezzqhmsfulclcqmfwja`
- **URL:** `https://sezzqhmsfulclcqmfwja.supabase.co`
- **Anon key (public):** in `app/.env` as `VITE_SUPABASE_ANON_KEY`
- **Service role key:** stored as Supabase secret (never in code)

### Secrets (set via `npx supabase secrets set`)

- `RESEND_API_KEY` — Resend API key for sending emails
- `SUPABASE_URL` — auto-set by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — auto-set by Supabase
- `BRAND_NAME` — "Sheepdog Security LLC" (used by contract edge functions)
- `BRAND_FROM_EMAIL` — "noreply@sheepdogtexas.com"
- `BRAND_REPLY_TO` — "sheepdogsecurityllc@gmail.com"
- `BRAND_COLOR` — "#0C0C0C"
- `BRAND_LOGO_URL` — "https://sheepdogtexas.com/favicon.jpg"
- `SIGNING_BASE_URL` — "https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/contract-sign"

The BRAND_* secrets make the contract signing system reusable for other businesses — swap them out, upload new templates, zero code changes.

## Edge Functions (4 total)

### Deploy command (CRITICAL)

```bash
bash scripts/deploy-edge.sh
```

This deploys ALL 4 functions with `--no-verify-jwt` and verifies each endpoint. **Never deploy edge functions any other way.** Without `--no-verify-jwt`, Supabase re-enables JWT verification and public functions (contact form, signing page) silently break.

### contact-submit

**The most critical piece. If this breaks, the client's live website cannot intake leads.**

- **Endpoint:** `https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/contact-submit`
- **Source:** `supabase/functions/contact-submit/index.ts`
- **Method:** POST (no auth — public form)
- **CORS:** locked to `sheepdogtexas.com` and `www.sheepdogtexas.com`

What it does: validates + sanitizes input, checks honeypot, rate limits (5/IP/10min), validates email + DNS MX, inserts into `contact_submissions`, auto-creates pipeline deal, sends internal + confirmation emails via Resend.

### license-reminders

- **Endpoint:** `.../functions/v1/license-reminders`
- **Source:** `supabase/functions/license-reminders/index.ts`
- **Method:** GET or POST (no auth — invoked by cron)

Checks license expirations, sends email alerts at 30/14/7 days + when expired. Color-coded HTML. Emails all 3 owners.

### contract-sign

- **Endpoint:** `.../functions/v1/contract-sign`
- **Source:** `supabase/functions/contract-sign/index.ts`
- **Method:** GET + POST (no auth — public signing page)

GET renders branded signing page with filled contract + signature canvas. POST captures signature (base64), signer name, IP, timestamp. Sends confirmation emails. Double-sign protection via atomic status check.

### contract-send

- **Endpoint:** `.../functions/v1/contract-send`
- **Source:** `supabase/functions/contract-send/index.ts`
- **Method:** POST (called from app)

Sends contract email via Resend with branded "Review & Sign" button. Validates contract exists, has content, isn't already signed. Updates status to 'sent'.

### Email recipients (hardcoded in edge functions)

- benschultz519@gmail.com, Joshk1288@gmail.com, sheepdogsecurityllc@gmail.com

## Database Tables

### pipeline
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to clients, nullable |
| contact_name, business_name, phone, email | text | |
| service_line | text | 'events', 'staffing', 'both' |
| stage | text | lead → outreach_sent → responded → meeting_scheduled → proposal_sent → under_contract → lost |
| value | numeric | |
| source | text | 'contact_form' or null |
| notes, next_action | text | |
| last_activity, created_at, updated_at | timestamptz | |

### clients
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| contact_name, business_name, phone, email, address | text | |
| service_line | text | events/staffing/both |
| client_type | text | bar, venue, wedding-planner, corporate, greek-org, promoter, private, other |
| status | text | active, inactive, prospect |
| notes | text | |
| created_at, updated_at | timestamptz | |

### invoices
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to clients |
| service_line | text | |
| invoice_number | text | Auto-generated SHD-XXXX |
| line_items | jsonb | Client-facing: [{description, hours, rate, total}] |
| subtotal, tax, total | numeric | |
| status | text | draft, sent, paid, overdue |
| due_date, payment_date | date | |
| payment_method | text | cash, check, zelle, venmo, card, ach, other |
| notes | text | Client-facing |
| internal_line_items | jsonb | Staff: [{name, staff_id, role, hours, pay_rate, pay_total, paid_out, paid_out_date}] |
| internal_notes | text | |
| event_date | date | |
| event_start_time, event_end_time | time | |
| venue_name | text | |
| created_at, updated_at | timestamptz | |

### staff
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | text | NOT NULL |
| phone, email, role | text | |
| default_pay_rate | numeric | $/hr |
| status | text | active, inactive |
| background_check | text | none, pending, cleared |
| created_at, updated_at | timestamptz | |

### licenses
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| staff_id | uuid | FK to staff |
| license_type | text | general, tabc |
| license_number, issuing_authority | text | |
| issue_date, expiration_date | date | |
| status | text | active |
| notes | text | |
| created_at, updated_at | timestamptz | |

### contractor_docs
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| staff_id | uuid | FK to staff |
| doc_type | text | w9, agreement, other |
| status | text | received, missing, expired |
| signature_date | date | |
| notes | text | |
| created_at, updated_at | timestamptz | |

### contracts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to clients |
| template_name, title | text | |
| status | text | draft, sent, viewed, signed |
| field_values | jsonb | Filled form data |
| filled_html | text | Rendered contract HTML (frozen at send) |
| signer_name, signer_email | text | |
| signature_data | text | Base64 signature image |
| signed_at | timestamptz | |
| signer_ip | text | Audit trail |
| sign_token | uuid | UNIQUE — used in signing URL |
| sent_at | timestamptz | |
| notes | text | |
| created_at, updated_at | timestamptz | |

### events
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to clients |
| title, venue_name | text | |
| event_type | text | bar shift, wedding, etc. |
| service_line | text | |
| date | text | |
| start_time, end_time | time | |
| staff_needed | integer | |
| staff_assigned | jsonb | [{name, staff_id, role}] |
| status | text | scheduled, confirmed, in_progress, completed, cancelled |
| invoice_id | uuid | FK to invoices (nullable) |
| placement_id | uuid | |
| notes | text | |
| created_at, updated_at | timestamptz | |

### placements
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to clients |
| title, venue_name | text | |
| service_line | text | |
| schedule_pattern | text | e.g. "mon,tue,wed,thu,fri" |
| start_date, end_date | date | |
| default_start_time, default_end_time | time | |
| staff_needed | integer | |
| default_staff | jsonb | |
| status | text | active, paused, ended |
| notes | text | |
| created_at, updated_at | timestamptz | |

### pay_rate_defaults
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| role | text | NOT NULL |
| service_line | text | NOT NULL |
| rate | numeric | NOT NULL, $/hr |
| created_at | timestamptz | |

Unique index on (role, service_line).

### Other tables
- **contact_submissions** — form submissions (name, phone, email, company, service, message)
- **rate_limits** — rate limit tracking (ip, endpoint, created_at)
- **shifts** — stub (not yet used)

### RLS
Row Level Security enabled on ALL tables. "authenticated only" policy on all ops tables. Edge functions use service role key to bypass RLS.

## Client-Facing Site (sheepdogtexas.com)

Three static HTML pages with shared `js/form.js`:
- `index.html` — homepage
- `events/index.html` — events landing
- `staffing/index.html` — staffing landing

All internal links use trailing slashes (`/events/`, `/staffing/`) matching canonical URLs and sitemap. Google Analytics: G-1ZT2F15325.

## Operations App (app.sheepdogtexas.com)

Vite + React 19 + React Router v7 + Supabase JS client.

### App routes (ALL ACTIVE — no stubs)

| Route | Page | What it does |
|-------|------|--------------|
| /login | Login | Email/password auth |
| /reset-password | ResetPassword | Password recovery |
| / | Hub | Dashboard with stats + alert banners (overdue invoices, expiring licenses, missing docs) |
| /pipeline | Pipeline | Kanban board with drag-drop (desktop) / stage dropdown (mobile) |
| /clients | Clients | Full CRUD, search, filters, pagination. Detail panel shows events, invoices, contracts |
| /contracts | Contracts | Contract table + side-by-side fill/preview editor. Template picker, auto-fill from client, send for e-signing |
| /resources | Resources | 33 docs across 10 categories (brand, outreach, reviews, contracts, ops). "Fill & Send" links to /contracts |
| /scheduling | Scheduling | Calendar (month view), Events list (CRUD + staff assignment), Placements (recurring + event generation) |
| /financials | Financials | 3 tabs: Invoices (CRUD, dual client/internal view, payout tracking), Payouts (unpaid staff), Staff Earnings (1099) |
| /compliance | Compliance | 3 tabs: Staff Roster (CRUD), Licenses & Certs (expiration tracking), Contractor Docs (W-9, agreements) |

### Shared utilities
- `app/src/lib/format.js` — fmtMoney, fmtDate, daysUntil, badgeStyle, COLORS
- `app/src/lib/hooks.js` — useEscapeKey, useBodyLock, useToast
- `app/src/lib/supabase.js` — Supabase client init

### Key files
- `app/src/App.jsx` — router
- `app/src/App.css` — all styles (responsive at 1024px and 768px)
- `app/src/components/Layout.jsx` — sidebar nav + mobile bottom tab bar
- `app/src/components/ProtectedRoute.jsx` — auth guard
- `scripts/deploy-edge.sh` — deploys all 4 edge functions with --no-verify-jwt
- `supabase/schema.sql` — database schema source of truth
- `js/form.js` — shared contact form JS (static site only)

### Deploy the app

```bash
cd app && npm run deploy
```

Builds with Vite and pushes to `sheepdog-app` repo via gh-pages.

### Deploy edge functions

```bash
bash scripts/deploy-edge.sh
```

Deploys all 4 functions with `--no-verify-jwt` and verifies each endpoint.

## Resend (Email)

- **Domain:** sheepdogtexas.com (verified, us-east-1)
- **API key:** "contact form 1" — full access
- **Sender:** noreply@sheepdogtexas.com

## Data Flows

### Contact Form → Pipeline
```
Website form → POST edge function → validate → INSERT contact_submissions
→ INSERT pipeline (stage='lead', source='contact_form') → Resend emails
```

### Contract Signing
```
App: pick template → fill fields → save to contracts table → call contract-send
→ Resend email with signing link → client clicks link → contract-sign renders page
→ client signs → POST signature → UPDATE contracts (signed) → Resend confirmations
```

### Invoice → Payout
```
Create invoice with internal staff assignments → mark invoice as paid
→ Payouts tab shows unpaid staff → mark staff as paid → appears in Staff Earnings
→ 1099 flag if YTD ≥ $600
```

### Scheduling → Invoice
```
Create event (or generate from placement) → assign staff → "Create Invoice" button
→ navigates to /financials with pre-filled event data
```

## Known Issues / Watch Out For

1. **--no-verify-jwt** — CRITICAL. Use `scripts/deploy-edge.sh` which has it baked in for all 4 functions.
2. **Rate limiter** — 5/IP/10min. During testing: `DELETE FROM rate_limits;`
3. **Docker not installed** — Schema manually maintained in `supabase/schema.sql`.
4. **Overdue auto-detection** — Invoices with status 'sent' past due_date show as 'overdue' in UI (computed, not stored).
5. **License warnings** — Staff assignments editor shows red/amber border when assigning staff with expired/expiring licenses.
6. **Cascade deletes** — Deleting staff in Compliance cascades to licenses + contractor_docs (app-level, not DB-level). Deleting clients does NOT cascade invoices/events/contracts.
7. **Invoice numbers** — Generated from last invoice number (not count), but still has small race window for concurrent users.

## Completed Audits

- AUDIT.md — original audit (all resolved)
- AUDIT-2.md — 114 findings across 6 categories (all resolved)
- Multiple targeted audits on Financials, Compliance, Scheduling, Contracts, edge functions (all resolved)
