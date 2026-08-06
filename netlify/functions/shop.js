/* ============================================================
   /api/shop/*  — the buyer's side
   Cart, checkout, orders, invoices, consolidation windows.
   No payment is ever taken here. An order is placed free; money is
   only asked for after the supplier confirms and an invoice exists.
   ============================================================ */
import {
  pgGet, pgCount, pgInsert, pgPatch, json, fail, configured,
  currentAccount, requireRole, clientIp, newRef
} from '../lib/core.js';
import { computeLanded } from '../lib/costing.js';

async function fx(request) {
  const r = await fetch(new URL(request.url).origin + '/api/fx');
  if (!r.ok) return null;
  const d = await r.json();
  return d && d.ok ? d : null;
}

/* Yuan price for a listing: a negotiated price if one exists, else the
   supplier's published price normalised through the live rate. */
function unitCnyOf(l, rates) {
  if (l.cny_unit_price != null) return Number(l.cny_unit_price);
  if (l.listed_price_min == null) return null;
  const k = l.listed_currency === 'CNY' ? 1 : (rates.to_cny[l.listed_currency] || null);
  return k ? Number(l.listed_price_min) * k : null;
}

const LISTING_COLS = 'id,slug,title_en,title_ur,title_zh,title_zh_source,unit,moq,hero_url,' +
  'cny_unit_price,listed_currency,listed_price_min,listed_price_max,category_id,' +
  'carton_qty,carton_cbm,status';

/* ---------------- CONSOLIDATION WINDOWS ---------------- */
async function windows(request) {
  const city = new URL(request.url).searchParams.get('city');
  let f = 'consolidations?select=id,ref,city_slug,container_size,capacity_cbm,min_viable_cbm,' +
          'closes_at,departs_at,eta_at,status,fallback,note_en,note_ur' +
          '&visible=eq.true&status=eq.open&order=closes_at.asc';
  if (city) f += `&city_slug=eq.${encodeURIComponent(city)}`;
  const rows = await pgGet(f).catch(() => []);

  // committed volume per window, so the fill bar reflects reality
  const out = [];
  for (const w of rows || []) {
    let usedCbm = 0;
    try {
      const orders = await pgGet(
        `orders?select=cbm&consolidation_id=eq.${w.id}&status=in.(invoiced,paid,sourcing,shipped)`
      );
      usedCbm = (orders || []).reduce((s, o) => s + Number(o.cbm || 0), 0);
    } catch (e) {}
    const cap = Number(w.capacity_cbm) || 0;
    out.push({
      ...w,
      used_cbm: Number(usedCbm.toFixed(3)),
      free_cbm: Number(Math.max(cap - usedCbm, 0).toFixed(3)),
      fill_pct: cap > 0 ? Math.min(Math.round(usedCbm / cap * 100), 100) : 0,
      closes_in_days: Math.max(Math.ceil((new Date(w.closes_at) - Date.now()) / 86400000), 0),
      // space is held on INVOICE PAYMENT, not on order placement — an unpaid
      // order must not occupy a container that has already been paid for
      note: 'Space is held once your invoice is paid.'
    });
  }
  const cities = await pgGet('cities?select=slug,name_en,name_ur,province&active=eq.true&order=sort.asc')
    .catch(() => []);
  return json({ ok: true, windows: out, cities: cities || [] },
    200, { 'cache-control': 'public, max-age=60' });
}

/* ---------------- CART ---------------- */
async function getCart(account) {
  let rows = await pgGet(`carts?select=id,city_slug,consolidation_id&account_id=eq.${account.id}&limit=1`);
  let cart = rows && rows[0];
  if (!cart) {
    const made = await pgInsert('carts', [{ account_id: account.id }]);
    cart = made && made[0];
  }
  return cart;
}

async function cartView(request, account) {
  const cart = await getCart(account);
  const items = await pgGet(
    `cart_items?select=id,listing_id,qty,added_at&cart_id=eq.${cart.id}&order=added_at.asc`
  ) || [];
  if (!items.length) {
    return json({ ok: true, cart: { ...cart, items: [], totals: null } });
  }

  const rates = await fx(request);
  if (!rates) return fail('no_fx', 503, { message: 'Live rate unavailable — we will not price a cart on a guess.' });

  const ids = items.map(i => i.listing_id);
  const listings = await pgGet(`listings?select=${LISTING_COLS}&id=in.(${ids.join(',')})`) || [];
  const byId = Object.fromEntries(listings.map(l => [l.id, l]));

  const cats = await pgGet('categories?select=id,slug').catch(() => []);
  const catById = Object.fromEntries((cats || []).map(c => [c.id, c.slug]));

  const lines = [];
  let goodsCny = 0, totalCbm = 0, anyMissing = false;

  for (const it of items) {
    const l = byId[it.listing_id];
    if (!l) continue;
    const unit = unitCnyOf(l, rates);
    const belowMoq = l.moq != null && it.qty < l.moq;
    const cartons = l.carton_qty > 0 ? Math.ceil(it.qty / l.carton_qty) : null;
    const cbm = (cartons && l.carton_cbm > 0) ? cartons * Number(l.carton_cbm) : null;
    if (cbm == null) anyMissing = true; else totalCbm += cbm;
    if (unit != null) goodsCny += unit * it.qty;

    lines.push({
      item_id: it.id, listing_id: l.id, slug: l.slug,
      title_en: l.title_en, title_ur: l.title_ur,
      title_zh: l.title_zh || l.title_zh_source,
      hero_url: l.hero_url, unit: l.unit, moq: l.moq, qty: it.qty,
      below_moq: belowMoq,
      unit_cny: unit == null ? null : Number(unit.toFixed(4)),
      line_cny: unit == null ? null : Number((unit * it.qty).toFixed(2)),
      line_pkr: unit == null ? null : Math.round(unit * it.qty * rates.rate),
      cartons, cbm: cbm == null ? null : Number(cbm.toFixed(4)),
      category_slug: catById[l.category_id] || null
    });
  }

  /* Duty must be worked out per line, never averaged across a mixed basket. */
  const perCategory = {};
  for (const ln of lines) {
    if (ln.line_cny == null) continue;
    const k = ln.category_slug || 'unknown';
    perCategory[k] = perCategory[k] || { goods_cny: 0, cbm: 0 };
    perCategory[k].goods_cny += ln.line_cny;
    perCategory[k].cbm += ln.cbm || 0;
  }

  const groups = [];
  let subtotal = 0, commission = 0, estimated = 0, unsourced = 0, confirmed = 0;
  for (const [slug, g] of Object.entries(perCategory)) {
    const landed = await computeLanded({
      goods_cny: g.goods_cny, category_slug: slug === 'unknown' ? null : slug,
      fx: rates, cbm: g.cbm || null
    });
    if (!landed.ok) continue;
    groups.push({ category_slug: slug, ...landed });
    subtotal += landed.subtotal_cost_pkr;
    commission += landed.commission.amount_pkr;
    confirmed += landed.completeness.confirmed;
    estimated += landed.completeness.estimated;
    unsourced += landed.completeness.unsourced;
  }

  return json({
    ok: true,
    cart: {
      id: cart.id, city_slug: cart.city_slug, consolidation_id: cart.consolidation_id,
      items: lines,
      totals: {
        goods_cny: Number(goodsCny.toFixed(2)),
        fx_rate: rates.rate,
        total_cbm: Number(totalCbm.toFixed(4)),
        cbm_incomplete: anyMissing,
        subtotal_cost_pkr: Math.round(subtotal),
        commission_pkr: Math.round(commission),
        total_pkr: Math.round(subtotal + commission),
        groups,
        completeness: {
          confirmed, estimated, unsourced,
          is_final: unsourced === 0 && estimated === 0,
          caveat: unsourced
            ? 'Some shipping costs have no published rate yet, so this total is lower than the real landed cost. Your invoice will carry the confirmed figures.'
            : (estimated ? 'This total uses published estimates rather than quotes obtained for your shipment.' : null)
        }
      }
    }
  });
}

async function cartAdd(request, body, account) {
  const cart = await getCart(account);
  const slug = String(body.slug || '');
  const qty = Math.max(parseInt(body.qty, 10) || 0, 1);
  if (!slug) return fail('slug_required');

  const rows = await pgGet(`listings?select=id,moq,status&slug=eq.${encodeURIComponent(slug)}&limit=1`);
  const l = rows && rows[0];
  if (!l) return fail('not_found', 404);
  if (l.status !== 'live') return fail('not_available', 409);

  const existing = await pgGet(`cart_items?select=id,qty&cart_id=eq.${cart.id}&listing_id=eq.${l.id}&limit=1`);
  if (existing && existing[0]) {
    await pgPatch(`cart_items?id=eq.${existing[0].id}`, { qty: existing[0].qty + qty });
  } else {
    await pgInsert('cart_items', [{ cart_id: cart.id, listing_id: l.id, qty }]);
  }
  await pgPatch(`carts?id=eq.${cart.id}`, { updated_at: new Date().toISOString() });
  const n = await pgCount(`cart_items?cart_id=eq.${cart.id}`).catch(() => null);
  return json({ ok: true, count: n, below_moq: l.moq != null && qty < l.moq, moq: l.moq });
}

async function cartUpdate(request, body, account) {
  const cart = await getCart(account);
  const id = String(body.item_id || '');
  if (!id) return fail('item_id_required');
  const qty = parseInt(body.qty, 10);

  // scope the write to THIS cart so one buyer cannot edit another's basket
  const own = await pgGet(`cart_items?select=id&id=eq.${id}&cart_id=eq.${cart.id}&limit=1`);
  if (!own || !own[0]) return fail('not_found', 404);

  if (!qty || qty < 1) {
    await pgGet(`cart_items?id=eq.${id}&cart_id=eq.${cart.id}`, { method: 'DELETE' })
      .catch(async () => { await pgPatch(`cart_items?id=eq.${id}`, { qty: 1 }); });
    return json({ ok: true, removed: true });
  }
  await pgPatch(`cart_items?id=eq.${id}&cart_id=eq.${cart.id}`, { qty });
  return json({ ok: true, qty });
}

async function cartSetCity(request, body, account) {
  const cart = await getCart(account);
  const patch = {};
  if (body.city_slug !== undefined) patch.city_slug = body.city_slug || null;
  if (body.consolidation_id !== undefined) patch.consolidation_id = body.consolidation_id || null;
  patch.updated_at = new Date().toISOString();
  await pgPatch(`carts?id=eq.${cart.id}`, patch);
  return json({ ok: true, ...patch });
}

/* ---------------- CHECKOUT ---------------- */
async function checkout(request, body, account) {
  /* The order gate: an account must be verifiable before it can commit us to
     buying goods. Browsing needs nothing; ordering needs one of these. */
  const verified = !!(account.email_verified_at || account.approved_at || account.can_order);
  if (!verified) {
    return fail('not_verified', 403, {
      note: 'Verify your email or wait for Mirza Javaid Iqbal to approve your account before placing an order.',
      note_ur: 'آرڈر دینے سے پہلے اپنا ای میل تصدیق کریں یا مرزا جاوید اقبال کی منظوری کا انتظار کریں۔'
    });
  }
  if (!account.can_order) {
    return fail('awaiting_approval', 403, {
      note: 'Your account is still waiting for approval.',
      note_ur: 'آپ کا اکاؤنٹ ابھی منظوری کا منتظر ہے۔'
    });
  }

  const cart = await getCart(account);
  const items = await pgGet(`cart_items?select=id,listing_id,qty&cart_id=eq.${cart.id}`) || [];
  if (!items.length) return fail('cart_empty', 409);

  const city = String(body.city_slug || cart.city_slug || '');
  if (!city) return fail('city_required');
  const address = String(body.address || account.business_name || '').trim();
  if (!address) return fail('address_required');

  const rates = await fx(request);
  if (!rates) return fail('no_fx', 503);

  const ids = items.map(i => i.listing_id);
  const listings = await pgGet(`listings?select=${LISTING_COLS}&id=in.(${ids.join(',')})`) || [];
  const byId = Object.fromEntries(listings.map(l => [l.id, l]));
  const cats = await pgGet('categories?select=id,slug').catch(() => []);
  const catById = Object.fromEntries((cats || []).map(c => [c.id, c.slug]));

  let goodsCny = 0, totalCbm = 0;
  const perCategory = {};
  const orderItems = [];

  for (const it of items) {
    const l = byId[it.listing_id];
    if (!l) continue;
    const unit = unitCnyOf(l, rates);
    if (unit == null) return fail('item_unpriced', 409, { slug: l.slug });
    const cartons = l.carton_qty > 0 ? Math.ceil(it.qty / l.carton_qty) : null;
    const cbm = (cartons && l.carton_cbm > 0) ? cartons * Number(l.carton_cbm) : 0;
    goodsCny += unit * it.qty; totalCbm += cbm;
    const slug = catById[l.category_id] || 'unknown';
    perCategory[slug] = perCategory[slug] || { goods_cny: 0, cbm: 0 };
    perCategory[slug].goods_cny += unit * it.qty;
    perCategory[slug].cbm += cbm;
    orderItems.push({
      listing_id: l.id, title_snapshot: l.title_en, tier_snapshot: 'indicative',
      qty: it.qty, unit_cny: Number(unit.toFixed(4)),
      line_cny: Number((unit * it.qty).toFixed(2)),
      line_pkr: Math.round(unit * it.qty * rates.rate)
    });
  }

  let subtotal = 0, commission = 0, confirmed = 0, estimated = 0, unsourced = 0;
  for (const [slug, g] of Object.entries(perCategory)) {
    const landed = await computeLanded({
      goods_cny: g.goods_cny, category_slug: slug === 'unknown' ? null : slug,
      fx: rates, cbm: g.cbm || null
    });
    if (!landed.ok) continue;
    subtotal += landed.subtotal_cost_pkr;
    commission += landed.commission.amount_pkr;
    confirmed += landed.completeness.confirmed;
    estimated += landed.completeness.estimated;
    unsourced += landed.completeness.unsourced;
  }

  const made = await pgInsert('orders', [{
    ref: newRef('YM'),
    buyer_account_id: account.id,
    buyer_name: account.name, buyer_phone: account.phone,
    buyer_city: city, city_slug: city, buyer_address: address,
    consolidation_id: body.consolidation_id || cart.consolidation_id || null,
    status: 'placed',
    fx_rate: rates.rate, fx_locked_at: new Date().toISOString(),
    goods_cny: Number(goodsCny.toFixed(2)),
    landed_cost_pkr: Math.round(subtotal),
    commission_pct: 20, commission_pkr: Math.round(commission),
    total_pkr: Math.round(subtotal + commission),
    cbm: Number(totalCbm.toFixed(4)),
    buyer_note: body.note ? String(body.note).slice(0, 1000) : null,
    completeness: { confirmed, estimated, unsourced, is_final: unsourced === 0 && estimated === 0 }
  }]);
  const order = made && made[0];
  if (!order) return fail('order_failed', 500);

  await pgInsert('order_items', orderItems.map(i => ({ ...i, order_id: order.id })));
  // clear the basket only after the order exists
  await pgGet(`cart_items?cart_id=eq.${cart.id}`, { method: 'DELETE' }).catch(() => null);

  return json({ ok: true, order: { ref: order.ref, id: order.id, status: order.status,
    total_pkr: order.total_pkr, completeness: order.completeness } });
}

/* ---------------- MY ORDERS ---------------- */
async function myOrders(request, account) {
  const rows = await pgGet(
    'orders?select=id,ref,status,total_pkr,goods_cny,commission_pkr,cbm,city_slug,' +
    'buyer_address,created_at,updated_at,completeness,consolidation_id' +
    `&buyer_account_id=eq.${account.id}&order=created_at.desc&limit=50`
  ) || [];

  // attach items and any invoice, scoped to this buyer's own orders only
  const out = [];
  for (const o of rows) {
    const items = await pgGet(
      `order_items?select=title_snapshot,qty,unit_cny,line_pkr&order_id=eq.${o.id}`
    ).catch(() => []);
    const inv = await pgGet(
      `invoices?select=number,issued_at,due_at,total_pkr,status,bank_details&order_id=eq.${o.id}&limit=1`
    ).catch(() => []);
    out.push({ ...o, items: items || [], invoice: (inv && inv[0]) || null });
  }
  return json({ ok: true, orders: out });
}

async function orderDetail(request, account) {
  const ref = new URL(request.url).searchParams.get('ref');
  if (!ref) return fail('ref_required');
  const rows = await pgGet(
    `orders?select=*&ref=eq.${encodeURIComponent(ref)}&buyer_account_id=eq.${account.id}&limit=1`
  );
  const o = rows && rows[0];
  if (!o) return fail('not_found', 404);
  const items = await pgGet(`order_items?select=*&order_id=eq.${o.id}`) || [];
  const inv = await pgGet(`invoices?select=*&order_id=eq.${o.id}&limit=1`) || [];
  return json({ ok: true, order: o, items, invoice: inv[0] || null });
}

/* ---------------- SAVED LISTS ---------------- */
async function savedLists(request, account) {
  const rows = await pgGet(
    `saved_lists?select=id,name,items,created_at&account_id=eq.${account.id}&order=created_at.desc`
  ) || [];
  return json({ ok: true, lists: rows });
}

async function saveList(request, body, account) {
  const cart = await getCart(account);
  const items = await pgGet(`cart_items?select=listing_id,qty&cart_id=eq.${cart.id}`) || [];
  if (!items.length) return fail('cart_empty', 409);
  const made = await pgInsert('saved_lists', [{
    account_id: account.id,
    name: String(body.name || 'My list').slice(0, 120),
    items: items.map(i => ({ listing_id: i.listing_id, qty: i.qty }))
  }]);
  return json({ ok: true, list: made && made[0] });
}

async function restoreList(request, body, account) {
  const cart = await getCart(account);
  const rows = await pgGet(`saved_lists?select=items&id=eq.${body.id}&account_id=eq.${account.id}&limit=1`);
  const l = rows && rows[0];
  if (!l) return fail('not_found', 404);
  for (const it of (l.items || [])) {
    const ex = await pgGet(`cart_items?select=id,qty&cart_id=eq.${cart.id}&listing_id=eq.${it.listing_id}&limit=1`);
    if (ex && ex[0]) await pgPatch(`cart_items?id=eq.${ex[0].id}`, { qty: ex[0].qty + it.qty });
    else await pgInsert('cart_items', [{ cart_id: cart.id, listing_id: it.listing_id, qty: it.qty }]).catch(() => null);
  }
  return json({ ok: true, restored: (l.items || []).length });
}

/* ---------------- ROUTER ---------------- */
export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/shop\/?/, '').replace(/\/$/, '');

  // the only public route
  if (path === 'windows') return windows(request);

  const account = await currentAccount(request);
  if (!account) return fail('not_signed_in', 401);

  const isPost = request.method === 'POST';
  let body = {};
  if (isPost) { try { body = await request.json(); } catch (e) { return fail('bad_json'); } }

  try {
    if (!isPost) {
      switch (path) {
        case 'cart':        return await cartView(request, account);
        case 'orders':      return await myOrders(request, account);
        case 'order':       return await orderDetail(request, account);
        case 'saved-lists': return await savedLists(request, account);
        default: return fail('unknown_route', 404);
      }
    }
    switch (path) {
      case 'cart/add':      return await cartAdd(request, body, account);
      case 'cart/update':   return await cartUpdate(request, body, account);
      case 'cart/city':     return await cartSetCity(request, body, account);
      case 'checkout':      return await checkout(request, body, account);
      case 'saved-lists/save':    return await saveList(request, body, account);
      case 'saved-lists/restore': return await restoreList(request, body, account);
      default: return fail('unknown_route', 404);
    }
  } catch (e) {
    return fail('shop_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

export const config = { path: '/api/shop/*' };
