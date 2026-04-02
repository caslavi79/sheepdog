# Session Summary — Claude API Integration (April 1-2, 2026)

## What Was Built

### Phase 1: Database Schema
- **3 new tables** created in Supabase:
  - `assistant_messages` — conversation history (user_id, session_id, role, content, action_type, context_page, metadata)
  - `assistant_actions` — audit log of every record Claude created (message_id, action_type, target_table, target_id, payload)
  - `smart_emails` — email queue for AI-generated emails (trigger_type, recipient, subject, html_body, status)
- RLS enabled on all three with `authenticated only` + `WITH CHECK` policy
- **Staff table extended** with: address, city, state, zip columns

### Phase 2: claude-assistant Edge Function (Central AI Gateway)
- **File:** `supabase/functions/claude-assistant/index.ts`
- **8 action handlers:**
  - `intake` — THE MAIN ONE. Takes messy text + optional images, creates real DB records (pipeline deals, clients, events, invoices, contracts, staff, licenses). Returns what was created with clickable action cards.
  - `chat` — general Q&A with conversation history
  - `daily_briefing` — generates natural language business summary from all data
  - `lead_score` — scores a pipeline deal 1-10 with reasoning
  - `follow_up_draft` — writes personalized follow-up messages for deals
  - `client_health` — scores client relationship 1-10
  - `duplicate_check` — fuzzy matches against existing pipeline + clients
  - `screenshot_analyze` — OCR/classify uploaded images (legacy, intake handles this now)
- **Business logic in executeActions():** auto-generates invoice numbers (SHD-XXXX), auto-creates contractor docs (w9 + agreement) for new staff, cross-links pipeline↔client and event↔invoice, validates all enum constraints
- **Cost optimizations:** trimmed system prompt, compact existing records context, dynamic date in Central Time

### Phase 3: claude-cron Edge Function (Automated Triggers)
- **File:** `supabase/functions/claude-cron/index.ts`
- **5 trigger types:** stale deals (7d/14d), overdue invoices (3d), tomorrow's events (shift notifications), weekly briefing (Monday)
- Idempotency checks prevent duplicate emails
- Sends via Resend, queues in smart_emails table

### Phase 4: Frontend — AssistantPanel (Smart Intake UI)
- **File:** `app/src/components/AssistantPanel.jsx`
- Slide-out panel from right side, triggered by floating red chat bubble (FAB)
- **Intake-first design:** every message goes to `intake` action — Claude decides what to create
- **Image support:** upload button + drag-and-drop onto panel, images resized to 1024px + JPEG 70% quality before sending (saves ~60-70% on API costs)
- **Action cards:** each created record shows as a clickable card (type badge, key info, status, link to the right page)
- **Markdown rendering:** bold text, numbered lists in Claude's responses
- Session history with new conversation button

### Phase 5: Hub Intelligence
- **Daily Briefing:** "Get Briefing" button on Hub, generates natural language summary, cached in localStorage (once per day)
- **Upload Zone:** drag-and-drop area on Hub for quick image intake

### Phase 6: Pipeline + Client Intelligence
- **Lead Scoring:** "Score Lead" button in deal detail modal, shows score badge (1-10) with reasoning
- **Follow-up Drafts:** "Draft Follow-up" button in deal detail modal, generates personalized outreach with copy button
- **Client Health Score:** "Check Health Score" button in client detail panel
- **Duplicate Detection:** debounced check when adding deals, shows warning banner for matches
- **Submissions Tab:** new tab on Pipeline page showing contact form submissions with view/delete

### Phase 7: Contract Signing Flow (Major Fix)
- **Signing page moved to React app:** `app/src/pages/Sign.jsx` at `/sign?token=xxx` (public route, no auth)
- **Edge function returns JSON** instead of HTML (Supabase blocks HTML from edge functions)
- **SIGNING_BASE_URL** updated to `https://app.sheepdogtexas.com/sign`
- **Signed contract view:** read-only mode showing signer name, date, email, IP, signature image
- **Download/Print:** generates complete document with signature block, audit trail, and ESIGN/UETA legal note
- **contracts_status_check** constraint fixed to allow: draft, sent, viewed, signed
- **contract-send** now updates status to "sent" BEFORE sending email (prevents timeout race condition)

### Fixes Applied During Session
- **RLS WITH CHECK** added to ALL 15 tables (deletes were silently failing)
- **events_status_check** constraint: valid statuses are `upcoming`, `confirmed`, `in-progress`, `completed`, `cancelled` (NOT `scheduled`)
- **pipeline_service_line_check:** added enum validation in executeActions
- **Image media type:** sends actual file type instead of hardcoded `image/jpeg`
- **Toast position:** moved above FAB (bottom: 96px)
- **Pipeline empty state:** removed duplicate "+ ADD DEAL" button
- **Contract editor:** staff dropdown for Staff-category templates (W-9, agreements), client dropdown for others
- **Staff auto-fill in contracts:** fills name, email, phone, role, address fields
- **Contract editor unsaved changes:** tracks dirty state, only warns if edited since last save
- **Delete draft contracts:** button added to editor
- **Delete events from calendar:** delete button in EventModal with confirmation
- **Client delete error message:** now shows "Cannot delete — client has X events, Y invoices"
- **Toast messages:** "Contract sent for signing", "Draft deleted" (not generic "Contract saved")
- **Date/timezone:** all prompts use Central Time (America/Chicago)
- **Matching rules:** Claude won't match partial first names to existing records

## Deploy Script
`scripts/deploy-edge.sh` now deploys 8/8 functions:
1. contact-submit
2. license-reminders
3. contract-sign
4. contract-send
5. invoice-send
6. payment-reminders
7. **claude-assistant** (new)
8. **claude-cron** (new)

## Supabase Secrets
- `ANTHROPIC_API_KEY` — Claude API key
- `CLAUDE_MODEL` — `claude-sonnet-4-20250514`
- `SIGNING_BASE_URL` — `https://app.sheepdogtexas.com/sign`

## Files Created This Session
- `supabase/functions/claude-assistant/index.ts`
- `supabase/functions/claude-cron/index.ts`
- `app/src/components/AssistantPanel.jsx`
- `app/src/lib/assistant.js`
- `app/src/pages/Sign.jsx`

## Files Modified This Session
- `supabase/schema.sql` — 3 new tables + staff address columns
- `supabase/functions/contract-sign/index.ts` — returns JSON instead of HTML
- `supabase/functions/contract-send/index.ts` — status update before email send
- `scripts/deploy-edge.sh` — 8/8 functions
- `app/src/App.jsx` — added /sign route
- `app/src/App.css` — signing page, assistant panel, intake cards, hub upload zone, AI tool components, hub briefing styles
- `app/src/components/Layout.jsx` — FAB + AssistantPanel integration
- `app/src/pages/Hub.jsx` — daily briefing + upload zone
- `app/src/pages/Pipeline.jsx` — lead scoring, follow-ups, duplicate detection, submissions tab, search box fix, empty state fix
- `app/src/pages/Clients.jsx` — health scores, delete error message
- `app/src/pages/Contracts.jsx` — staff dropdown for Staff templates, staff auto-fill with address, signed read-only view, download/print with signature, delete draft, unsaved changes tracking, send timeout handling, status colors
- `app/src/pages/Compliance.jsx` — staff address fields (address, city, state, zip)
- `app/src/pages/Scheduling.jsx` — delete button in EventModal
- `CLAUDE.md` — updated with new functions, tables, secrets, key files

## What's Remaining / Known Issues

### Not Yet Built (from CLAUDE-API-BLUEPRINT.md)
- **Smart email triggers beyond the initial 5** — contract follow-ups (48h not viewed, 72h not signed), client re-engagement (60d inactive), staff onboarding welcome, 1099 threshold warnings, month-end P&L summary
- **Scheduling intelligence** — conflict detection, capacity planning, auto-schedule from text, weather integration
- **Financials intelligence** — auto-invoice from completed events, pricing advisor, cash flow forecast, margin analyzer
- **Compliance intelligence** — onboarding checklist, batch document requests, compliance dashboard score
- **Contract intelligence** — template recommender, smart field fill from event data, contract review before sending
- **Resources intelligence** — smart suggestions, outreach script generator, brand compliance check
- **Cron scheduling** — the claude-cron function exists but no actual cron job is set up in Supabase to trigger it automatically. Needs pg_cron or external trigger.

### Known Bugs / Polish Items
- **Contract intake doesn't populate filled_html** — AI creates contract shell (metadata + field_values) but can't render the HTML template (templates are frontend HTML files). User must open the contract in the editor to see the preview and send.
- **Invoice email send needs client email** — if AI creates an invoice linked to a client without an email, invoice-send fails. AI should be instructed to always save emails on client records when provided.
- **Confirmation emails after signing** — currently sent but don't include a link to view/download the signed document
- **Hub briefing date** — dynamic now but the function getBaseSystemPrompt() creates a fresh date on each call which is correct
- **API costs** — ~2 cents per intake call with Sonnet. Image compression helps but vision is still expensive. Could switch specific low-complexity actions to Haiku to save money.

## CRITICAL: Development & Deploy Workflow

**DO NOT create new repos. Everything lives in the existing structure.**

### Two-Repo Architecture
| What | Repo | Local Path | URL |
|------|------|-----------|-----|
| Source code (client site + app + edge functions) | `github.com/caslavi79/sheepdog` | `~/Desktop/sheepdog` | sheepdogtexas.com (static site) |
| App deploy target (built output only) | `github.com/caslavi79/sheepdog-app` | N/A — gh-pages pushes here | app.sheepdogtexas.com |

All code changes happen in `~/Desktop/sheepdog`. The `sheepdog-app` repo is ONLY a deploy target — never edit it directly.

### Deploy Commands (memorize these)

**Deploy the app (frontend changes):**
```bash
cd ~/Desktop/sheepdog/app && npm run deploy
```
This builds with Vite and pushes to `sheepdog-app` repo via gh-pages. Takes ~10 seconds.

**Deploy edge functions (backend changes):**
```bash
cd ~/Desktop/sheepdog && bash scripts/deploy-edge.sh
```
This deploys ALL 8 functions with `--no-verify-jwt`. Takes ~30 seconds. **NEVER deploy edge functions any other way.**

**Deploy both:**
```bash
cd ~/Desktop/sheepdog && bash scripts/deploy-edge.sh && cd app && npm run deploy
```

**Set Supabase secrets:**
```bash
npx supabase secrets set KEY="value" --project-ref sezzqhmsfulclcqmfwja
```

### Database Changes
- No Docker, no migrations, no Supabase CLI for schema.
- Edit `supabase/schema.sql` as source of truth, then run the SQL manually in the Supabase SQL editor: https://supabase.com/dashboard/project/sezzqhmsfulclcqmfwja/sql/new
- Always update `schema.sql` to match what you run.

### Testing
- **Local preview:** `cd ~/Desktop/sheepdog/app && npm run dev` → localhost:5173. Good for UI changes. API calls hit the real Supabase backend.
- **Live site:** app.sheepdogtexas.com — requires login. Best for testing AI features since you're authenticated.
- **Edge function testing:** Use curl directly against the Supabase endpoints. Example:
  ```bash
  curl -s -X POST https://sezzqhmsfulclcqmfwja.supabase.co/functions/v1/claude-assistant \
    -H "Content-Type: application/json" \
    -d '{"action":"intake","message":"test message"}'
  ```
- **Chrome browser tools (MCP):** Use for interacting with the live app at app.sheepdogtexas.com when you need to click through UI flows.
- **GitHub Pages caching:** After `npm run deploy`, the live site may take 30-60 seconds to update. Hard refresh (Cmd+Shift+R) to bust cache.

### Key Constraints
- `--no-verify-jwt` is REQUIRED on every edge function deploy. The deploy script handles this. If you deploy a function manually without it, the contact form and signing page break silently.
- The `SIGNING_BASE_URL` secret must be `https://app.sheepdogtexas.com/sign` (NOT the edge function URL).
- Contract templates are static HTML files in `app/public/docs/`. They can't be loaded from edge functions.
- The `/sign` route in the app is PUBLIC (no auth required). It's defined BEFORE the ProtectedRoute in App.jsx.
- Supabase project ref: `sezzqhmsfulclcqmfwja`
