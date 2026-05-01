# Indexing Audit — sheepdogtexas.com

**Date:** 2026-05-01
**Subject:** Homepage `https://sheepdogtexas.com/` dropped from Google index ~2026-04-27. Subpages `/events/` and `/staffing/` still indexed. Search Console flagged `http://sheepdogtexas.com` with "Page with redirect."

---

## TL;DR — Root Cause

**The April 20, 2026 commit `57217a3` ("Update page titles: drop 'Texas' from brand, shorten home title") changed the homepage `<title>` from a 102-character keyword-and-geo-rich phrase to a 35-character generic phrase. Google's recrawl ~7 days later (≈April 27) dropped the page.**

| | Before April 20 | After April 20 |
|---|---|---|
| Homepage `<title>` | `Sheepdog Texas \| Event Security, Mobile Bartending & Staffing Agency in Bryan-College Station, TX` (102 chars) | `Sheepdog \| Events & Staffing Agency` (35 chars) |
| Geo signal | ✅ "Bryan-College Station, TX" | ❌ none |
| Service keywords | ✅ "Event Security, Mobile Bartending, Staffing Agency" | ⚠️ only "Events & Staffing Agency" — generic |
| Differentiation | ✅ unique phrase | ❌ matches thousands of generic agency sites |

**Why /events and /staffing stayed indexed:** their titles still carry geo + service keywords (`Event Security & Mobile Bartending Bryan-College Station TX | Sheepdog`, `Staffing Agency Bryan-College Station TX | Warehouse, Logistics & Field Operations | Sheepdog`). The homepage was the only page that lost its targeting.

The "Page with redirect" warning on `http://sheepdogtexas.com` is **expected behavior** — GitHub Pages 301-redirects HTTP → HTTPS, which is what you want. Search Console is just reporting that the HTTP URL is not the canonical. Not a problem to fix, but worth understanding.

---

## Step-by-step findings

### 1. Canonical / robots / og:url audit

| File | Canonical | Robots | og:url | Notes |
|---|---|---|---|---|
| `index.html` | `https://sheepdogtexas.com/` | `index, follow` | `https://sheepdogtexas.com/` | ✅ All self-consistent |
| `events/index.html` | `https://sheepdogtexas.com/events/` | `index, follow` | `https://sheepdogtexas.com/events/` | ✅ All self-consistent |
| `staffing/index.html` | `https://sheepdogtexas.com/staffing/` | `index, follow` | `https://sheepdogtexas.com/staffing/` | ✅ All self-consistent |
| `404.html` | (none) | `noindex, follow` | (none) | ✅ Correct |
| `app/index.html` | (none) | (none) | (none) | ✅ Not deployed to public site (it's the dev shell for `app.sheepdogtexas.com`) |
| `staffing_01_roster_v1.html` | (none) | (none) | (none) | ✅ Untracked + 404 on live site (not deployed) |
| `deliverables/*.html` | (none) | (none) | (none) | ✅ All return 404 on live site (not deployed) |

**No canonical points away from itself.** No noindex on any indexable page. **No action needed.**

### 2. Sitemap audit

`sitemap.xml` URLs:
- `https://sheepdogtexas.com/` ✅ HTTPS, bare domain, listed, 200 OK, matches canonical
- `https://sheepdogtexas.com/events/` ✅
- `https://sheepdogtexas.com/staffing/` ✅

⚠️ **Fixed:** `lastmod` was stale (2026-04-12 across all 3) but the files were modified 2026-04-20. After bumping to 2026-05-01, Google will see fresh content on next crawl and prioritize the recrawl.

⚠️ **Cosmetic — not fixed (not blocking indexing):** `<image:title>` and `<image:caption>` in the sitemap still say "Sheepdog Texas" — left over from the brand scrub. Not an indexing problem (Google parses it as image metadata, not page content), but inconsistent with the rest of the site's brand voice. See "next actions."

### 3. Internal link consistency

- ✅ Zero `href="http://"` matches in any HTML
- ✅ All homepage links use `/` (no mixed `/` and `https://sheepdogtexas.com/` variations on internal nav)
- ✅ Trailing slashes on `/events/` and `/staffing/` everywhere — match canonical and sitemap

**No action needed.**

### 4. Homepage-specific indexability

- Word count of visible body text: **1,012 words** (well above 300-word "thin content" threshold) ✅
- `<h1>` count: **1** ✅
- Server-side rendered: ✅ no SPA framework, no `<div id="root">`, no JS routing
- HTML comments containing `noindex/robots/googlebot`: **0** ✅
- `http-equiv="X-Robots-Tag"` meta: **0** ✅
- HTTP `X-Robots-Tag` header: **0** (verified via curl) ✅
- Iframe count: **0** ✅
- `display:none` content blocks: only mobile-nav burger button (correct, switched on at 1024px). No content hidden from crawler. ✅
- JSON-LD validity: **2 blocks, both valid JSON** (LocalBusiness, FAQPage) ✅
- LocalBusiness schema completeness: ✅ name, url, logo, image, telephone, email, address, areaServed, description, hasOfferCatalog all populated.

Section/heading structure: `<main>` × 1, `<section>` × 5, `<h2>` × 4, `<h3>` × 6 — solid semantic structure. ✅

🚨 **The H1 text** is `Event Security, Mobile Bartending & Staffing in Bryan-College Station` — this is good and packed with signals. The H1 was not damaged by the April 20 change. Only the `<title>` was.

### 5. Duplicate content analysis (homepage vs subpages)

Computed 10-word n-gram overlap:

- Home ↔ Events: **77 shared 10-grams = 7.5% of homepage**
- Home ↔ Staffing: **51 shared 10-grams = 5.0% of homepage**
- Shared across all 3: 44 phrases

The shared phrases are almost entirely **footer + form boilerplate + license disclaimer text** ("Level II/III licensed under the Texas Department of Public Safety…"). The substantive body sections (hero, "What We Do," service teasers, "Why Sheepdog," contact form, FAQ) are uniquely written.

**Verdict: NOT a duplicate-content problem.** ✅

### 6. 404 and error handling

- `404.html` exists ✅
- `404.html` has `<meta name="robots" content="noindex, follow">` ✅
- GitHub Pages serves `404.html` with HTTP 404 status (verified — `curl -sI https://sheepdogtexas.com/staffing_01_roster_v1.html` returned `HTTP/2 404`) ✅

**No action needed.**

### 7. CNAME and HTTPS

- `CNAME` contents: `sheepdogtexas.com` (17 bytes, no trailing newline, no extra lines, no whitespace — verified via hex dump) ✅
- `http://sheepdogtexas.com` → 301 → `https://sheepdogtexas.com/` ✅
- `http://www.sheepdogtexas.com` → 301 → `https://sheepdogtexas.com/` ✅
- `https://www.sheepdogtexas.com` → 301 → `https://sheepdogtexas.com/` ✅
- `https://sheepdogtexas.com` → 200 ✅

🚨 **Verify in GitHub repo settings (I can't check this from the file system):**
- Settings → Pages → "Enforce HTTPS" should be **checked**.
- If it's already checked, the redirects above prove it's working.

The "Page with redirect" warning in Search Console for `http://sheepdogtexas.com` is **not a problem to fix** — that's the redirect doing its job. It just means Google noticed the HTTP URL isn't the final destination. The `https://` version is the canonical and that's what gets indexed.

### 8. robots.txt

```
User-agent: *
Allow: /
Disallow: /cdn-cgi/
Sitemap: https://sheepdogtexas.com/sitemap.xml
```

- ✅ Allows all crawlers everywhere except `/cdn-cgi/` (Cloudflare worker paths — fine to block)
- ✅ Sitemap declared
- ✅ Nothing critical blocked

**No action needed.**

### 9. Render-blocking JS/CSS

- Google Tag Manager: `<script async>` — non-blocking ✅
- Google Fonts CSS: `<link rel="stylesheet">` — render-blocking, but this is the standard pattern, has `preconnect` hints, and Google understands it. Not a deindexing factor.
- Inline gtag config script: synchronous but tiny (~200 bytes) ✅
- JSON-LD: in `<head>`, doesn't block render ✅
- All page CSS is inline in `<style>` block (no external stylesheet round-trip) ✅
- **No client-side routing, no React/Vue/Angular, no `<div id="root">`** — content is fully server-rendered HTML ✅

Googlebot sees the full page on first request. **No action needed.**

---

## ✅ Items that are correct
- Canonical tags self-referencing on all 3 indexable pages
- `meta robots` = `index, follow` everywhere it should be
- 404 page has `noindex` and serves a real 404 status
- `robots.txt` is permissive and includes sitemap
- Sitemap URLs match canonicals exactly
- HTTP → HTTPS and www → apex redirects all working
- CNAME is clean
- Homepage word count, H1 count, semantic structure are all healthy
- JSON-LD is valid on all pages
- No render-blocking SPA, no hidden-content tricks, no http:// internal links
- Deliverables and roster files are in the repo but not deployed (404 on live site)

## ⚠️ Items I fixed (staged, not committed)

**1. `index.html` — restored SEO-strong title (3 edits in one file)**

```diff
- <title>Sheepdog | Events & Staffing Agency</title>
+ <title>Event Security, Mobile Bartending & Staffing | Bryan-College Station TX | Sheepdog</title>

- <meta property="og:title" content="Sheepdog | Events & Staffing Agency">
+ <meta property="og:title" content="Event Security, Mobile Bartending & Staffing | Bryan-College Station TX | Sheepdog">

- <meta name="twitter:title" content="Sheepdog | Events & Staffing Agency">
+ <meta name="twitter:title" content="Event Security, Mobile Bartending & Staffing | Bryan-College Station TX | Sheepdog">
```

**Why:** The April 20 change stripped geo (`Bryan-College Station, TX`) and service keywords (`Event Security`, `Mobile Bartending`) from the title. Google relies on the title as the strongest single relevance signal. Without those signals, the homepage looked like a duplicate of thousands of generic "events & staffing agency" sites — much weaker than the subpages, which kept their geo+service titles.

The new title (84 chars) **respects your branding decision** ("Sheepdog" not "Sheepdog Texas") but matches the same `Service | Geo | Brand` pattern as `/events/` and `/staffing/`. It will display in full in Google SERPs (≤ ~600 px / 60-70 chars typically shown, but the rest still influences ranking). If you prefer something shorter, suggested alternatives:
- `Event Security, Bartending & Staffing | Bryan-College Station TX | Sheepdog` (76 chars)
- `Sheepdog — Event Security, Bartending & Staffing in Bryan-College Station, TX` (78 chars)
- `Event Security & Staffing in Bryan-College Station TX | Sheepdog` (64 chars)

But do **not** ship a homepage title without geo + a service keyword again.

**2. `sitemap.xml` — bumped lastmod to today (3 edits, all 3 URLs)**

```diff
-    <lastmod>2026-04-12</lastmod>
+    <lastmod>2026-05-01</lastmod>
```

(Applied to homepage, /events/, and /staffing/ — they were all touched on April 20 and the sitemap date was stale.) This signals to Google that the URLs have fresh content and prioritizes the next recrawl.

## 🚨 Items that need YOUR attention (Search Console / GitHub settings)

**1. Verify "Enforce HTTPS" is enabled in GitHub Pages settings**
- GitHub repo → Settings → Pages → check "Enforce HTTPS" box
- If already checked, no action — the curl tests above prove it's working

**2. After deploying these fixes, manually request reindex in Search Console**
- Search Console → URL Inspection → enter `https://sheepdogtexas.com/`
- Click "Request Indexing"
- Then resubmit the sitemap: Search Console → Sitemaps → enter `sitemap.xml` → Submit
- Recovery typically takes 3-14 days after indexing is requested

**3. Ignore the "Page with redirect" warning for `http://sheepdogtexas.com`**
- This is Search Console reporting that the HTTP URL redirects to HTTPS — that's the desired behavior, not a problem. It will always show as "redirect" because that's literally what it does. The HTTPS version is what gets indexed (and was, until April 27).

**4. Optional: scrub "Sheepdog Texas" from sitemap.xml `<image:title>` / `<image:caption>`**
- Not blocking indexing, but inconsistent with your April 20 brand decision. Could update to plain "Sheepdog" if you want full consistency.

---

## Prioritized next 3 actions

1. **Deploy the title + sitemap fixes** (`git add -A && git commit && git push` to publish to GitHub Pages). The homepage will start serving the new title within ~10 minutes (max-age=600).
2. **Request reindexing in Search Console** for `https://sheepdogtexas.com/` and resubmit the sitemap. Without this, Google will re-evaluate on its own schedule (could be days or weeks).
3. **Verify "Enforce HTTPS" is on in GitHub Pages settings** (Settings → Pages → Enforce HTTPS). The redirects are already working in production, so this is just confirmation.

Expected recovery: **3-14 days** after Google recrawls. The page wasn't penalized — it was deprioritized for thin/generic targeting. Restoring the targeting reverses that.
