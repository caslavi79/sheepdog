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
- [ ] **H12** — No Content Security Policy on any page. (all HTML pages)
- [x] ~~**H13** — Rate limiter fails open~~ → Fixed: fails closed now
- [x] ~~**H14** — Malformed JSON crash~~ → Fixed: try/catch before rate limit
- [x] ~~**H15** — Unsanitized reply_to~~ → Fixed: uses safeEmail
- [x] ~~**H16** — ProtectedRoute~~ → Fixed: uses onAuthStateChange only
- [x] ~~**H17** — ResetPassword~~ → Fixed: verifies PASSWORD_RECOVERY event
- [ ] **H18** — console.error calls in production code — 6 instances. (multiple files)
- [x] ~~**H19** — Dead toggleForm() function~~ → Fixed: removed with C3
- [ ] **H20** — No `<noscript>` fallback on any page. (all HTML pages)
- [x] ~~**H21** — Responsive~~ → Fixed: tablet (1024px) + mobile (768px) breakpoints, bottom nav, stacked pipeline, card tables
- [x] ~~**H22** — Uncommitted edge function changes~~ → Fixed: committed

## MEDIUM

- [x] ~~**M1** — Env var non-null assertion~~ → Acknowledged (Deno pattern)
- [x] ~~**M2** — DNS/MX lookup no timeout~~ → Fixed: 3s timeout
- [ ] **M3** — CORS returns allowed origin even for disallowed origins. (edge function)
- [x] ~~**M4** — Service field not validated~~ → Fixed: allowlist
- [x] ~~**M5** — Rate limit cleanup swallows errors~~ → Fixed: error logging
- [x] ~~**M6** — Rate limit insert error unchecked~~ → Fixed: error logging
- [x] ~~**M7** — Pipeline insert missing company~~ → Fixed: business_name mapped
- [ ] **M8** — DNS rebinding / SSRF via MX lookup. (edge function)
- [x] ~~**M9** — Sequential Resend calls~~ → Fixed: Promise.allSettled
- [x] ~~**M10** — Password strength~~ → Fixed: minimum 8 chars
- [ ] **M11** — Hub page has no live data. (Hub.jsx)
- [ ] **M12** — Submissions page has no pagination. (Submissions.jsx)
- [ ] **M13** — Clients page has no pagination. (Clients.jsx)
- [ ] **M14** — Pipeline page has no pagination. (Pipeline.jsx)
- [ ] **M15** — Clients page has no delete functionality. (Clients.jsx)
- [ ] **M16** — Duplicate useEscapeKey hook in 3 files. (Clients.jsx, Pipeline.jsx, Submissions.jsx)
- [ ] **M17** — useEffect missing dependency in Clients.jsx. (Clients.jsx)
- [ ] **M18** — Toast setTimeout without cleanup. (Clients.jsx, Pipeline.jsx)
- [ ] **M19** — No 404/catch-all route. (App.jsx)
- [ ] **M20** — updated_at managed client-side. (Clients.jsx, Pipeline.jsx)
- [ ] **M21** — Pipeline uses hard deletes. (Pipeline.jsx)
- [ ] **M22** — No optimistic locking / concurrent edit protection. (Clients.jsx, Pipeline.jsx)
- [x] ~~**M23** — No migration files~~ → Fixed: schema.sql committed
- [ ] **M24** — Pipeline `source` column never displayed in UI. (Pipeline.jsx)
- [x] ~~**M25** — No indexes~~ → Fixed: defined in schema.sql
- [ ] **M26** — No foreign keys between events/invoices and clients. (schema)
- [ ] **M27** — rate_limits accessible to authenticated users. (Supabase RLS)
- [ ] **M28** — All authenticated users share full data access. (Supabase RLS)
- [x] ~~**M29** — Events dropdown~~ → Fixed: removed pre-selected value
- [ ] **M30** — Contrast: --steel on --char = 3.6:1, fails WCAG AA. (App.css)
- [ ] **M31** — Error text --red on --black = 3.8:1, fails WCAG AA. (App.css)
- [x] ~~**M32** — Modal stacking~~ → Fixed: bottom-sheet style, fields stack vertically
- [ ] **M33** — Modals don't prevent background scrolling. (App.css)
- [x] ~~**M34** — Bottom nav~~ → Fixed: 4 primary tabs + More overflow menu
- [ ] **M35** — Font sizes below 14px minimum. (App.css)
- [ ] **M36** — Touch targets below 48px. (App.css)
- [ ] **M37** — CSS variable name collision between app and static pages. (App.css)
- [ ] **M38** — ~300+ lines CSS duplicated across 3 HTML pages. (all HTML pages)
- [ ] **M39** — Select dropdowns contrast on Safari/iOS. (App.css)
- [ ] **M40** — Resource section fragile max-height animation. (App.css)
- [ ] **M41** — Render-blocking Google Fonts CSS. (all HTML pages)
- [ ] **M42** — Cookie decline doesn't revoke analytics. (events/staffing HTML)
- [ ] **M43** — No SRI on third-party scripts. (all HTML pages)
- [ ] **M44** — No X-Frame-Options / frame-ancestors. (all HTML pages)
- [ ] **M45** — Hardcoded email recipients. (edge function)
- [ ] **M46** — No monitoring or alerting. (no monitoring)
- [ ] **M47** — No deploy automation for React app. (manual process)
- [ ] **M48** — Hero cards not keyboard accessible. (events/index.html)
- [ ] **M49** — Mobile nav no focus trap. (all HTML pages)
- [x] ~~**M50** — Uncommitted changes~~ → Fixed: committed
- [ ] **M51** — Client edit sends system columns in update. (Clients.jsx, Pipeline.jsx)

## LOW

- [x] ~~**L1** — Honeypot after rate limit~~ → Fixed: rate limit moved after validation
- [x] ~~**L2** — Email regex too permissive~~ → Fixed: stricter regex
- [x] ~~**L3** — HTML entities in subject~~ → Fixed: service validated against allowlist
- [ ] **L4** — Silent email failure — returns success even if emails fail. (edge function)
- [ ] **L5** — DB failure kills entire request. (edge function)
- [ ] **L6** — Supabase client created per request. (edge function)
- [ ] **L7** — Login doesn't reset loading state. (Login.jsx)
- [ ] **L8** — ErrorBoundary renders raw error messages. (ErrorBoundary.jsx)
- [ ] **L9** — Clients detail fetches events/invoices that may not exist. (Clients.jsx)
- [ ] **L10** — No touch fallback for drag-and-drop. (Pipeline.jsx)
- [ ] **L11** — Resources HEAD requests no AbortController. (Resources.jsx)
- [ ] **L12** — No loading indicator for client detail sub-queries. (Clients.jsx)
- [ ] **L13** — Stub pages navigable despite "locked" styling. (Layout.jsx)
- [ ] **L14** — contact_submissions no retention policy. (Submissions.jsx)
- [ ] **L15** — No FK link between contact_submissions and pipeline. (edge function)
- [ ] **L16** — Sitemap trailing slash mismatch. (sitemap.xml)
- [ ] **L17** — Google Fonts loads 14+ font files. (all HTML pages)
- [ ] **L18** — Phone validation doesn't block submit. (all HTML pages)
- [ ] **L19** — Dead collapseCards() function. (events/index.html)
- [ ] **L20** — Footer active page uses inline styles. (all HTML pages)
- [ ] **L21** — Scroll progress visibility inconsistent. (index.html)
- [ ] **L22** — Empty CSS rules. (App.css)
- [ ] **L23** — No Firefox scrollbar styling. (App.css)
- [ ] **L24** — No global focus-visible rule in app. (App.css)
- [ ] **L25** — Pipeline column max-height hardcoded. (App.css)
- [ ] **L26** — App CSS missing -webkit-font-smoothing. (App.css)
- [ ] **L27** — No skip-link in React app. (App.css/App.jsx)
- [ ] **L28** — Source maps config noting. (vite.config.js)
- [ ] **L29** — Stale domain comment in vite.config.js. (vite.config.js)
- [ ] **L30** — Duplicate SVG assets. (root + app/public/)
- [ ] **L31** — legacy-docs/ untracked. (app/legacy-docs/)
- [ ] **L32** — Vite scaffold README untracked. (app/README.md)
- [x] ~~**L33** — CLAUDE.md untracked~~ → Fixed: committed
- [ ] **L34** — TOCTOU race in rate limiter. (edge function)
- [ ] **L35** — Events/invoices sub-query errors swallowed. (Clients.jsx)
- [ ] **L36** — N+1-adjacent pattern on client detail. (Clients.jsx)
- [x] ~~**L37** — created_at defaults unverifiable~~ → Fixed: schema.sql has defaults
- [ ] **L38** — Splash screen locks scrolling 5.8 seconds. (index.html)

## INFO (No Action Needed)

- [x] **I1–I12** — All positive findings. No XSS, no SQL injection, no CSRF risk, deps clean, etc.

---

**Fixed: 40 | Remaining: 74 (3 HIGH, 34 MEDIUM, 34 LOW, 3 not-actionable)**
