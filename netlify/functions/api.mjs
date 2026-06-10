import { getStore } from '@netlify/blobs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });

function checkAuth(req) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const adminToken = process.env.ADMIN_TOKEN || '';
  return adminToken.length > 0 && token === adminToken;
}

function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidSlug(str) {
  return /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/.test(str);
}

function generateSlug(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  // Use crypto for better randomness
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  for (const byte of arr) {
    result += chars[byte % chars.length];
  }
  return result;
}

function sanitizeSlug(raw) {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function listLinks(store) {
  const { blobs } = await store.list();
  if (!blobs.length) return json([]);
  const links = await Promise.all(
    blobs.map(async (b) => {
      try {
        const raw = await store.get(b.key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })
  );
  const sorted = links
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return json(sorted);
}

async function createLink(store, req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { destination, title = '', slug: rawSlug } = body;

  if (!destination || !isValidUrl(destination)) {
    return json({ error: 'A valid http(s) destination URL is required' }, 400);
  }

  let slug;
  if (rawSlug) {
    slug = sanitizeSlug(rawSlug);
    if (!slug || !isValidSlug(slug)) {
      return json(
        { error: 'Slug must be 1–63 chars: a–z, 0–9, hyphens (not at start/end)' },
        400
      );
    }
  } else {
    // Auto-generate a unique slug
    let attempts = 0;
    do {
      slug = generateSlug(6 + attempts);
      attempts++;
    } while ((await store.get(slug)) && attempts < 5);
  }

  // Uniqueness check
  const existing = await store.get(slug);
  if (existing) {
    return json({ error: `Slug "${slug}" is already taken` }, 400);
  }

  const now = new Date().toISOString();
  const link = {
    slug,
    destination,
    title: title.slice(0, 120),
    enabled: true,
    scanCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await store.set(slug, JSON.stringify(link));
  return json(link, 201);
}

async function getLink(store, slug) {
  const raw = await store.get(slug);
  if (!raw) return json({ error: 'Link not found' }, 404);
  return json(JSON.parse(raw));
}

async function updateLink(store, slug, req) {
  const raw = await store.get(slug);
  if (!raw) return json({ error: 'Link not found' }, 404);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const link = JSON.parse(raw);

  if (body.destination !== undefined) {
    if (!isValidUrl(body.destination)) {
      return json({ error: 'Invalid destination URL' }, 400);
    }
    link.destination = body.destination;
  }
  if (body.title !== undefined) {
    link.title = String(body.title).slice(0, 120);
  }
  if (body.enabled !== undefined) {
    link.enabled = Boolean(body.enabled);
  }
  link.updatedAt = new Date().toISOString();

  await store.set(slug, JSON.stringify(link));
  return json(link);
}

async function deleteLink(store, slug) {
  const raw = await store.get(slug);
  if (!raw) return json({ error: 'Link not found' }, 404);
  await store.delete(slug);
  return json({ success: true });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Admin API: /api/links  and  /api/links/:slug
 * All routes require: Authorization: Bearer <ADMIN_TOKEN>
 */
export default async (req) => {
  // Auth
  if (!checkAuth(req)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  // Normalise path: strip trailing slash, remove /api/links prefix
  const path = url.pathname.replace(/\/$/, '');
  const afterBase = path.replace(/^\/api\/links/, '');
  const slugMatch = afterBase.match(/^\/([^/]+)$/);
  const slug = slugMatch ? slugMatch[1] : null;
  const method = req.method.toUpperCase();

  const store = getStore('links');

  try {
    if (!slug) {
      if (method === 'GET') return listLinks(store);
      if (method === 'POST') return createLink(store, req);
    } else {
      if (method === 'GET') return getLink(store, slug);
      if (method === 'PUT') return updateLink(store, slug, req);
      if (method === 'DELETE') return deleteLink(store, slug);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('[api] unhandled error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
};

export const config = {
  path: ['/api/links', '/api/links/:slug'],
};
