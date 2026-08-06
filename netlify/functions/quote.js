/* ============================================================
   /api/quote — landed cost for a listing at a quantity
   Public: any buyer can see the full sheet before signing up.
   ============================================================ */
import { pgGet, json, fail, configured } from '../lib/core.js';
import { computeLanded } from '../lib/costing.js';

async function liveFx(request) {
  const origin = new URL(request.url).origin;
  const r = await fetch(`${origin}/api/fx`);
  if (!r.ok) return null;
  const d = await r.json();
  return d && d.ok ? d : null;
}

export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);
  const p = new URL(request.url).searchParams;
  const slug = p.get('slug');
  const qty = Math.max(parseInt(p.get('qty') || '0', 10) || 0, 0);
  if (!slug) return fail('slug_required');

  try {
    const rows = await pgGet(
      'listings?select=id,slug,title_en,unit,moq,cny_unit_price,listed_currency,' +
      'listed_price_min,listed_price_max,sort_cny_min,category_id,carton_cbm,carton_qty,hs_code' +
      `&slug=eq.${encodeURIComponent(slug)}&status=eq.live&limit=1`
    );
    const l = rows && rows[0];
    if (!l) return fail('not_found', 404);

    const cat = l.category_id
      ? await pgGet(`categories?select=slug,name_en&id=eq.${l.category_id}&limit=1`).catch(() => null)
      : null;
    const categorySlug = cat && cat[0] ? cat[0].slug : null;

    const fx = await liveFx(request);
    if (!fx) return fail('no_fx', 503, { message: 'Live rate unavailable — we will not quote a guessed price.' });

    // unit price in yuan: a confirmed negotiated price if one exists, otherwise
    // the supplier's published price normalised through the live rate
    let unitCny = null;
    if (l.cny_unit_price != null) unitCny = Number(l.cny_unit_price);
    else if (l.listed_price_min != null) {
      const k = fx.to_cny[l.listed_currency] || (l.listed_currency === 'CNY' ? 1 : null);
      if (k) unitCny = Number(l.listed_price_min) * k;
    }
    if (unitCny == null) return fail('no_price', 409);

    const quantity = qty > 0 ? qty : (l.moq || 1);
    // carton CBM scales with how many cartons the quantity needs
    const cartons = (l.carton_qty > 0) ? Math.ceil(quantity / l.carton_qty) : null;
    const cbm = (cartons && l.carton_cbm > 0) ? cartons * Number(l.carton_cbm) : null;

    const landed = await computeLanded({
      goods_cny: unitCny * quantity,
      category_slug: categorySlug,
      listing_id: l.id,
      fx, cbm
    });
    if (!landed.ok) return fail(landed.reason, 503, { message: landed.message });

    return json({
      ok: true,
      listing: { slug: l.slug, title_en: l.title_en, unit: l.unit, moq: l.moq, hs_code: l.hs_code },
      quantity, unit_cny: Number(unitCny.toFixed(4)),
      cartons, cbm,
      per_unit_pkr: Math.round(landed.total_pkr / quantity),
      ...landed
    }, 200, { 'cache-control': 'public, max-age=120' });

  } catch (e) {
    return fail('quote_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

export const config = { path: '/api/quote' };
