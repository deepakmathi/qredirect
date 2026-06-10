import { getStore } from '@netlify/blobs';

/**
 * Public redirect handler: GET /r/:slug
 *
 * - Resolves slug → destination via Netlify Blobs
 * - Issues a 302 (never 301) so browsers never permanently cache destinations
 * - Increments scan counter asynchronously (fire-and-forget) so it never slows the redirect
 * - Unknown or disabled slugs redirect to /inactive.html with a 302
 */
export default async (req, context) => {
  const { slug } = context.params;

  if (!slug) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/inactive.html' },
    });
  }

  let link;
  try {
    const store = getStore('links');
    const raw = await store.get(slug);
    if (raw) {
      link = JSON.parse(raw);
    }
  } catch {
    // Treat storage errors as "not found"
  }

  if (!link || !link.enabled) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/inactive.html',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  // Fire-and-forget: increment scan count without blocking the redirect
  const store = getStore('links');
  const updated = {
    ...link,
    scanCount: (link.scanCount || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  store.set(slug, JSON.stringify(updated)).catch(() => {});

  return new Response(null, {
    status: 302,
    headers: {
      Location: link.destination,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    },
  });
};

export const config = {
  path: '/r/:slug',
};
