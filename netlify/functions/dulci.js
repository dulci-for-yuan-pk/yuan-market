/* ============================================================
   The bridge between the market and DULCi.

   Two directions, one file:

   POST /api/dulci/dispatch   (admin, or the scheduled task)
       Hands queued jobs to DULCi's webhook. A job that needs the
       Director's approval is never dispatched until he has given it.

   POST /api/dulci/callback   (DULCi, authenticated by shared secret)
       Writes a result back onto the job. It can write research and
       findings. It can NEVER move an order, mark an invoice paid, or
       change a price: money and public prices stay in human hands.
   ============================================================ */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pgGet, pgPatch, json, fail, configured, requireRole, clientIp } from '../lib/core.js';

const WEBHOOK_URL    = process.env.AGENT_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.AGENT_WEBHOOK_SECRET || '';
const SITE = process.env.URL || 'https://yuan.pk';

const sign = body => createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
function signatureOk(given, body) {
  if (!WEBHOOK_SECRET || !given) return false;
  const a = Buffer.from(String(given).replace(/^sha256=/, ''), 'utf8');
  const b = Buffer.from(sign(body), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* What DULCi is being asked to do, written as an instruction rather than a
   code, so the brief survives being read by a human in the audit trail. */
const BRIEF = {
  research_cost: j => `Find the real, current figure for the cost line "${j.cost_rule_key}" for importing ` +
    `general-store goods from Yiwu, China into Pakistan through Karachi. Cite the official source ` +
    `(FBR tariff, shipping line tariff, bank schedule of charges). Do not estimate silently — if you ` +
    `cannot source it, say so.`,
  research_duty: j => `Find the customs duty, additional customs duty, sales tax and advance income tax ` +
    `that apply to this product on import into Pakistan, and the HS code you based it on. Quote the FBR ` +
    `tariff for the current financial year.`,
  research_market_price: j => `Find what this product currently retails and wholesales for in Pakistan — ` +
    `Daraz, OLX, and any wholesale market listing you can verify. Give a range, with the sources. This is ` +
    `for a buyer comparing our landed price against what he can buy locally, so it must be real.`,
  translate_listing: j => `Translate this product's Chinese title and specification into natural Urdu and ` +
    `English for a Pakistani shopkeeper. Trade names, not literal translation.`,
  email_supplier: j => `Draft a message to this supplier in Chinese, in the tone of a serious repeat buyer. ` +
    `Show it to Mirza Javaid Iqbal in Urdu before anything is sent.`,
  price_check: j => `Check whether this listing's price is still current at source, and report what changed.`
};

async function dispatch(request, account) {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    return fail('webhook_not_configured', 503, {
      note: 'DULCi has no webhook address yet. Add AGENT_WEBHOOK_URL and AGENT_WEBHOOK_SECRET in Netlify, then try again.',
      note_ur: 'ابھی DULCi کا پتہ محفوظ نہیں۔ Netlify میں AGENT_WEBHOOK_URL اور AGENT_WEBHOOK_SECRET شامل کریں، پھر دوبارہ کوشش کریں۔'
    });
  }

  /* Approval is a wall, not a warning: a job that requires it and has not got
     it is simply not eligible, enforced in the query itself. */
  const jobs = await pgGet(
    'agent_jobs?select=id,kind,listing_id,order_id,seller_id,cost_rule_key,prompt,requires_approval,' +
    'approved_at&status=eq.queued&or=(requires_approval.is.false,approved_at.not.is.null)' +
    '&order=created_at.asc&limit=5'
  ) || [];
  if (!jobs.length) return json({ ok: true, dispatched: 0, note: 'Nothing waiting.' });

  const results = [];
  for (const j of jobs) {
    /* Give DULCi the product, so it never has to guess what it is looking at. */
    let listing = null;
    if (j.listing_id) {
      const rows = await pgGet('listings?select=code,slug,title_en,title_zh,title_zh_source,unit,moq,' +
        `listed_currency,listed_price_min,cny_unit_price,source_url,source_platform&id=eq.${j.listing_id}&limit=1`);
      listing = (rows && rows[0]) || null;
    }
    const brief = j.prompt || (BRIEF[j.kind] ? BRIEF[j.kind](j) : `Job: ${j.kind}`);

    const payload = JSON.stringify({
      job_id: j.id, kind: j.kind, brief,
      listing, order_id: j.order_id, seller_id: j.seller_id, cost_rule_key: j.cost_rule_key,
      callback_url: `${SITE}/api/dulci/callback`,
      site: SITE
    });

    await pgPatch(`agent_jobs?id=eq.${j.id}`, {
      status: 'running', started_at: new Date().toISOString()
    });

    try {
      const r = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-yuan-signature': 'sha256=' + sign(payload)
        },
        body: payload
      });
      if (!r.ok) throw new Error('webhook returned ' + r.status);
      results.push({ id: j.id, kind: j.kind, sent: true });
    } catch (e) {
      /* Put it back in the queue rather than losing it. */
      await pgPatch(`agent_jobs?id=eq.${j.id}`, {
        status: 'queued',
        result: { error: String(e && e.message || e).slice(0, 300), at: new Date().toISOString() }
      });
      results.push({ id: j.id, kind: j.kind, sent: false, error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return json({ ok: true, dispatched: results.filter(r => r.sent).length, results });
}

/* ---------------- CALLBACK ---------------- */
async function callback(request, rawBody) {
  if (!signatureOk(request.headers.get('x-yuan-signature'), rawBody)) {
    return fail('bad_signature', 401);
  }
  let body;
  try { body = JSON.parse(rawBody); } catch (e) { return fail('bad_json'); }

  const id = String(body.job_id || '');
  if (!id) return fail('job_id_required');

  const rows = await pgGet(`agent_jobs?select=id,kind,status&id=eq.${id}&limit=1`);
  if (!rows || !rows[0]) return fail('not_found', 404);

  const failed = body.ok === false;
  await pgPatch(`agent_jobs?id=eq.${id}`, {
    status: failed ? 'failed' : 'done',
    finished_at: new Date().toISOString(),
    /* Findings are recorded for the Director to read and act on. Nothing here
       is applied automatically: a researched duty rate becomes a suggestion in
       his console, and he decides. That is deliberate — he is the one whose
       money is at risk if a figure is wrong. */
    result: {
      ok: !failed,
      summary: body.summary ? String(body.summary).slice(0, 4000) : null,
      summary_ur: body.summary_ur ? String(body.summary_ur).slice(0, 4000) : null,
      value: body.value != null ? body.value : null,
      unit: body.unit || null,
      sources: Array.isArray(body.sources) ? body.sources.slice(0, 12) : null,
      confidence: body.confidence || null,
      error: failed ? String(body.error || 'DULCi could not complete this').slice(0, 500) : null,
      at: new Date().toISOString()
    }
  });
  return json({ ok: true });
}

export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/dulci\/?/, '').replace(/\/$/, '');

  if (request.method === 'GET' && path === 'status') {
    const g = await requireRole(request, ['admin']);
    if (g.error) return g.error;
    const queued = await pgGet('agent_jobs?select=id&status=eq.queued&limit=100');
    return json({
      ok: true,
      webhook_configured: !!(WEBHOOK_URL && WEBHOOK_SECRET),
      callback_url: `${SITE}/api/dulci/callback`,
      queued: (queued || []).length
    });
  }

  if (request.method !== 'POST') return fail('method_not_allowed', 405);

  if (path === 'callback') {
    // read the body as text, because the signature covers the exact bytes sent
    const raw = await request.text();
    return await callback(request, raw);
  }

  if (path === 'dispatch') {
    const g = await requireRole(request, ['admin']);
    if (g.error) return g.error;
    return await dispatch(request, g.account);
  }

  return fail('unknown_route', 404);
};

export const config = { path: ['/api/dulci', '/api/dulci/*'] };
