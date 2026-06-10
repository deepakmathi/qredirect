# QRedirect — Deploy to Netlify (Free Tier)

## What you need
- A GitHub account (free)
- A Netlify account (free) — sign up at netlify.com

---

## Step 1 — Push to GitHub

```bash
cd /path/to/QR
git init
git add .
git commit -m "Initial QRedirect project"
```

Create a new **empty** repo on GitHub (no README), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/qredirect.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Connect to Netlify

1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**
2. Choose **GitHub** and authorise if prompted
3. Select your `qredirect` repo
4. Build settings (auto-detected from `netlify.toml`):
   - **Publish directory:** `public`
   - **Build command:** *(leave blank)*
5. Click **Deploy site**

---

## Step 3 — Set the Admin Token

This is the password that protects your admin panel.

1. In Netlify: **Site Configuration → Environment Variables → Add a variable**
2. Key: `ADMIN_TOKEN`
3. Value: any strong secret (e.g. generate one at [1password.com/password-generator](https://1password.com/password-generator/))
4. Save, then go to **Deploys → Trigger deploy → Deploy site** (so the new env var takes effect)

> **Never commit this token to Git.** It stays only in Netlify's environment.

---

## Step 4 — Verify it works

1. Open your site URL (e.g. `https://YOUR-SITE.netlify.app`)
2. Log in with your `ADMIN_TOKEN`
3. Click **New Link**, paste a destination URL, click **Create Link**
4. Click the QR icon → download the PNG
5. Scan the QR with your phone — you should land on the destination
6. Back in admin, click **Edit**, change the destination URL → **Save**
7. Scan the same QR again — you now land on the **new** destination
8. Visit `https://YOUR-SITE.netlify.app/inactive.html` to preview the disabled-link page

---

## Optional: Custom domain

1. Netlify → **Domain Management → Add a domain**
2. Follow the DNS instructions for your registrar
3. Netlify provides free HTTPS automatically

---

## Local development

```bash
npm install          # installs @netlify/blobs + netlify-cli
npx netlify dev      # runs site + functions locally on http://localhost:8888
```

Set `ADMIN_TOKEN` in a `.env` file (gitignored):
```
ADMIN_TOKEN=my-local-dev-secret
```

---

## Project structure

```
QR/
├── netlify.toml                  — build + routing config
├── package.json                  — dependencies
├── netlify/
│   └── functions/
│       ├── redirect.mjs          — GET /r/:slug  (public 302 redirect)
│       └── api.mjs               — GET/POST/PUT/DELETE /api/links[/:slug]
└── public/
    ├── index.html                — admin SPA (login + dashboard)
    └── inactive.html             — page shown for disabled/unknown slugs
```

## How storage works

All links are stored in **Netlify Blobs** (key-value store built into Netlify — no separate database). Each link is stored under its slug as a JSON object with these fields: `slug`, `destination`, `title`, `enabled`, `scanCount`, `createdAt`, `updatedAt`.
