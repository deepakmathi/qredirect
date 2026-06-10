# Product Requirements Document — QRedirect

**A dynamic QR redirect manager**

| | |
|---|---|
| **Document owner** | Deepak |
| **Status** | Draft v1.0 |
| **Last updated** | June 2026 |
| **Target deployment** | Netlify (free tier) |

---

## 1. Summary

QRedirect is a small web system that lets a marketer point already-printed QR codes to *new* destinations without reprinting anything. Each QR code encodes a **permanent short link on our own domain** (e.g. `https://qredirect.netlify.app/r/summer-promo`). When someone scans it, a redirect service looks up the **current** destination for that link and forwards the visitor there. The destination can be changed at any time from a password-protected admin panel.

The printed sticker never changes. Only the mapping behind it does.

---

## 2. Problem statement

As a marketing agent, I have distributed many printed, stickable QR codes that redirect to my website. When a campaign endpoint needs to change, I cannot physically retrieve or replace the stickers already placed in the field. I need a system where the destination of a scanned QR code can be updated centrally, so every existing sticker starts redirecting to the new URL automatically.

---

## 3. Goals and non-goals

### Goals
- Let printed QR codes survive destination changes — update once, every sticker follows.
- Provide a simple admin panel to create links, set/change destinations, and download QR images.
- Make redirects fast and reliable.
- Run entirely on the Netlify free tier with no paid external services.

### Non-goals (v1)
- Multi-user accounts, roles, or team management (single admin only).
- Advanced analytics (heatmaps, conversion funnels). Basic scan counts only.
- Custom branded domain (uses the free `*.netlify.app` subdomain; custom domain is optional later).
- A/B testing or geo/device-based routing.

---

## 4. Target user

**Primary persona — "The Marketer" (Deepak)**
Runs campaigns using physical QR stickers (posters, packaging, flyers). Comfortable with a web dashboard but not necessarily technical. Needs to react quickly when a landing page, offer, or website URL changes. Wants to print once and manage forever.

---

## 5. Key concept (how it works)

The system relies on **indirection**. There are two URLs for every QR code:

1. **The permanent link** — what the QR code physically encodes. It lives on our domain and never changes: `/r/<slug>`.
2. **The destination** — where we actually want the visitor to land. This is editable at any time.

```
[ Printed QR sticker ]
        |
        v
  /r/summer-promo  ───►  QRedirect looks up "summer-promo"
        |
        v
  302 Redirect ───►  https://example.com/whatever-it-points-to-today
```

Because the QR encodes only the permanent link, changing the destination is just a database update — no reprinting.

---

## 6. User stories

1. As the marketer, I can log in to a private admin panel so others cannot edit my links.
2. As the marketer, I can create a new link by giving it a slug (or letting the system generate one) and a destination URL.
3. As the marketer, I can download the QR code image for any link as PNG and SVG so I can print it.
4. As the marketer, I can edit the destination URL of any existing link, and all printed QR codes for it instantly point to the new URL.
5. As the marketer, I can enable or disable a link (a disabled link shows a friendly "not active" page instead of redirecting).
6. As the marketer, I can see how many times each link has been scanned.
7. As the marketer, I can delete a link I no longer need.
8. As an end user, when I scan a sticker I am redirected to the current destination quickly, with no visible intermediate page.

---

## 7. Functional requirements

### 7.1 Public redirect
- **FR-1** — `GET /r/:slug` resolves the slug to its current destination and issues an HTTP redirect.
- **FR-2** — The redirect MUST use status **302 (temporary)**, not 301, so browsers and caches never permanently cache an old destination. *(This is critical — a 301 would defeat the entire purpose, because devices would cache the old URL forever.)*
- **FR-3** — Unknown or disabled slugs return a clean, branded "This link isn't active" page (HTTP 404), never a server error.
- **FR-4** — Each successful scan increments the link's scan counter.

### 7.2 Admin authentication
- **FR-5** — The admin panel and all admin API routes require authentication.
- **FR-6** — v1 uses a single shared admin token/password stored as an environment variable. The browser sends it as a bearer token on every admin API call.

### 7.3 Link management (admin)
- **FR-7** — Create a link with: destination URL (required), slug (optional — auto-generated if blank), title/label (optional).
- **FR-8** — Slugs must be unique, URL-safe (`a–z`, `0–9`, `-`), and validated on creation.
- **FR-9** — Destination URLs must be validated as well-formed `http(s)` URLs.
- **FR-10** — List all links with their slug, destination, status, and scan count.
- **FR-11** — Edit a link's destination, title, and enabled/disabled status.
- **FR-12** — Delete a link (with a confirmation step).

### 7.4 QR generation (admin)
- **FR-13** — For each link, generate the QR image client-side encoding `https://<site>/r/<slug>`.
- **FR-14** — Offer download as both PNG (for general use) and SVG (for high-quality print).
- **FR-15** — Use **error-correction level H** so stickers stay scannable even if partly damaged or covered.

---

## 8. Non-functional requirements

- **Performance** — Redirect resolution should complete in well under one second on a typical mobile connection.
- **Availability** — Redirects must keep working even if the admin panel is unused; the public path has no auth dependency.
- **Cost** — Must stay within the Netlify free tier (Functions and Blobs free quotas).
- **Security** — Admin routes protected; admin token never committed to source; HTTPS enforced by Netlify by default.
- **Usability** — Admin panel works on desktop and mobile; common tasks reachable in one or two clicks.
- **Maintainability** — Small, single-repo codebase with no external database account to manage.

---

## 9. System architecture

```
                         Netlify (free tier)
   ┌──────────────────────────────────────────────────────────┐
   │                                                            │
   │   Static site (Admin panel: HTML/JS or small React SPA)    │
   │        │                                                   │
   │        │  fetch (Bearer token)                             │
   │        ▼                                                   │
   │   Netlify Functions                                        │
   │     ├── /r/:slug          (public redirect, 302)           │
   │     └── /api/links/...     (admin CRUD, auth required)      │
   │            │                                               │
   │            ▼                                               │
   │   Netlify Blobs (built-in key-value store)                 │
   │     store "links": slug -> { destination, meta, scans }    │
   │                                                            │
   └──────────────────────────────────────────────────────────┘
```

**Why this stack:** Netlify Functions handle dynamic logic for free, and **Netlify Blobs** provides built-in key-value storage with no separate database account. Everything lives in one repo and one deploy — ideal for a small free project.

*Alternative storage* (if Blobs is ever insufficient): a free Supabase or Upstash Redis tier. Not needed for v1.

---

## 10. Data model

Stored in a Netlify Blobs store named `links`. Key = slug. Value = JSON:

| Field | Type | Description |
|---|---|---|
| `slug` | string | Unique URL-safe identifier (the part after `/r/`). |
| `destination` | string | Current target URL the QR redirects to. |
| `title` | string | Optional human label, e.g. "Summer Promo Poster". |
| `enabled` | boolean | If false, link shows the inactive page. |
| `scanCount` | number | Total successful redirects. |
| `createdAt` | ISO string | Creation timestamp. |
| `updatedAt` | ISO string | Last edit timestamp. |

---

## 11. API specification

All `/api/*` routes require header `Authorization: Bearer <ADMIN_TOKEN>`.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/r/:slug` | No | Public redirect (302) to current destination. |
| `GET` | `/api/links` | Yes | List all links. |
| `POST` | `/api/links` | Yes | Create a link `{ destination, slug?, title? }`. |
| `GET` | `/api/links/:slug` | Yes | Fetch one link. |
| `PUT` | `/api/links/:slug` | Yes | Update `{ destination?, title?, enabled? }`. |
| `DELETE` | `/api/links/:slug` | Yes | Delete a link. |

**Error handling:** validation errors → 400; missing/invalid token → 401; unknown slug → 404; everything wrapped so the public redirect never exposes a raw 500.

---

## 12. UI / UX requirements

**Login screen** — single password/token field; stores the token in memory/session for the session.

**Dashboard (link list)** — table or card list showing title, slug, destination (truncated, click to copy), status toggle, scan count, and actions (Edit, QR, Delete). A prominent "Create link" button.

**Create / Edit form** — destination URL field, optional slug, optional title, enabled toggle. Live preview of the permanent link (`/r/<slug>`).

**QR view** — renders the QR for the permanent link, with PNG and SVG download buttons and a "Copy link" button.

**Inactive page** — clean branded page for disabled/unknown slugs: short message, no technical error.

---

## 13. Security considerations

- Admin token stored only as a Netlify environment variable; never in the repo.
- All admin API functions verify the bearer token before any read/write.
- Destination URLs validated to `http(s)` to reduce abuse (no `javascript:` or other schemes).
- HTTPS enforced automatically by Netlify.
- *Known v1 limitation:* a single shared token is basic auth. If proper login is needed later, migrate to Netlify Identity (also free) — noted in Future enhancements.

---

## 14. Success metrics

- Destination of a live QR can be changed and verified working in under one minute.
- Zero reprints needed when a campaign endpoint changes.
- Redirect success rate ~100% for enabled links.
- Stays within free-tier quotas at expected scan volume.

---

## 15. Deployment plan (Netlify, free)

1. Push the repo to GitHub.
2. Connect the repo in Netlify ("Add new site → Import from Git").
3. Set the build/publish settings (static admin folder + `netlify/functions`).
4. Add environment variable `ADMIN_TOKEN` in Netlify site settings.
5. Deploy. Netlify provides a free `*.netlify.app` HTTPS domain.
6. Verify: create a test link, scan its QR, change the destination, confirm the same QR now lands elsewhere.
7. *(Optional later)* attach a custom domain.

---

## 16. Milestones

| Phase | Deliverable |
|---|---|
| **M1 — Redirect core** | `/r/:slug` function + Blobs storage; manual link entry works end to end. |
| **M2 — Admin API** | Authenticated CRUD endpoints for links. |
| **M3 — Admin UI** | Login, link list, create/edit, delete. |
| **M4 — QR generation** | QR render + PNG/SVG download in the admin. |
| **M5 — Polish & deploy** | Inactive page, validation, scan counts, deploy to Netlify, verify. |

---

## 17. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Browser/CDN caches an old destination | Use 302 (not 301); avoid long cache headers on the redirect. |
| Free-tier limits exceeded | Volume is modest for marketing scans; monitor; Blobs/Functions free quotas are generous. |
| Shared admin token leaked | Keep it out of source; rotate via env var; upgrade to Identity if needed. |
| Slug collisions | Enforce uniqueness check on create; auto-generate when blank. |
| Sticker damage reduces scannability | Generate QR at error-correction level H. |

---

## 18. Future enhancements (out of scope for v1)

- Per-link analytics (scan over time, device/OS breakdown).
- Proper multi-user login via Netlify Identity.
- Custom domain support.
- Bulk import/export of links (CSV).
- Optional intermediate landing/preview page per link.
- Geo or device-based routing (different destination by region/phone).

---

## 19. Acceptance criteria

The project is considered complete when:
- A link can be created in the admin panel and its QR downloaded as PNG and SVG.
- Scanning the QR redirects to the current destination.
- Editing the destination causes the *same* QR to redirect to the new destination on the next scan.
- A disabled/unknown slug shows the inactive page, not an error.
- Admin routes reject requests without the correct token.
- The site is live on a free Netlify URL over HTTPS.
