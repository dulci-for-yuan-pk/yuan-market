/* ============================================================
   /api/fx — live rates, cross-checked across two independent
   sources. Everything on the site is priced in CNY and PKR only,
   so we also need USD/EUR/GBP -> CNY to normalise supplier
   listings that were published in another currency.
   If the two sources disagree beyond tolerance we publish nothing
   rather than a guess.
   ============================================================ */

const MAX_DIVERGENCE_PCT = 1.0;
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, body: null };

const PRIMARY = [
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json',
  'https://latest.currency-api.pages.dev/v1/currencies/cny.json'
];
const SECONDARY = 'https://open.er-api.com/v6/latest/CNY';

async function getJson(url, ms = 7000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} -> ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Both sources are quoted with CNY as base: value = units of X per 1 CNY.
   So X -> CNY is the reciprocal. */
function shape(perCny, as_of, source) {
  const need = ['pkr', 'usd', 'eur', 'gbp'];
  for (const k of need) if (!(Number(perCny[k]) > 0)) throw new Error(`missing ${k}`);
  return {
    source, as_of,
    cny_pkr: Number(perCny.pkr),
    usd_cny: 1 / Number(perCny.usd),
    eur_cny: 1 / Number(perCny.eur),
    gbp_cny: 1 / Number(perCny.gbp)
  };
}

async function primary() {
  let last;
  for (const url of PRIMARY) {
    try {
      const d = await getJson(url);
      return shape(d.cny || {}, d.date || null, 'currency-api');
    } catch (e) { last = e; }
  }
  throw last || new Error('primary unavailable');
}
async function secondary() {
  const d = await getJson(SECONDARY);
  const r = d && d.rates ? d.rates : {};
  return shape(
    { pkr: r.PKR, usd: r.USD, eur: r.EUR, gbp: r.GBP },
    d.time_last_update_utc || null, 'open.er-api'
  );
}

export default async () => {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'access-control-allow-origin': '*'
  };
  if (cache.body && Date.now() - cache.at < TTL_MS) {
    return new Response(JSON.stringify(cache.body), { headers });
  }

  const [p, s] = await Promise.allSettled([primary(), secondary()]);
  const pv = p.status === 'fulfilled' ? p.value : null;
  const sv = s.status === 'fulfilled' ? s.value : null;

  if (!pv && !sv) {
    return new Response(JSON.stringify({
      ok: false, reason: 'no_source',
      message: 'Both rate sources are unreachable. No rate is being published.'
    }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  }

  // cross-check the pair that actually prices the goods for the buyer
  let divergence = null;
  if (pv && sv) {
    divergence = Math.abs(pv.cny_pkr - sv.cny_pkr) / ((pv.cny_pkr + sv.cny_pkr) / 2) * 100;
    if (divergence > MAX_DIVERGENCE_PCT) {
      return new Response(JSON.stringify({
        ok: false, reason: 'divergent_sources',
        divergence_pct: Number(divergence.toFixed(3)),
        message: 'Rate sources disagree beyond tolerance. Refusing to publish a rate.'
      }), { status: 409, headers: { ...headers, 'cache-control': 'no-store' } });
    }
  }

  const c = pv || sv;
  const r4 = v => Number(v.toFixed(4));
  const body = {
    ok: true,
    rate: r4(c.cny_pkr),                 // ¥1 -> PKR (headline)
    pair: 'CNY/PKR',
    to_cny: { USD: r4(c.usd_cny), EUR: r4(c.eur_cny), GBP: r4(c.gbp_cny), CNY: 1 },
    as_of: c.as_of,
    source: c.source,
    cross_checked: !!(pv && sv),
    divergence_pct: divergence == null ? null : Number(divergence.toFixed(3)),
    fetched_at: new Date().toISOString()
  };

  cache = { at: Date.now(), body };
  return new Response(JSON.stringify(body), { headers });
};

export const config = { path: '/api/fx' };
