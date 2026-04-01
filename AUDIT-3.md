# Sheepdog Operations App — Final Audit (April 2026)

Full audit across all 6 tabs before Claude API integration. 168 findings across 6 pages.

---

## Summary by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 16 |
| HIGH | 29 |
| MEDIUM | 38 |
| LOW | 85 |
| **TOTAL** | **168** |

---

## CRITICAL Findings (Fix Before Expansion)

### Cross-Page: Date/Timezone Inconsistency
| # | Page | Issue | Lines |
|---|------|-------|-------|
| 1 | Hub | `daysUntil()` and inline `daysSince` use different calculation methods — inconsistent alerts | Hub.jsx:92,112,120 |
| 2 | Hub | Past events alert uses `new Date(e.date + 'T00:00:00')` without timezone normalization — off-by-one in non-UTC zones | Hub.jsx:127 |
| 3 | Scheduling | Multiple date parsing methods (`new Date(ev.date)` vs `.split('T')[0]`) cause timezone mismatches | Scheduling.jsx:9,15,343 |
| 4 | Compliance | `daysUntil()` in format.js doesn't normalize `exp` date hours — off-by-one at DST transitions | format.js:13-18 |

**Fix:** Create a unified `daysSince(isoString)` utility in format.js. Normalize all date-only comparisons to local midnight using `new Date(y, m-1, d)` constructor instead of string parsing.

### Data Integrity
| # | Page | Issue | Lines |
|---|------|-------|-------|
| 5 | Financials | Invoice number race condition — two concurrent users get same SHD-XXXX number | Financials.jsx:398-400 |
| 6 | Financials | Staff earnings filter logic inverted — `paid_out_date < periodStart` excludes recent payouts instead of including them | Financials.jsx:921-922 |
| 7 | Financials | Margin calculation in InvoiceDetail uses stale `invoice.total` instead of recalculated form total during edit | Financials.jsx:536-538 |
| 8 | Clients | Client deletion has no foreign key check — leaves orphaned events, invoices, contracts, pipeline records | Clients.jsx:178-183 |
| 9 | Pipeline | Drag-and-drop stage changes don't update `last_activity` — Hub stale deal alerts won't detect activity | Pipeline.jsx:419,481 |
| 10 | Pipeline | Edit form save sends empty strings instead of null — overwrites null values in DB | Pipeline.jsx:141-146 |
| 11 | Compliance | Auto-doc creation on staff add has no error handling — staff saves but docs silently fail | Compliance.jsx:63-69 |
| 12 | Compliance | Staff delete cascade allows partial failure — license delete succeeds, doc delete fails, staff record persists | Compliance.jsx:282-295 |

### UI/UX Critical
| # | Page | Issue | Lines |
|---|------|-------|-------|
| 13 | Contracts | "View Signing Page" link renders with empty token when `sign_token` is undefined — broken URL | Contracts.jsx:252 |
| 14 | Pipeline | Deal detail modal editing uses stale `deal` object — stage change via dropdown gets overwritten on save | Pipeline.jsx:132-267 |
| 15 | Scheduling | Invoice linkback: no mechanism to refresh events after invoice is created in Financials | Scheduling.jsx:489 |
| 16 | Compliance | Send Agreement/W-9 button logic checks `status === 'received'` only — shows button again for expired docs, can create duplicate doc records | Compliance.jsx:370-387 |

---

## HIGH Findings

### Pipeline (5)
| # | Issue | Lines |
|---|-------|-------|
| 17 | No stage validation in dropdown — corrupted value could be sent to DB | Pipeline.jsx:162-168 |
| 18 | Edit form save doesn't update `last_activity` | Pipeline.jsx:144-145 |
| 19 | DragDeal ref cleared before error handler can access it for rollback | Pipeline.jsx:405-425 |
| 20 | No loading indicator while stage dropdown update is in flight | Pipeline.jsx:179-189 |
| 21 | CLIENT badge color uses hardcoded opacity string instead of constant | Pipeline.jsx:315 |

### Clients (6)
| # | Issue | Lines |
|---|-------|-------|
| 22 | Search only filters current page — misses matches on other pages | Clients.jsx:394-401 |
| 23 | ClientDetail fetches events/invoices/contracts without AbortController — memory leak on rapid open/close | Clients.jsx:161-165 |
| 24 | Edit form missing `required` attribute on contact_name | Clients.jsx:295-333 |
| 25 | Quick Action buttons missing aria-labels | Clients.jsx:264-274 |
| 26 | Pipeline deal link update silently fails if deal stage changed between click and submit | Clients.jsx:72-77 |
| 27 | Contract signing link breaks if VITE_SUPABASE_URL env var is undefined | Clients.jsx:246-247 |

### Scheduling (4)
| # | Issue | Lines |
|---|-------|-------|
| 28 | Calendar day padding uses negative date arithmetic — unreliable at certain month boundaries | Scheduling.jsx:233-252 |
| 29 | Week stats event date parsing inconsistent with calendar rendering | Scheduling.jsx:340-345 |
| 30 | Generate Events has no start_date < end_date validation — silently creates 0 events | Scheduling.jsx:359-385 |
| 31 | Default 4-week duration when end_date is missing — no UI indication of this behavior | Scheduling.jsx:364 |

### Financials (5)
| # | Issue | Lines |
|---|-------|-------|
| 32 | No error handling when staff member is deleted but still referenced in invoice | Financials.jsx:117-126 |
| 33 | Invoice linkback to event: no cleanup when invoice is deleted — orphaned invoice_id on event | Financials.jsx:414-415 |
| 34 | Missing date validation in earnings period calculations | Financials.jsx:911-922 |
| 35 | No loading indicator during bulk payout operation — button stays clickable | Financials.jsx:892-906 |
| 36 | All invoices loaded in memory for payouts/earnings — won't scale past 1000+ | Financials.jsx:826-830 |

### Compliance (4)
| # | Issue | Lines |
|---|-------|-------|
| 37 | License status filter for "active" is inverted — filters OUT licenses with 0-30 days remaining | Compliance.jsx:305-309 |
| 38 | No email validation before Send Agreement/W-9 navigation | Compliance.jsx:384-386 |
| 39 | Delete confirmation state persists across tab switches | Compliance.jsx:348-399 |
| 40 | Modal form validation inconsistent — no expiration >= issue date check, no future signature date check | Compliance.jsx:51,120,183 |

### Contracts (5)
| # | Issue | Lines |
|---|-------|-------|
| 41 | Template deep link with bad path silently fails — no fallback | Contracts.jsx:316-329 |
| 42 | Staff auto-fill overwrites client auto-fill without warning when both are selected | Contracts.jsx:112-144 |
| 43 | Staff lookup for contract auto-fill missing error handling — runtime error if staff deleted | Contracts.jsx:81-90 |
| 44 | Contract editor can lose unsaved data on template switch | Contracts.jsx:93-110 |
| 45 | No runtime validation that all 18 template HTML files actually exist | Contracts.jsx:46-54 |

---

## MEDIUM Findings

### Pipeline (6)
| # | Issue |
|---|-------|
| 46 | No email format validation on deals |
| 47 | No phone number format validation |
| 48 | Contact name accepts whitespace-only input |
| 49 | No loading state for stage dropdown changes |
| 50 | Drag error persists across different card operations |
| 51 | Long names overflow pipeline cards — no text truncation CSS |

### Clients (7)
| # | Issue |
|---|-------|
| 52 | Empty state message doesn't account for pagination context |
| 53 | Invoice total not formatted as currency in detail panel |
| 54 | Related records sections have no loading state — empty looks same as loading |
| 55 | fromDeal auto-sets status to 'active' without user choice |
| 56 | Input placeholders used as labels violate accessibility guidelines |
| 57 | Modal stacking during rapid open/close can conflict |
| 58 | Pagination state management tightly coupled to loadClients |

### Scheduling (4)
| # | Issue |
|---|-------|
| 59 | invoice_id falsy check doesn't handle edge case of "0" value |
| 60 | Delete handlers log errors but don't show toast to user |
| 61 | No AbortController for parallel data loading — race condition on rapid tab switches |
| 62 | Mobile calendar cells too small (60px) for multiple events |

### Financials (8)
| # | Issue |
|---|-------|
| 63 | Line item total NaN when hours/rate are empty strings |
| 64 | QuickAddStaff modal captures email field but doesn't save it to DB |
| 65 | Payout tracking shows no timestamp for when staff were paid |
| 66 | Client name lookup has no loading fallback |
| 67 | Stats not immediately updated after invoice edit |
| 68 | Pay Rate defaults modal allows saving blank role/rate |
| 69 | Subtotal not recalculated from form data in edit mode |
| 70 | No total validation (frontend total could mismatch line items) |

### Compliance (5)
| # | Issue |
|---|-------|
| 71 | Loading state shows indefinitely if one of three queries fails |
| 72 | Toast messages lack context (no name/type shown) |
| 73 | "NO DATE" badge not visually distinct from "MISSING" |
| 74 | Search resets on tab switch |
| 75 | Modal label inconsistencies ("Add Document" vs "Contractor Docs" tab) |

### Contracts/Hub/Resources (8)
| # | Issue |
|---|-------|
| 76 | Contract fetch error not shown to user — stuck on "Loading..." |
| 77 | Date formatting inconsistency between table and alerts |
| 78 | Preselected staff_id/client_id not cleared after editor close |
| 79 | No signer email format validation before send |
| 80 | Resources HEAD request may fail on some servers |
| 81 | Client auto-fill uses loose `.includes()` matching — over-matches field names |
| 82 | useToast hook has potential race condition with rapid calls |
| 83 | Delete confirm buttons not keyboard accessible across all pages |

---

## LOW Findings (85 total — grouped by category)

### Missing Features
- No search/filter on Pipeline page
- No week/day view in calendar
- No bulk edit for recurring events
- No PDF invoice export
- No email invoice send
- No payment reminder automation
- No CSV/Excel export for payouts
- No bulk invoice status change
- No bulk operations in Compliance
- No document upload/attachment for contractor docs
- No import/export for staff/licenses
- No doc type filter on Contractor Docs tab
- No pagination in Compliance for large datasets
- License issue date not shown in table

### UX Polish
- Deal limit of 100 not documented or warned
- AddDealModal doesn't reset on close
- No tooltip for CLIENT badge
- "Send Contract" button conditions not explained for other stages
- No confirmation before "Convert to Client"
- Empty state for Pipeline with 0 deals
- Filter select options show raw enum values
- Loading states use text only (no spinners)
- Table rows not keyboard navigable
- Calendar event limit hardcoded to 3
- Calendar "+N more" not clickable
- Delete confirmation cramped on mobile
- Payment method dropdown truncated on mobile
- Contract editor not responsive on tablets
- Hub alerts have no loading state
- No "discard unsaved changes" confirmation on contract editor close
- No redirect reason shown on session expiry

### Accessibility
- Stage dropdown color contrast (WCAG AA) — some stage colors fail with white text
- Missing aria-labels on mobile stage select
- No keyboard navigation for drag-and-drop
- Missing aria-labels on resource section toggles
- Badge color contrast unverified across all pages
- Modal focus not trapped or returned on close

### Performance
- Calendar events not memoized
- staffMap recalculated on every render in Compliance
- Filter logic unmemoized in Compliance
- Toast timer not cleaned up on unmount
- Staff roster query loaded fully without server-side filtering

### Code Quality
- ESLint disable comments lack explanation
- Inline styles inconsistent with CSS class usage
- Error messages styled differently across pages
- Stage colors defined in multiple files
- encodeURIComponent unnecessary on controlled paths

---

## Priority Fix Order

### Phase 1: Data Integrity (Before Any Expansion)
1. Fix `daysUntil()` / date comparison consistency across all pages
2. Fix staff earnings filter inversion (Financials:921)
3. Fix invoice number race condition (use DB sequence or unique constraint)
4. Add foreign key check before client deletion
5. Fix drag-and-drop `last_activity` updates in Pipeline
6. Fix auto-doc creation error handling in Compliance
7. Fix license status filter inversion in Compliance

### Phase 2: UX Critical
8. Fix "View Signing Page" empty token link
9. Fix deal detail stale state on edit after stage change
10. Fix empty string → null conversion in Pipeline edit
11. Add email validation before contract send
12. Clear preselected IDs on contract editor close
13. Add start < end date validation for placement event generation

### Phase 3: Before Claude API Integration
14. Add loading states to all async operations
15. Add error recovery UI (retry buttons) on all data fetches
16. Fix search to work across all pages (not just current page)
17. Add text truncation CSS for long names
18. Add keyboard accessibility to table rows and drag-and-drop
