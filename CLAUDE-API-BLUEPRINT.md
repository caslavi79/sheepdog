# Claude API Integration Blueprint

Every feature in the Sheepdog Operations App, mapped to Claude API integration points.

---

## 1. HUB (Dashboard)

### Current Features
| Feature | What it does |
|---------|-------------|
| New Leads stat | Count of pipeline stage='lead' |
| Pipeline Value stat | Sum of non-lost deal values |
| Submissions (7d) stat | Contact form submissions this week |
| Active Clients stat | Count of clients status='active' |
| Overdue invoices alert | Links to /financials |
| Outstanding balance alert | Total $ from sent/overdue invoices |
| Expired licenses alert | Links to /compliance |
| Expiring licenses alert | 0-30 day window |
| Missing docs alert | contractor_docs status='missing' |
| Stale deals alert | 14+ days no last_activity |
| Unsigned contracts alert | Sent 7+ days ago |
| Past events no invoice alert | Past date + no invoice_id |
| 6 module navigation cards | Links to all pages |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Daily Briefing** | Generates natural language summary of business state: "You have 3 overdue invoices totaling $2,400, 2 stale deals that need follow-up, and a license expiring Friday for Marcus." | Reads all Hub data, composes briefing, triggers morning email via Resend |
| **Smart Prioritization** | Ranks alerts by urgency and financial impact: "Call The Rusty Nail first — $1,200 overdue 14 days vs. $300 overdue 3 days" | Cross-references invoice amounts, client history, deal stages |
| **Anomaly Detection** | Flags unusual patterns: "Revenue is down 40% vs. last month" or "3 staff licenses expire within 2 weeks — schedule renewals" | Compares current stats against historical trends |
| **Screenshot Upload → Action Router** | User uploads a photo (text message from client, a W-9, a schedule screenshot, etc.) → Claude identifies what it is and routes to the right page with pre-filled data | Uses vision to OCR/classify image, then navigates user: "This looks like a W-9 from Marcus Johnson. Want me to attach it to his contractor docs?" |
| **Voice-to-Action** | User types natural language: "What's my revenue this month?" → Claude queries Supabase, returns answer | Translates intent → database query → formatted response |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Monday 8am | Weekly business briefing with stats, top priorities, stale deals | Team (3 owners) |
| New contact form submission | Enriched lead analysis: "This is a wedding planner — high-value event security lead. Similar client The Rusty Nail is worth $12k/yr." | Team |
| Pipeline deal goes stale (14d) | "Haven't heard from {contact} in 14 days. Here's a follow-up email draft." | Assigned owner |

---

## 2. PIPELINE

### Current Features
| Feature | What it does |
|---------|-------------|
| 7-stage Kanban board | Lead → Outreach Sent → Responded → Meeting Scheduled → Proposal Sent → Under Contract → Lost |
| Drag-and-drop (desktop) | Moves deal between stages |
| Mobile stage dropdown | Same as drag, mobile-friendly |
| Keyboard arrow nav | Left/Right to move stages |
| Deal cards | Name, value, service line, CLIENT badge |
| Search bar | Filters by name, business, email |
| Deal detail modal | View/edit all fields, stage dropdown |
| Convert to Client | Pre-fills client from deal data |
| Send Contract | Navigates to /contracts with client_id |
| Deal limit warning | Shows if 100+ deals |
| Empty state | Prompt to add first deal |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Lead Scoring** | Analyzes new leads and assigns a score (1-10): "Wedding planner + Greek org = high volume potential. Score: 8/10" | Reads deal data + contact_submissions message + service_line, cross-references with historical win rates by client_type |
| **Follow-up Drafts** | Generates personalized outreach emails/DMs for each deal: "Hi Sarah, following up on the security quote for your April 12th wedding at Peach Creek Ranch..." | Uses deal notes, contact info, service_line to compose outreach |
| **Stage Recommendation** | Suggests next stage based on activity: "You've had 3 emails with this contact. Move to 'Responded'?" | Analyzes notes, last_activity, time in current stage |
| **Win/Loss Analysis** | When deal moves to Under Contract or Lost: "Deals from contact_form convert 3x more than manual. Wedding planners close in avg 12 days." | Historical pipeline data analysis |
| **Duplicate Detection** | When adding a deal: "A deal for 'The Rusty Nail' already exists in Meeting Scheduled stage. Is this the same contact?" | Fuzzy matches on business_name, email, phone against existing deals + clients |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Deal stale 7 days | Gentle follow-up draft: "Here's a message you could send to {contact}..." | Deal owner |
| Deal stale 14 days | Urgent: "This deal is going cold. Call {phone} today or mark as Lost." | Team |
| Deal moved to Lost | Loss review: "What went wrong? Similar deals that converted had X in common." | Team |
| New lead from contact form | Lead analysis + suggested response + estimated value | Team |

---

## 3. CLIENTS

### Current Features
| Feature | What it does |
|---------|-------------|
| Paginated table (25/page) | Name, business, phone, email, service, status |
| Search | Name, business, email, phone |
| Service line filter | events/staffing/both |
| Status filter | active/inactive/prospect |
| Client detail panel | Contact info, recent events, invoices, contracts |
| Quick Actions | New Event, New Invoice, New Contract buttons |
| Add/Edit client modal | All client fields with validation |
| From Pipeline conversion | Pre-fills from deal data, links back |
| Delete with FK check | Prevents orphaned records |
| Keyboard nav on table rows | Tab + Enter to open |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Client Health Score** | Rates each client relationship (1-10) based on: invoice payment speed, event frequency, contract status, last interaction date | Cross-references events, invoices, pipeline, contracts per client_id |
| **Churn Prediction** | Flags clients who may not rebook: "The Rusty Nail hasn't booked since January — they usually book monthly" | Analyzes event frequency patterns, compares to historical cadence |
| **Revenue Insights** | Per-client breakdown: "This client has generated $14,200 across 23 events. Avg margin: 42%." | Aggregates invoices by client_id |
| **Smart Client Profile** | Auto-generates a client summary: "Wedding planner, books 3-4 events/year, always needs 4 guards + 2 bartenders, pays within 7 days, prefers Zelle" | Synthesizes all related records: events, invoices, contracts, notes |
| **Relationship Timeline** | Visual timeline of all touchpoints: lead → client → first event → first invoice → payment → re-book | Combines pipeline.created_at, events.date, invoices.created_at, contracts.signed_at |
| **Screenshot → Client Lookup** | Upload a text/email screenshot → Claude extracts name/business/phone → finds matching client or creates new one | Vision OCR → fuzzy match against clients table |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Client inactive 60+ days | Re-engagement suggestion: "Haven't worked with {business} in 60 days. Here's a check-in message..." | Team |
| Client's first event completed | Thank-you + review request template | Client email |
| Client reaches $5k lifetime value | VIP milestone notification + suggested loyalty gesture | Team |

---

## 4. CONTRACTS

### Current Features
| Feature | What it does |
|---------|-------------|
| 18 templates (4 categories) | Events, Staffing, Staff, Ops |
| Template picker modal | Grid of all templates |
| Side-by-side editor | Form left, live preview right |
| Field extraction from HTML | Auto-detects [FIELD_NAME] spans |
| Client auto-fill | Fills name, business, email, phone from client |
| Staff auto-fill | Fills contractor fields from staff record |
| Signer email field | Required for send, validated |
| Save Draft | Stores without sending |
| Send for Signing | Calls contract-send, emails signer |
| View Signing Page | Link to public signing URL |
| Status tracking | draft → sent → viewed → signed |
| Deep links | ?template=, ?client_id=, ?staff_id= |
| Contract table | Template, client, signer, status, dates |
| Search + status filter | By client/template name |
| Discard unsaved changes | Confirmation dialog |
| Error retry on load failure | Retry button |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Template Recommender** | "Based on this client's service line and deal size, I recommend the 'Recurring Event Contract' template" | Reads client.service_line, pipeline.value, event history |
| **Smart Field Fill** | Auto-fills ALL contract fields from context — not just name/email but event dates, venue, staff count, rates, scope of work | Cross-references events, invoices, pay_rate_defaults, client history |
| **Contract Review** | Before sending: "This contract has no cancellation fee specified. The last 3 cancelled events cost you $800. Add a clause?" | Reads filled_html, compares against templates, analyzes historical data |
| **Follow-up on Unsigned** | 3 days after send, if not signed: draft a follow-up email to signer | Checks contracts where status='sent' and daysSince(sent_at) > 3 |
| **Post-Signature Workflow** | When signed: "Contract signed! Next steps: 1. Create event for April 12. 2. Assign 4 guards. 3. Generate invoice." | Reads signed contract field_values, suggests actions with deep links |
| **Screenshot → Contract** | Upload photo of a hand-signed contract or email agreement → Claude extracts terms, creates a contract record | Vision OCR → populate field_values + filled_html |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Contract sent, not viewed after 48h | "Just checking in — have you had a chance to review the contract?" | Signer email |
| Contract viewed but not signed after 72h | "I see you've reviewed the contract. Any questions I can answer?" | Signer email |
| Contract signed | Automated next-steps checklist for team | Team |

---

## 5. RESOURCES

### Current Features
| Feature | What it does |
|---------|-------------|
| 33 documents across 10 categories | Brand, Google Business, Outreach, Reviews, Contracts, Staff, Ops |
| Expandable category sections | Toggle open/close |
| View link | Opens doc in new tab |
| Fill & Send | Navigates to /contracts with template |
| Dead link detection | HEAD/GET check, "Missing File" badge |
| aria-expanded on toggles | Accessibility |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Smart Resource Suggestions** | "You're about to email a wedding planner. Here's the Events Brand Identity guide and a cold outreach script." | Reads current context (what page user is on, what they're working on) |
| **Outreach Script Generator** | Uses outreach templates + target lists to generate personalized DMs/emails for specific Instagram accounts or businesses | Reads outreach-targets docs + client/pipeline data |
| **Review Response Drafting** | "A new 4-star review came in. Here's a response using your brand voice." | Reads review-response-templates doc, generates contextual reply |
| **Brand Compliance Check** | Scans any text/email/post the user drafts against brand guidelines: "This doesn't match your brand voice. Here's a revision." | Cross-references Brand Identity docs |

---

## 6. SCHEDULING

### Current Features
| Feature | What it does |
|---------|-------------|
| Month calendar view | 7-column grid, 3 events per cell, +N more |
| Week calendar view | 7-column, all events visible, times shown |
| Month/Week toggle | Switches calendar view |
| Calendar day click | Creates new event for that date |
| Calendar event click | Opens event detail |
| +N more clickable | Opens day detail modal with all events |
| Events list tab | Filterable, searchable table |
| Event search | Title, venue, client name |
| Status filter | scheduled/confirmed/in_progress/completed/cancelled |
| Service filter | events/staffing/both |
| Event modal (add/edit) | Date, times, client, venue, type, staff assignment |
| Staff assignment with autocomplete | Name lookup, role auto-fill, license warnings |
| Update series checkbox | Apply changes to all future events in placement |
| Create Invoice from event | Navigates to /financials with pre-filled data |
| Placements tab | Recurring schedules with generate events |
| Placement modal | Client, schedule pattern, dates, staff |
| Generate Events from placement | Creates individual events from pattern |
| Stats | This week events, staff assigned, need staff, active placements |
| fromClient pre-fill | Opens event modal with client pre-selected |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Scheduling Assistant** | "You have a wedding at Peach Creek on Saturday needing 4 guards. Marcus and Tyler are available and have valid licenses. Want me to assign them?" | Cross-references events.staff_needed, staff.status, licenses.expiration_date, existing event assignments |
| **Conflict Detection** | "Tyler is already assigned to The Rusty Nail 8pm-2am on Saturday. He can't do the wedding at 6pm." | Checks staff_assigned across all events for date conflicts |
| **Capacity Planning** | "Next week you need 12 staff across 5 events but only have 8 active staff with cleared background checks." | Aggregates weekly staff_needed vs. available staff |
| **Auto-Schedule from Text** | User pastes: "Need 3 guards for Friday night at Northgate, 9pm-2am" → Claude creates the event | NLP → extracts date, time, venue, staff_needed, creates event |
| **Post-Event Follow-up** | After event status='completed': "Send thank-you to client? Generate invoice? Request review?" | Reads completed events, suggests next steps |
| **Screenshot → Event** | Upload screenshot of a text/email requesting security → Claude extracts event details and creates it | Vision → parse date, time, venue, staff count → create event |
| **Weather Integration** | "Outdoor wedding Saturday — 40% chance of rain. Confirm with client about contingency plan." | Could integrate weather API, match against outdoor event types |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Event tomorrow | Staff assignment confirmation: "You're working at The Rusty Nail tomorrow, 9pm-2am. Dress code: black polo." | Each assigned staff member's email |
| Event completed | Auto-send thank-you + review request to client | Client email |
| Staff assigned to event with expiring license | "Your TABC cert expires in 5 days. Renew before Saturday's shift." | Staff email |
| Placement generates events | "Your weekly schedule for next month has been generated. 16 shifts across 4 venues." | Team |

---

## 7. FINANCIALS

### Current Features
| Feature | What it does |
|---------|-------------|
| Invoices tab (paginated) | Invoice #, client, total, status, due date |
| Bulk select checkboxes | Select all, individual select |
| Bulk actions | Mark Sent, Mark Paid (batch) |
| Search | Client name, invoice # |
| Status filter | draft/sent/paid/overdue |
| Service filter | events/staffing/both |
| Add Invoice modal | Client-facing line items + internal staff assignments |
| Line item presets dropdown | 19 preset descriptions + Other (custom) |
| Auto-calculate subtotal/tax/total | Real-time math |
| Internal staff assignments | Name autocomplete, role, hours, pay rate, margin calc |
| Pay rate defaults | Auto-fill from role + service_line |
| Quick add staff to roster | From invoice editor |
| License warnings on staff | Red/amber border if expired/expiring |
| Invoice detail (tabbed) | Client view + Internal view |
| Mark Sent / Mark Paid | Status transitions with payment method |
| Download PDF | Branded HTML → print/save as PDF |
| Email to Client | Calls invoice-send edge function |
| Delete (cleans up event link) | Removes invoice_id from linked events |
| fromEvent pre-fill | Auto-fills from Scheduling data |
| fromClient pre-fill | Auto-fills client_id |
| Stats | Outstanding, paid this month, overdue count, invoices this month |
| Payouts tab | Unpaid staff from paid invoices |
| Mark staff paid (individual) | Sets paid_out flag + date |
| Bulk mark all paid | Batch payout |
| CSV export (payouts) | Downloads payout data |
| Staff Earnings tab | Period totals (month/quarter/YTD) |
| 1099 tracking | Flags staff at $600+ YTD |
| CSV export (earnings) | Downloads earnings data |
| Pay Rate Defaults modal | CRUD for default rates by role + service_line |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Auto-Invoice from Event** | When event completes: "Event at The Rusty Nail finished. 4 guards × 5hrs × $35/hr = $700. Generate invoice?" | Reads event data, staff_assigned, pay_rate_defaults, creates invoice draft |
| **Pricing Advisor** | "Your avg rate for bar security is $30/hr but market rate in Bryan-College Station is $35. Consider raising." | Analyzes invoice history, line item rates by service type |
| **Cash Flow Forecast** | "Based on outstanding invoices and upcoming events, you'll receive ~$8,200 this month." | Projects from sent invoices + scheduled events with historical payment timing |
| **Payment Chaser** | Generates payment reminder emails that get progressively firmer: friendly → firm → final | Uses daysSince(due_date) to calibrate tone |
| **Margin Analyzer** | "Your margin on Greek life events is 62% vs. 38% on warehouse staffing. Consider focusing on events." | Aggregates margin data across invoices by service_line and event_type |
| **1099 Prep** | "End of year: 4 contractors earned $600+. Here's their info for 1099 filing." | Reads YTD earnings, exports formatted data |
| **Screenshot → Invoice** | Upload photo of a handwritten receipt or expense → Claude extracts line items, amounts, creates invoice draft | Vision → parse amounts → populate line_items |
| **Expense Categorization** | If expense tracking is added: Claude auto-categorizes expenses and maps to events/clients | NLP on descriptions → match to known clients/events |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| Invoice created from event | "Invoice {SHD-XXXX} ready for review before sending to {client}." | Team |
| Invoice overdue 3 days | Friendly reminder auto-sent to client | Client email |
| Invoice overdue 7 days | Firm reminder (via payment-reminders function) | Client + team |
| Invoice overdue 14 days | Final notice | Client + team |
| All staff paid for an event | "Payroll complete for {event} — $X total disbursed." | Team |
| Staff approaches 1099 threshold | "Marcus has earned $550 YTD. One more event and he'll need a 1099." | Team |

---

## 8. COMPLIANCE

### Current Features
| Feature | What it does |
|---------|-------------|
| Staff Roster tab | Name, role, phone, email, status, BG check, pay rate, docs status |
| Bulk select + delete | Checkboxes, select all, batch delete with cascade |
| Export CSV (staff) | Downloads roster data |
| Import CSV (staff) | Parses and creates staff records |
| Send Agreement/W-9 buttons | Navigates to /contracts with staff pre-filled |
| AGR/W-9 badges | Shows signed status inline |
| Add/Edit staff modal | All staff fields, auto-creates docs on new staff |
| Licenses tab | Type, number, authority, issue/expiration dates, status badges |
| License status badges | ACTIVE, Xd LEFT (amber/red), EXPIRED, NO DATE |
| License filters | Type + status |
| Export CSV (licenses) | Downloads license data |
| Add/Edit license modal | All fields with date validation |
| Contractor Docs tab | Type, status, signature date, file attachment, notes |
| Doc type/status filters | w9/agreement/other + received/missing/expired |
| File upload | PDF, DOC, images → Supabase Storage |
| View file link | Opens uploaded attachment |
| Pagination (50/page) | All 3 tabs |
| Auto-doc creation | W-9 + Agreement created as 'missing' on staff add |
| Auto-doc update on signing | contract-sign updates matching doc to 'received' |

### Claude API Integration
| Integration | What Claude does | How it connects |
|------------|-----------------|-----------------|
| **Onboarding Checklist** | New staff added → Claude generates personalized checklist: "Send contractor agreement, request W-9, verify TABC cert, schedule background check" | Reads staff record, checks what docs exist, what's missing |
| **Document OCR** | Upload a photo of a license, W-9, or ID → Claude extracts: name, license number, expiration date, issuing authority → auto-fills license/doc record | Vision → OCR → populate licenses or contractor_docs fields |
| **License Renewal Assistant** | "Marcus's TABC cert expires in 14 days. Here's the renewal link and a reminder email draft." | Reads licenses.expiration_date, generates actionable email |
| **Background Check Tracker** | Integrates with BG check status updates → auto-updates staff.background_check field | Could poll external BG check API or parse email notifications |
| **Compliance Dashboard** | "Your compliance rate is 87%: 2 staff missing W-9s, 1 expired TABC, 3 pending background checks." | Aggregates across staff, licenses, contractor_docs |
| **Smart Staff Matching** | "For this bar security shift, you need TABC-certified guards. Here are 4 available staff with valid certs." | Cross-references licenses (type=tabc, not expired) + staff (status=active, background_check=cleared) + schedule conflicts |
| **Screenshot → Staff Record** | Upload photo of a new hire's ID or application → Claude creates staff record with name, phone, email extracted | Vision → OCR → create staff record |
| **Batch Document Requests** | "5 staff are missing W-9s. Send all of them the W-9 request form in one click." | Reads contractor_docs where status='missing' and doc_type='w9', batch-creates contracts and sends |

### Smart Emails (Resend)
| Trigger | Email | To |
|---------|-------|-----|
| New staff created | Welcome + onboarding checklist: "Sign your contractor agreement, submit your W-9, verify your license" | Staff email |
| License expires in 30 days | Early renewal reminder | Staff email |
| License expires in 7 days | Urgent renewal warning | Staff email + team |
| License expired | "Your license has expired. You cannot be assigned to events until renewed." | Staff email + team |
| W-9 missing after 14 days | "Please submit your W-9 to continue receiving payments." | Staff email |
| Background check cleared | "You're cleared! You can now be assigned to events." | Staff email |
| All onboarding docs complete | "Staff onboarding complete for {name}. Ready for assignments." | Team |

---

## 9. CROSS-FEATURE CONNECTIONS (Claude as Orchestrator)

### The Full Lifecycle with Claude
```
Lead comes in (contact form)
  → Claude: "New lead from Sarah Johnson, wedding planner. Score: 8/10.
     She needs security for an April 12 wedding. Draft outreach attached."
  → Claude emails team with lead analysis + suggested response

Deal progresses (Pipeline)
  → Claude: "Sarah responded! Move to 'Responded'. Here's a meeting
     scheduler link to send her."

Convert to Client
  → Claude: "Client record created. I recommend the Event Security Agreement
     template. Want me to pre-fill it with the wedding details from her form?"

Contract sent and signed
  → Claude: "Contract signed! I've created an event for April 12 at Peach
     Creek Ranch. Need 4 guards + 2 bartenders. Here are available staff
     with valid TABC certs."

Event staffed
  → Claude emails each assigned staff member: shift details, dress code,
     venue address, contact info

Event completed
  → Claude: "Event done. Invoice draft ready: 4 guards × 5hrs × $35 = $700,
     2 bartenders × 5hrs × $30 = $300. Total: $1,000. Margin: 52%. Send?"
  → Claude auto-sends thank-you + review request to Sarah

Invoice paid
  → Claude: "Payment received from Sarah. Mark 6 staff as paid? Tyler has
     hit $600 YTD — he'll need a 1099."
  → Claude emails team: "Payroll complete for Peach Creek wedding."

Re-engagement
  → Claude: "It's been 30 days since Sarah's wedding. She books 3-4 events
     per year. Send a check-in? Here's a draft."
```

### Screenshot Upload Hub (The Big Feature)

The Hub becomes the central intake point. Users can upload ANY photo and Claude routes it:

| What's in the photo | What Claude does | Where it goes |
|---------------------|-----------------|---------------|
| Text message from client asking for security | Extracts date, venue, staff count → creates event draft | Scheduling |
| Photo of a W-9 form | OCR → extracts name, TIN, address → creates/updates contractor_doc | Compliance |
| Photo of a TABC license | OCR → extracts license #, expiration, authority → creates license record | Compliance |
| Screenshot of an email with event details | Extracts all event info → creates event + suggests contract template | Scheduling + Contracts |
| Photo of a handwritten invoice/receipt | Extracts line items, amounts → creates invoice draft | Financials |
| Business card from potential client | Extracts name, business, phone, email → creates pipeline deal | Pipeline |
| Photo of event setup (for post-event report) | Describes the setup, flags issues → attaches to event notes | Scheduling |
| Screenshot of a Google review | Extracts rating, text → drafts response using brand voice | Resources |
| Photo of staff ID/driver's license | Extracts name, DOB → creates or matches staff record | Compliance |
| Screenshot of schedule/availability text | Parses availability → matches against upcoming events needing staff | Scheduling |

### Smart Email System (Full Map)

| # | Trigger | From | To | Content |
|---|---------|------|-----|---------|
| 1 | Contact form submitted | contact-submit | Team | Lead analysis + response draft |
| 2 | Contact form submitted | contact-submit | Submitter | Confirmation |
| 3 | Deal stale 7d | Cron/Claude | Team | Follow-up suggestion |
| 4 | Deal stale 14d | Cron/Claude | Team | Urgent follow-up |
| 5 | Deal moved to Lost | Claude | Team | Loss analysis |
| 6 | Client inactive 60d | Cron/Claude | Team | Re-engagement draft |
| 7 | Client first event done | Claude | Client | Thank-you + review request |
| 8 | Client hits $5k LTV | Claude | Team | VIP notification |
| 9 | Contract sent | contract-send | Signer | Signing link |
| 10 | Contract not viewed 48h | Cron/Claude | Signer | Check-in |
| 11 | Contract viewed not signed 72h | Cron/Claude | Signer | Follow-up |
| 12 | Contract signed | contract-sign | Signer + Team | Confirmation + next steps |
| 13 | Event tomorrow | Cron/Claude | Assigned staff | Shift details |
| 14 | Event completed | Claude | Client | Thank-you + review ask |
| 15 | Staff assigned with expiring license | Claude | Staff | Renewal reminder |
| 16 | Invoice created from event | Claude | Team | Review before send |
| 17 | Invoice sent | invoice-send | Client | Formatted invoice |
| 18 | Invoice overdue 3d | Cron/Claude | Client | Friendly reminder |
| 19 | Invoice overdue 7d | payment-reminders | Client + Team | Firm reminder |
| 20 | Invoice overdue 14d | payment-reminders | Client + Team | Final notice |
| 21 | All staff paid for event | Claude | Team | Payroll confirmation |
| 22 | Staff approaches 1099 | Claude | Team | Tax threshold warning |
| 23 | New staff created | Claude | Staff | Welcome + onboarding checklist |
| 24 | License expires 30d | license-reminders | Team | Early warning |
| 25 | License expires 7d | license-reminders | Team + Staff | Urgent warning |
| 26 | License expired | license-reminders | Team + Staff | Blocked notification |
| 27 | W-9 missing 14d | Cron/Claude | Staff | Submission reminder |
| 28 | Background check cleared | Claude | Staff + Team | Ready notification |
| 29 | All onboarding docs complete | Claude | Team | Ready for assignments |
| 30 | Monday 8am | Cron/Claude | Team | Weekly business briefing |
| 31 | Placement events generated | Claude | Team | Schedule summary |
| 32 | Month-end | Cron/Claude | Team | Monthly P&L summary |

---

## 10. TECHNICAL ARCHITECTURE FOR CLAUDE API

### Approach: Edge Function + Supabase + Resend

```
User action or cron trigger
  → Supabase Edge Function (claude-assistant)
  → Anthropic Claude API call with context
  → Claude response (text, structured data, or action)
  → Write results to Supabase / Send email via Resend / Return to UI
```

### New Infrastructure Needed
1. **claude-assistant edge function** — central Claude API gateway
2. **Anthropic API key** — stored as Supabase secret
3. **Chat/assistant UI component** — in-app chat panel or command bar
4. **Image upload endpoint** — accepts photos, sends to Claude vision
5. **Cron jobs** — daily briefing, follow-up checks, reminder scheduling
6. **Activity log table** — tracks what Claude did for audit trail

### Supabase Secrets to Add
- `ANTHROPIC_API_KEY` — Claude API key
- `CLAUDE_MODEL` — model identifier (claude-sonnet-4-20250514 or claude-opus-4-20250514)

### New Database Tables
- `assistant_messages` — conversation history per user
- `assistant_actions` — log of actions Claude took (emails sent, records created)
- `smart_emails` — queue for scheduled/triggered emails with status tracking
