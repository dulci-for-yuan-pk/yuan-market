/* ============================================================
   /api/seller/*  — the Chinese supplier's side (供应商)

   Hard walls, enforced server-side and attack-tested:
     · a seller sees ONLY listings bound to their own seller_id
     · a seller CANNOT change a public price — they file a request
     · a seller never sees buyer identities, order totals, the landed
       price shown to buyers, or Yuan.pk's commission
   ============================================================ */
import {
  pgGet, pgInsert, pgPatch, json, fail, configured, requireRole, clientIp
} from '../lib/core.js';

/* Resolve the seller record bound to this account. No seller row means no data,
   never "all data" — a missing binding must fail closed. */
async function sellerOf(account) {
  const rows = await pgGet(
    'sellers?select=id,shop_name,shop_name_zh,market_name,city,province,contact_name,' +
    `phone,wechat,email,verified,met_in_person&account_id=eq.${account.id}&limit=1`
  );
  return (rows && rows[0]) || null;
}

/* Deliberately narrow. No landed price, no market price, no commission,
   no buyer-facing total — a supplier must not be able to work out our margin. */
const SELLER_COLS = 'id,code,title_en,title_zh,title_zh_source,unit,moq,cny_unit_price,' +
  'listed_currency,listed_price_min,listed_price_max,hero_url,status,capture_status,' +
  'supplier_booth,market_district,category_id,published_at';

function sellerListing(l) {
  return {
    id: l.id, code: l.code,
    title_en: l.title_en, title_zh: l.title_zh || l.title_zh_source,
    unit: l.unit, moq: l.moq,
    price_cny: l.cny_unit_price != null ? Number(l.cny_unit_price)
      : (l.listed_currency === 'CNY' && l.listed_price_min != null ? Number(l.listed_price_min) : null),
    hero_url: l.hero_url, status: l.status,
    booth: l.supplier_booth, market_district: l.market_district,
    published_at: l.published_at
  };
}

async function myShop(request, account) {
  const s = await sellerOf(account);
  if (!s) {
    return json({ ok: true, seller: null, listings: [], requests: [], enquiries: [],
      note: 'This account is not yet linked to a shop. Mirza Javaid Iqbal links it after you meet.' });
  }

  const listings = await pgGet(
    `listings?select=${SELLER_COLS}&seller_id=eq.${s.id}&order=published_at.desc.nullslast&limit=200`
  ) || [];

  const requests = await pgGet(
    'price_requests?select=id,listing_id,current_cny,proposed_cny,current_moq,proposed_moq,' +
    `note,status,decision_note,created_at,decided_at&seller_id=eq.${s.id}&order=created_at.desc&limit=60`
  ) || [];

  /* Enquiries the admin has raised with THIS supplier. The order id is
     deliberately not exposed — only the question and the product. */
  const enquiries = await pgGet(
    'supplier_enquiries?select=id,listing_id,channel,subject,body,sent_at,response_text,' +
    `response_at,status,created_at&seller_id=eq.${s.id}&status=in.(sent,answered)&order=created_at.desc&limit=40`
  ).catch(() => []);

  return json({
    ok: true,
    seller: s,
    listings: listings.map(sellerListing),
    requests,
    enquiries: (enquiries || []).map(e => ({
      id: e.id, listing_id: e.listing_id, subject: e.subject, body: e.body,
      sent_at: e.sent_at, response_text: e.response_text, response_at: e.response_at,
      status: e.status
    }))
  });
}

/* ---------------- PRICE CHANGE REQUEST ---------------- */
async function requestPrice(request, body, account) {
  const s = await sellerOf(account);
  if (!s) return fail('no_shop', 403);

  const listingId = String(body.listing_id || '');
  if (!listingId) return fail('listing_id_required');

  /* Scope the lookup to this seller. A seller passing another seller's
     listing id must get 404, not that listing. */
  const rows = await pgGet(
    `listings?select=id,cny_unit_price,listed_price_min,listed_currency,moq&id=eq.${listingId}&seller_id=eq.${s.id}&limit=1`
  );
  const l = rows && rows[0];
  if (!l) return fail('not_found', 404);

  const proposed = body.proposed_cny === '' || body.proposed_cny == null ? null : Number(body.proposed_cny);
  const proposedMoq = body.proposed_moq === '' || body.proposed_moq == null ? null : parseInt(body.proposed_moq, 10);
  if (proposed == null && proposedMoq == null) return fail('nothing_proposed');
  if (proposed != null && !(proposed > 0)) return fail('bad_price');
  if (proposedMoq != null && !(proposedMoq > 0)) return fail('bad_moq');

  // one open request per listing, so the queue cannot be flooded
  const open = await pgGet(
    `price_requests?select=id&listing_id=eq.${listingId}&status=eq.pending&limit=1`
  );
  if (open && open[0]) return fail('already_pending', 409,
    { note: 'A request for this product is already waiting for review.',
      note_zh: '该产品已有一个待审核的申请。' });

  const current = l.cny_unit_price != null ? Number(l.cny_unit_price)
    : (l.listed_currency === 'CNY' ? Number(l.listed_price_min) : null);

  const made = await pgInsert('price_requests', [{
    listing_id: listingId, seller_id: s.id, raised_by: 'seller',
    current_cny: current, proposed_cny: proposed,
    current_moq: l.moq, proposed_moq: proposedMoq,
    note: body.note ? String(body.note).slice(0, 800) : null,
    status: 'pending'
  }]);
  return json({ ok: true, request: made && made[0] });
}

/* ---------------- STOCK STATUS ----------------
   A seller MAY set this directly: it costs nobody money and stale stock
   information is worse for everyone than a supplier who can flag it. */
async function setStock(request, body, account) {
  const s = await sellerOf(account);
  if (!s) return fail('no_shop', 403);
  const listingId = String(body.listing_id || '');
  const inStock = body.in_stock !== false;

  const rows = await pgGet(`listings?select=id,status&id=eq.${listingId}&seller_id=eq.${s.id}&limit=1`);
  if (!rows || !rows[0]) return fail('not_found', 404);

  // sold_out and live are the only two a seller may toggle between
  const cur = rows[0].status;
  if (!['live', 'sold_out'].includes(cur)) {
    return fail('not_toggleable', 409,
      { note: 'This product is not published, so its stock cannot be changed here.' });
  }
  await pgPatch(`listings?id=eq.${listingId}&seller_id=eq.${s.id}`, {
    status: inStock ? 'live' : 'sold_out', updated_at: new Date().toISOString()
  });
  return json({ ok: true, status: inStock ? 'live' : 'sold_out' });
}

/* ---------------- ANSWER AN ENQUIRY ---------------- */
async function answerEnquiry(request, body, account) {
  const s = await sellerOf(account);
  if (!s) return fail('no_shop', 403);
  const id = String(body.id || '');
  const text = String(body.response || '').trim();
  if (!id || !text) return fail('id_and_response_required');

  const rows = await pgGet(`supplier_enquiries?select=id,status&id=eq.${id}&seller_id=eq.${s.id}&limit=1`);
  if (!rows || !rows[0]) return fail('not_found', 404);

  await pgPatch(`supplier_enquiries?id=eq.${id}&seller_id=eq.${s.id}`, {
    response_text: text.slice(0, 4000),
    response_at: new Date().toISOString(),
    status: 'answered'
  });
  return json({ ok: true });
}

export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);

  // seller OR admin — an admin can look at a shop to help a supplier
  const g = await requireRole(request, ['seller', 'admin']);
  if (g.error) return g.error;

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/seller\/?/, '').replace(/\/$/, '');
  const isPost = request.method === 'POST';
  let body = {};
  if (isPost) { try { body = await request.json(); } catch (e) { return fail('bad_json'); } }

  try {
    if (!isPost) {
      if (path === '' || path === 'shop') return await myShop(request, g.account);
      return fail('unknown_route', 404);
    }
    switch (path) {
      case 'price-request': return await requestPrice(request, body, g.account);
      case 'stock':         return await setStock(request, body, g.account);
      case 'enquiry/reply': return await answerEnquiry(request, body, g.account);
      default: return fail('unknown_route', 404);
    }
  } catch (e) {
    return fail('seller_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

/* Both forms: '/api/seller/*' alone does not match a bare '/api/seller'. */
export const config = { path: ['/api/seller', '/api/seller/*'] };
