/* ============================================================
   /api/listing?slug=... — one listing, role-scoped
   ============================================================ */
import { pgGet, json, fail, configured, currentAccount, publicListing } from '../lib/core.js';

const COLS = [
  'id','slug','code','title_en','title_ur','title_zh','desc_en','desc_ur','desc_zh',
  'unit','moq','cny_unit_price','listed_currency','listed_price_min','listed_price_max',
  'hero_url','tier','status','category_id','capture_status','spin_frames','model_url',
  'source_platform','source_url','source_captured_at','price_verified_at','price_verified_by',
  'market_price_pkr','market_price_source','market_price_checked_at',
  'supplier_name','supplier_contact','supplier_market','supplier_city','hs_code',
  'cpfta_eligible','duty_pct_override','carton_qty','carton_weight_kg','carton_cbm',
  'cbm_per_piece','carton_source','carton_note','carton_archetype','carton_dims_cm','seller_id'
].join(',');

export default async (request) => {
  const slug = new URL(request.url).searchParams.get('slug');
  if (!slug) return fail('slug_required', 400);
  if (!configured()) return fail('db_not_configured', 503);

  let role = 'guest';
  try { const me = await currentAccount(request); if (me) role = me.role; } catch (e) {}

  try {
    const rows = await pgGet(`listings?select=${COLS}&slug=eq.${encodeURIComponent(slug)}&limit=1`);
    const l = rows && rows[0];
    if (!l) return fail('not_found', 404);
    // never expose a listing that is not live to a non-admin caller
    if (l.status !== 'live' && role !== 'admin') return fail('not_found', 404);

    const out = publicListing(l, role);
    out.desc_en = l.desc_en; out.desc_ur = l.desc_ur; out.desc_zh = l.desc_zh;
    out.carton_qty = l.carton_qty; out.carton_cbm = l.carton_cbm; out.carton_weight_kg = l.carton_weight_kg;
    /* How the shipping volume was arrived at. Public on purpose: freight is a
       real part of the price, and a buyer is entitled to see whether the volume
       behind it came from the supplier or from our own reckoning. */
    out.cbm_per_piece = l.cbm_per_piece; out.carton_source = l.carton_source;
    out.carton_note = l.carton_note; out.carton_archetype = l.carton_archetype;
    out.carton_dims_cm = l.carton_dims_cm;

    if (l.category_id) {
      const c = await pgGet(`categories?select=slug,name_en,name_ur,name_zh&id=eq.${l.category_id}&limit=1`);
      if (c && c[0]) {
        out.category_slug = c[0].slug;
        out.category_en = c[0].name_en;
        out.category_ur = c[0].name_ur;
        out.category_zh = c[0].name_zh;
      }
    }

    const media = await pgGet(
      `listing_media?select=kind,url,angle_label,sort&listing_id=eq.${l.id}&order=sort.asc`
    ).catch(() => []);
    out.media = media || [];

    return json({ ok:true, role, listing:out }, 200,
      { 'cache-control': role === 'guest' ? 'public, max-age=120' : 'no-store' });
  } catch (e) {
    return fail('lookup_failed', 500);
  }
};

export const config = { path: '/api/listing' };
