# Sheepdog Project — System Overview

Everything a new Claude Code session needs to pick up where we left off.

## Architecture

Two repos, one Supabase project, one Resend account. No new repos needed.

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

## Edge Function: contact-submit

**This is the most critical piece. If this breaks, the client's live website cannot intake leads.**

- **Endpoint:** `https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/contact-submit`
- **Source:** `supabase/functions/contact-submit/index.ts`
- **Method:** POST (no auth required — public form)
- **CORS:** locked to `sheepdogtexas.com` and `www.sheepdogtexas.com`

### Deploy command (CRITICAL)

```bash
npx supabase functions deploy contact-submit --project-ref sezzqhmsfulclcqmfwja --no-verify-jwt
```

**ALWAYS use `--no-verify-jwt`.** The contact form is public — no auth token is sent. Without this flag, Supabase re-enables JWT verification on every deploy, which silently returns 401 on all form submissions and breaks lead intake.

### What it does

1. Validates + sanitizes input (name, phone, email, service, message)
2. Checks honeypot (`website` field — if filled, silently returns 200)
3. Rate limits: 5 requests per IP per 10 minutes (stored in `rate_limits` table)
4. Validates email format + DNS MX record check
5. Inserts into `contact_submissions` table
6. Auto-creates a deal in `pipeline` table with proper columns
7. Sends internal notification email to team via Resend
8. Sends confirmation email to submitter via Resend
9. Returns `{ success: true }`

### Email recipients (hardcoded in edge function)

- **Internal notification to:** benschultz519@gmail.com, Joshk1288@gmail.com, sheepdogsecurityllc@gmail.com
- **From:** `Sheepdog Lead <noreply@sheepdogtexas.com>`
- **Reply-to on internal:** submitter's email (so owners can reply directly to the lead)
- **Confirmation to:** submitter's email
- **From:** `Sheepdog <noreply@sheepdogtexas.com>`
- **Reply-to on confirmation:** sheepdogsecurityllc@gmail.com

### Service mapping (form value -> pipeline service_line)

| Form value | Pipeline service_line |
|---|---|
| events-security, events-bartending, events-both, other | events |
| staffing, field-ops, logistics, facility, warehouse, project, ongoing | staffing |

## Edge Function: license-reminders

- **Endpoint:** `https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/license-reminders`
- **Source:** `supabase/functions/license-reminders/index.ts`
- **Method:** GET or POST (no auth — invoked by cron or manual trigger)
- **Deploy:** `npx supabase functions deploy license-reminders --project-ref sezzqhmsfulclcqmfwja --no-verify-jwt`

### What it does

1. Queries all licenses with expiration dates, joins staff names
2. Checks for licenses expiring in 30, 14, or 7 days, plus already expired
3. Builds color-coded HTML email (red for expired, amber for expiring)
4. Sends to all 3 owners via Resend
5. Returns JSON with reminder count and email result

### Email recipients (same as contact-submit)

- benschultz519@gmail.com, Joshk1288@gmail.com, sheepdogsecurityllc@gmail.com
- **From:** `Sheepdog Compliance <noreply@sheepdogtexas.com>`

### Cron setup

Enable `pg_cron` in Supabase Dashboard → Database → Extensions, then schedule a daily invocation.

## Database Tables

### pipeline

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| client_id | uuid | FK to clients, nullable |
| contact_name | text | Person's name |
| business_name | text | Company/venue |
| phone | text | |
| email | text | |
| service_line | text | 'events', 'staffing', or 'both' |
| stage | text | See stages below |
| value | numeric | Estimated deal value |
| source | text | 'contact_form' or null (manual) |
| notes | text | Message from form or manual notes |
| next_action | text | |
| last_activity | timestamptz | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

**Pipeline stages:** lead -> outreach_sent -> responded -> meeting_scheduled -> proposal_sent -> under_contract -> lost

### contact_submissions

| Column | Type |
|--------|------|
| id | uuid |
| name | text |
| phone | text |
| email | text |
| company | text |
| service | text |
| message | text |
| created_at | timestamptz |

### clients

| Column | Type |
|--------|------|
| id | uuid |
| contact_name | text |
| business_name | text |
| phone | text |
| email | text |
| address | text |
| service_line | text ('events', 'staffing', 'both') |
| client_type | text ('bar', 'venue', 'wedding-planner', 'corporate', 'greek-org', 'promoter', 'private', 'other') |
| status | text ('active', 'inactive', 'prospect') |
| notes | text |
| created_at | timestamptz |
| updated_at | timestamptz |

### invoices

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| client_id | uuid | FK to clients |
| service_line | text | 'events', 'staffing', 'both' |
| invoice_number | text | Auto-generated SHD-XXXX |
| line_items | jsonb | Client-facing: [{description, hours, rate, total}] |
| subtotal | numeric | Sum of line items |
| tax | numeric | Tax amount |
| total | numeric | subtotal + tax |
| status | text | draft, sent, paid, overdue |
| due_date | date | |
| payment_date | date | When marked paid |
| payment_method | text | cash, check, zelle, venmo, card, ach, other |
| notes | text | Client-facing notes |
| internal_line_items | jsonb | Staff assignments: [{name, staff_id, role, hours, pay_rate, pay_total, paid_out, paid_out_date}] |
| internal_notes | text | Internal-only notes |
| event_date | date | Event/job date |
| event_start_time | time | |
| event_end_time | time | |
| venue_name | text | Event location |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### staff

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| name | text | NOT NULL |
| phone | text | |
| email | text | |
| role | text | e.g. Security Guard, Bartender |
| default_pay_rate | numeric | $/hr default |
| status | text | 'active' or 'inactive' |
| background_check | text | 'none', 'pending', 'cleared' |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### licenses

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| staff_id | uuid | FK to staff |
| license_type | text | 'general' or 'tabc' |
| license_number | text | |
| issuing_authority | text | TDPS, TABC, etc. |
| issue_date | date | |
| expiration_date | date | Used for reminder emails |
| status | text | 'active' |
| notes | text | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### contractor_docs

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| staff_id | uuid | FK to staff |
| doc_type | text | 'w9', 'agreement', 'other' |
| status | text | 'received', 'missing', 'expired' |
| signature_date | date | |
| notes | text | |
| created_at | timestamptz | DEFAULT now() |
| updated_at | timestamptz | DEFAULT now() |

### pay_rate_defaults

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, auto |
| role | text | NOT NULL, e.g. Security Guard |
| service_line | text | NOT NULL, events/staffing/both |
| rate | numeric | NOT NULL, $/hr |
| created_at | timestamptz | DEFAULT now() |

Unique index on (role, service_line) for upsert support.

### Other tables

- **events** — client events (client_id FK, venue_name, event_type, date)
- **rate_limits** — rate limit tracking (ip, endpoint, created_at)
- **contracts, placements, shifts** — exist but are stubs

### RLS

Row Level Security is enabled on ALL tables. Policies require authenticated users for all ops tables. The edge function uses the service role key to bypass RLS.

## Client-Facing Site (sheepdogtexas.com)

Three static HTML pages, each with a contact form:

- `index.html` — homepage, "CONTACT US" button
- `events/index.html` — events landing page, "GET A QUOTE" button
- `staffing/index.html` — staffing landing page, "GET A QUOTE" button

All three forms share `js/form.js` which contains `submitForm()`, `handlePhone()`, `formatPhone()`, `toggleMobileNav()`, and `toggleFaq()`. Each page defines `SUPABASE_URL` inline before loading the shared script. Page-specific JS (splash animation, hero cards, rail panels) remains inline.

The form fields are: name, phone, email, service (dropdown), message, company (staffing only), website (honeypot, hidden).

**Google Analytics:** G-1ZT2F15325

## Operations App (app.sheepdogtexas.com)

Vite + React 19 + React Router v7 + Supabase JS client.

### App routes

| Route | Page | Status |
|-------|------|--------|
| /login | Login | Ready |
| /reset-password | Password reset | Ready |
| / | Hub (dashboard) | Ready |
| /pipeline | Sales pipeline (Kanban) | Ready |
| /submissions | Contact form submissions viewer | Ready |
| /clients | Client management (CRUD) | Ready |
| /resources | Docs, guides, templates | Ready |
| /scheduling | Events/staffing calendars | Coming soon |
| /financials | Invoices, payouts, staff earnings/1099 | Ready |
| /compliance | Staff roster, licenses, TABC, contractor docs | Ready |

All routes except /login and /reset-password are protected (require Supabase auth session).

### Mobile layout

The app has responsive CSS with breakpoints at 1024px (tablet) and 768px (mobile).

On mobile:
- Sidebar becomes a bottom tab bar with 4 primary tabs + "More" overflow menu
- **Bottom nav tabs:** Dashboard, Clients, Pipeline, Financials, More
- **More menu:** Submissions, Resources, Scheduling, Compliance, Log Out
- Pipeline columns stack vertically, empty columns collapse to headers only
- Stage-change dropdown appears on pipeline cards (since drag-and-drop doesn't work on touch)
- Tables convert to stacked card layout
- Modals slide up as bottom sheets with stacked fields

### Key files

- `app/src/App.jsx` — router + auth provider + 404 catch-all
- `app/src/lib/supabase.js` — Supabase client init
- `app/src/pages/Pipeline.jsx` — Kanban board with drag-and-drop (desktop) / stage dropdown (mobile)
- `app/src/pages/Submissions.jsx` — read-only submissions table with error state
- `app/src/pages/Clients.jsx` — full CRUD for clients with error state
- `app/src/components/Layout.jsx` — sidebar nav + mobile bottom tab bar with More menu
- `app/src/components/ProtectedRoute.jsx` — auth guard (uses onAuthStateChange only, no race condition)
- `app/src/App.css` — all styles (responsive at 1024px and 768px)
- `js/form.js` — shared contact form JS (used by static site, not the app)
- `scripts/deploy-edge.sh` — edge function deploy script with --no-verify-jwt baked in
- `supabase/schema.sql` — database schema, RLS policies, and indexes (source of truth)

### Deploy the app

```bash
cd app && npm run deploy
```

This builds with Vite and pushes to the `sheepdog-app` repo via gh-pages.

### Deploy the edge function

```bash
bash scripts/deploy-edge.sh
```

This deploys with `--no-verify-jwt` and auto-tests the endpoint. **Never deploy the edge function any other way.**

## Resend (Email)

- **Domain:** sheepdogtexas.com (verified, GoDaddy DNS)
- **API key name:** "contact form 1" (stored as Supabase secret `RESEND_API_KEY`)
- **Region:** us-east-1
- **Sender:** noreply@sheepdogtexas.com

## Environment Files

### app/.env

```
VITE_SUPABASE_URL=https://sezzqhmsfulclcqmfwja.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon key>
```

## Data Flow: Contact Form -> Pipeline

```
Website visitor fills form
  -> submitForm() in HTML
  -> POST to edge function (no auth)
  -> Validates, rate limits, honeypot check
  -> INSERT into contact_submissions
  -> INSERT into pipeline (contact_name, email, phone, service_line, stage='lead', source='contact_form', notes=message)
  -> Resend: internal email to team (reply-to = submitter)
  -> Resend: confirmation email to submitter (reply-to = sheepdog)
  -> Return { success: true }
```

Leads appear in the Pipeline page of the app as cards in the "Lead" column.

## Known Issues / Watch Out For

1. **--no-verify-jwt** — Cannot stress this enough. Every edge function deploy without this flag breaks the live contact form. Use `scripts/deploy-edge.sh` which has it baked in.
2. **Rate limiter** — 5 per IP per 10 min. During testing, you'll get blocked. Clear the `rate_limits` table via Supabase SQL editor: `DELETE FROM rate_limits;`
3. **Supabase dashboard is slow** — SQL editor and table editor load slowly. Be patient or use CLI/curl instead.
4. **Pipeline.jsx uses drag-and-drop** — has optimistic updates with rollback on error. On mobile, a stage-change dropdown replaces drag.
5. **Scheduling, Financials, Compliance pages** — routes exist but components are stubs (show "coming soon").
6. **Docker not installed** — `supabase db dump` requires Docker. Schema is manually maintained in `supabase/schema.sql` instead.
7. **Audit tracker** — `AUDIT-2.md` has 87 remaining findings. 27 fixed so far.
