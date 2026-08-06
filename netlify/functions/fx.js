/* ============================================================
   /api/fx — live CNY -> PKR
   Two independent sources, cross-checked. If they disagree by
   more than 1% we refuse to publish a rate rather than guess.
   No credentials required.
   ============================================================ */

const MAX_DIVERGENCE_PCT = 1.0;
const TTL_MS = 10 * 60 * 1000;

let cache = { at: 0, body: null };

const PRIMARY = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json',
  'https://latest.currency-api.pages.dev/v1/currencies/cny.json'
];
const SECONDARY = 'https://open.er-api.com/v6/latest/CNY';

async function getJson(url, ms = 6000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(url + ' -> ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function primaryRate() {
  let lastErr;
  for (const url of PRIMARY) {
    try {
      const d = await getJson(url);
      const rate = d && d.cny && Number(d.cny.pkr);
      if (rate > 0) return { rate, as_of: d.date || null, source: 'currency-api' };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('primary unavailable');
}

async function secondaryRate() {
  const d = await getJson(SECONDARY);
  const rate = d && d.rates && Number(d.rates.PKR);
  if (!(rate > 0)) throw new Error('secondary unusable');
  return { rate, as_of: d.time_last_update_utc || null, source: 'open.er-api' };
}

export default async (request) => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*'
  };

  if (cache.body && Date.now() - cache.at < TTL_MS) {
    return new Response(JSON.stringify(cache.body), { headers });
  }

  const [p, s] = await Promise.allSettled([primaryRate(), secondaryRate()]);

  const pv = p.status === 'fulfilled' ? p.value : null;
  const sv = s.status === 'fulfilled' ? s.value : null;

  if (!pv && !sv) {
    return new Response(JSON.stringify({
      ok: false,
      reason: 'no_source',
      message: 'Both rate sources are unreachable. No rate is being published.'
    }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  }

  let divergence = null;
  if (pv && sv) {
    divergence = Math.abs(pv.rate - sv.rate) / ((pv.rate + sv.rate) / 2) * 100;
    if (divergence > MAX_DIVERGENCE_PCT) {
      return new Response(JSON.stringify({
        ok: false,
        reason: 'divergent_sources',
        divergence_pct: Number(divergence.toFixed(3)),
        message: 'Rate sources disagree beyond tolerance. Refusing to publish a rate.'
      }), { status: 409, headers: { ...headers, 'cache-control': 'no-store' } });
    }
  }

  const chosen = pv || sv;
  const body = {
    ok: true,
    pair: 'CNY/PKR',
    rate: Number(chosen.rate.toFixed(4)),
    as_of: chosen.as_of,
    source: chosen.source,
    cross_checked: !!(pv && sv),
    divergence_pct: divergence == null ? null : Number(divergence.toFixed(3)),
    fetched_at: new Date().toISOString()
  };

  cache = { at: Date.now(), body };
  return new Response(JSON.stringify(body), { headers });
};

export const config = { path: '/api/fx' };
