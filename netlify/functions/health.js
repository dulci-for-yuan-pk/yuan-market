/* ============================================================
   /api/health — reports whether each dependency is reachable,
   WITHOUT ever echoing a key or a secret value.
   ============================================================ */
import { pgGet, json, configured, SUPABASE_URL, SERVICE_KEY, SESSION_SECRET } from '../lib/core.js';

export default async () => {
  const out = {
    ok: true,
    checked_at: new Date().toISOString(),
    env: {
      SUPABASE_URL: SUPABASE_URL ? 'set' : 'MISSING',
      SUPABASE_SERVICE_KEY: SERVICE_KEY ? `set (${SERVICE_KEY.slice(0, 10)}…, ${SERVICE_KEY.length} chars)` : 'MISSING',
      MARKET_SESSION_SECRET: SESSION_SECRET ? 'set' : 'MISSING'
    },
    db: { reachable: false }
  };

  if (!configured()) { out.ok = false; out.db.reason = 'env_incomplete'; return json(out, 503); }

  try {
    const rows = await pgGet('categories?select=slug&limit=1');
    out.db.reachable = true;
    out.db.categories_readable = Array.isArray(rows);
    try {
      const l = await pgGet('listings?select=slug&status=eq.live&limit=1');
      out.db.listings_readable = Array.isArray(l);
      out.db.has_live_listings = Array.isArray(l) && l.length > 0;
    } catch (e2) { out.db.listings_error = String(e2.message).slice(0, 300); }
  } catch (e) {
    out.ok = false;
    out.db.reachable = false;
    out.db.reason = String(e && e.message || e).slice(0, 400);
  }

  return json(out, out.ok ? 200 : 503);
};

export const config = { path: '/api/health' };
