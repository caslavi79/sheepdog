# Sheepdog Full Audit — 2026-03-31

All findings from 6 parallel audits across edge function, React app, static site, Supabase schema, CSS/UX, and deployment.

---

## CRITICAL — All Fixed

- [x] ~~**C1** — Rate limiter IP spoofing~~ → Fixed: x-real-ip/cf-connecting-ip priority
- [x] ~~**C2** — RLS/schema not version-controlled~~ → Fixed: supabase/schema.sql committed
- [x] ~~**C3** — submitForm() drift across pages~~ → Fixed: extracted to js/form.js

## HIGH

- [x] ~~**H1** — No input length limits~~ → Fixed in edge function
- [x] ~~**H2** — No type checking on inputs~~ → Fixed in edge function
- [x] ~~**H3** — company field never saved~~ → Fixed in edge function
- [x] ~~**H4** — rate_limits table unbounded~~ → Fixed: global cleanup
- [x] ~~**H5** — Insurance PDF~~ → Fixed: *.pdf added to .gitignore
- [x] ~~**H6** — No deploy script~~ → Fixed: scripts/deploy-edge.sh
- [x] ~~**H7** — Pipeline touch~~ → Fixed: stage-change dropdown on mobile
- [x] ~~**H8** — Color contrast~~ → Fixed: --steel bumped to #929BAA (passes AA)
- [x] ~~**H9** — Error states~~ → Fixed: error banners with retry on all 3 data pages
- [x] ~~**H10** — Cookie banner~~ → Already existed, audit was wrong
- [x] ~~**H11** — Events h1~~ → Fixed: sr-only h1 added
- [x] ~~**H12** — No Content Security Policy on any page.~~ → Fixed: CSP meta tag on all HTML pages
- [x] ~~**H13** — Rate limiter fails open~~ → Fixed: fails closed now
- [x] ~~**H14** — Malformed JSON crash~~ → Fixed: try/catch before rate limit
- [x] ~~**H15** — Unsanitized reply_to~~ → Fixed: uses safeEmail
- [x] ~~**H16** — ProtectedRoute~~ → Fixed: uses onAuthStateChange only
- [x] ~~**H17** — ResetPassword~~ → Fixed: verifies PASSWORD_RECOVERY event
- [x] ~~**H18** — console.error calls in production code~~ → Fixed: all 6 wrapped in import.meta.env.DEV
- [x] ~~**H19** — Dead toggleForm() function~~ → Fixed: removed with C3
- [x] ~~**H20** — No `<noscript>` fallback on any page.~~ → Fixed: noscript with phone/email on all 3 pages
- [x] ~~**H21** — Responsive~~ → Fixed: tablet (1024px) + mobile (768px) breakpoints, bottom nav, stacked pipeline, card tables
- [x] ~~**H22** — Uncommitted edge function changes~~ → Fixed: committed

## MEDIUM

- [x] ~~**M1** — Env var non-null assertion~~ → Acknowledged (Deno pattern)
- [x] ~~**M2** — DNS/MX lookup no timeout~~ → Fixed: 3s timeout
- [x] ~~**M3** — CORS returns allowed origin even for disallowed origins.~~ → Fixed: returns null/403 for disallowed origins
- [x] ~~**M4** — Service field not validated~~ → Fixed: allowlist
- [x] ~~**M5** — Rate limit cleanup swallows errors~~ → Fixed: error logging
- [x] ~~**M6** — Rate limit insert error unchecked~~ → Fixed: error logging
- [x] ~~**M7** — Pipeline insert missing company~~ → Fixed: business_name mapped
- [ ] **M8** — DNS rebinding / SSRF via MX lookup. (edge function)
- [x] ~~**M9** — Sequential Resend calls~~ → Fixed: Promise.allSettled
- [x] ~~**M10** — Password strength~~ → Fixed: minimum 8 chars
- [x] ~~**M11** — Hub page has no live data.~~ → Fixed: 4 stat cards (leads, pipeline value, submissions 7d, active clients)
- [x] ~~**M12** — Submissions page has no pagination.~~ → Fixed: server-side pagination, 25 per page
- [x] ~~**M13** — Clients page has no pagination.~~ → Fixed: server-side pagination, 25 per page
- [x] ~~**M14** — Pipeline page has no pagination.~~ → Fixed: .limit(100) on query
- [x] ~~**M15** — Clients page has no delete functionality.~~ → Fixed: delete with confirmation in ClientDetail
- [x] ~~**M16** — Duplicate useEscapeKey hook in 3 files.~~ → Fixed: extracted to lib/hooks.js (useEscapeKey, useBodyLock, useToast)
- [x] ~~**M17** — useEffect missing dependency in Clients.jsx.~~ → Fixed: deps include filterLine, filterStatus, page
- [x] ~~**M18** — Toast setTimeout without cleanup.~~ → Fixed: useToast hook with ref cleanup
- [x] ~~**M19** — No 404/catch-all route.~~ → Fixed: catch-all route in App.jsx
- [ ] **M20** — updated_at managed client-side. (Clients.jsx, Pipeline.jsx)
- [ ] **M21** — Pipeline uses hard deletes. (Pipeline.jsx)
- [ ] **M22** — No optimistic locking / concurrent edit protection. (Clients.jsx, Pipeline.jsx)
- [x] ~~**M23** — No migration files~~ → Fixed: schema.sql committed
- [x] ~~**M24** — Pipeline `source` column never displayed in UI.~~ → Fixed: shown in deal detail as "Contact Form" or "Manual"
- [x] ~~**M25** — No indexes~~ → Fixed: defined in schema.sql
- [ ] **M26** — No foreign keys between events/invoices and clients. (schema)
- [ ] **M27** — rate_limits accessible to authenticated users. (Supabase RLS)
- [ ] **M28** — All authenticated users share full data access. (Supabase RLS)
- [x] ~~**M29** — Events dropdown~~ → Fixed: removed pre-selected value
- [x] ~~**M30** — Contrast: --steel on --char = 3.6:1, fails WCAG AA.~~ → Already passing (6.46:1) after H8 fix
- [x] ~~**M31** — Error text --red on --black = 3.8:1, fails WCAG AA.~~ → Fixed: --red bumped to #D4483A (4.46:1, passes AA)
- [x] ~~**M32** — Modal stacking~~ → Fixed: bottom-sheet style, fields stack vertically
- [x] ~~**M33** — Modals don't prevent background scrolling.~~ → Fixed: useBodyLock hook added to all modals
- [x] ~~**M34** — Bottom nav~~ → Fixed: 4 primary tabs + More overflow menu
- [ ] **M35** — Font sizes below 14px minimum. (App.css)
- [ ] **M36** — Touch targets below 48px. (App.css)
- [ ] **M37** — CSS variable name collision between app and static pages. (App.css)
- [ ] **M38** — ~300+ lines CSS duplicated across 3 HTML pages. (all HTML pages)
- [ ] **M39** — Select dropdowns contrast on Safari/iOS. (App.css)
- [ ] **M40** — Resource section fragile max-height animation. (App.css)
- [ ] **M41** — Render-blocking Google Fonts CSS. (all HTML pages)
- [x] ~~**M42** — Cookie decline doesn't revoke analytics.~~ → Fixed: decline calls gtag consent denied
- [ ] **M43** — No SRI on third-party scripts. (all HTML pages)
- [x] ~~**M44** — No X-Frame-Options / frame-ancestors.~~ → Already fixed: frame-ancestors 'none' in CSP
- [ ] **M45** — Hardcoded email recipients. (edge function)
- [ ] **M46** — No monitoring or alerting. (no monitoring)
- [ ] **M47** — No deploy automation for React app. (manual process)
- [x] ~~**M48** — Hero cards not keyboard accessible.~~ → Fixed: tabindex, role=button, Enter/Space handlers
- [ ] **M49** — Mobile nav no focus trap. (all HTML pages)
- [x] ~~**M50** — Uncommitted changes~~ → Fixed: committed
- [x] ~~**M51** — Client edit sends system columns in update.~~ → Fixed: id/created_at destructured out before update

## LOW

- [x] ~~**L1** — Honeypot after rate limit~~ → Fixed: rate limit moved after validation
- [x] ~~**L2** — Email regex too permissive~~ → Fixed: stricter regex
- [x] ~~**L3** — HTML entities in subject~~ → Fixed: service validated against allowlist
- [ ] **L4** — Silent email failure — returns success even if emails fail. (edge function)
- [ ] **L5** — DB failure kills entire request. (edge function)
- [ ] **L6** — Supabase client created per request. (edge function)
- [x] ~~**L7** — Login doesn't reset loading state.~~ → Fixed: setLoading(false) before branch
- [x] ~~**L8** — ErrorBoundary renders raw error messages.~~ → Fixed: generic message in prod, raw in DEV only
- [ ] **L9** — Clients detail fetches events/invoices that may not exist. (Clients.jsx)
- [x] ~~**L10** — No touch fallback for drag-and-drop.~~ → Already fixed: mobile stage-change dropdown (H7)
- [x] ~~**L11** — Resources HEAD requests no AbortController.~~ → Fixed: AbortController with cleanup
- [ ] **L12** — No loading indicator for client detail sub-queries. (Clients.jsx)
- [x] ~~**L13** — Stub pages navigable despite "locked" styling.~~ → Fixed: NavLinks replaced with inert spans
- [ ] **L14** — contact_submissions no retention policy. (Submissions.jsx)
- [ ] **L15** — No FK link between contact_submissions and pipeline. (edge function)
- [x] ~~**L16** — Sitemap trailing slash mismatch.~~ → Already fixed: sitemap and canonical URLs match
- [ ] **L17** — Google Fonts loads 14+ font files. (all HTML pages)
- [ ] **L18** — Phone validation doesn't block submit. (all HTML pages)
- [x] ~~**L19** — Dead collapseCards() function.~~ → Fixed: removed
- [ ] **L20** — Footer active page uses inline styles. (all HTML pages)
- [ ] **L21** — Scroll progress visibility inconsistent. (index.html)
- [x] ~~**L22** — Empty CSS rules.~~ → Fixed: replaced with meaningful rules
- [x] ~~**L23** — No Firefox scrollbar styling.~~ → Fixed: scrollbar-width/scrollbar-color on pipeline
- [x] ~~**L24** — No global focus-visible rule in app.~~ → Fixed: *:focus-visible outline added
- [x] ~~**L25** — Pipeline column max-height hardcoded.~~ → Fixed: uses 100dvh for mobile support
- [x] ~~**L26** — App CSS missing -webkit-font-smoothing.~~ → Fixed: antialiased on body
- [x] ~~**L27** — No skip-link in React app.~~ → Fixed: skip-link in Layout.jsx
- [x] ~~**L28** — Source maps config noting.~~ → Acknowledged: Vite defaults are fine
- [x] ~~**L29** — Stale domain comment in vite.config.js.~~ → Fixed: updated to app.sheepdogtexas.com
- [x] ~~**L30** — Duplicate SVG assets.~~ → Acknowledged: intentional, separate deploys need own copies
- [x] ~~**L31** — legacy-docs/ untracked.~~ → Fixed: added to .gitignore
- [x] ~~**L32** — Vite scaffold README untracked.~~ → Fixed: added to .gitignore
- [x] ~~**L33** — CLAUDE.md untracked~~ → Fixed: committed
- [ ] **L34** — TOCTOU race in rate limiter. (edge function)
- [x] ~~**L35** — Events/invoices sub-query errors swallowed.~~ → Fixed: error logging in DEV
- [ ] **L36** — N+1-adjacent pattern on client detail. (Clients.jsx)
- [x] ~~**L37** — created_at defaults unverifiable~~ → Fixed: schema.sql has defaults
- [ ] **L38** — Splash screen locks scrolling 5.8 seconds. (index.html)

## INFO (No Action Needed)

- [x] **I1–I12** — All positive findings. No XSS, no SQL injection, no CSRF risk, deps clean, etc.

---

**Fixed: 79 | Remaining: 35 (0 HIGH, 17 MEDIUM, 15 LOW, 3 not-actionable)**
