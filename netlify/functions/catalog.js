/* ============================================================
   /api/catalog — public marketplace shelf
   Service key stays server-side. Supplier contacts are stripped
   for every role except admin. Only 'live' listings are exposed.
   ============================================================ */
import { pgGet, json, configured, currentAccount, publicListing } from '../lib/core.js';

const FALLBACK_CATEGORIES = [
  { slug:'kitchen-home', name_en:'Kitchen & Home', name_ur:'باورچی خانہ و گھریلو سامان', name_zh:'厨房与家居' },
  { slug:'stationery-school', name_en:'Stationery & School', name_ur:'سٹیشنری و سکول', name_zh:'文具与学生用品' },
  { slug:'toys-gifts', name_en:'Toys & Gifts', name_ur:'کھلونے و تحائف', name_zh:'玩具与礼品' },
  { slug:'hardware-tools', name_en:'Hardware & Tools', name_ur:'ہارڈ ویئر و اوزار', name_zh:'五金与工具' },
  { slug:'electrical-lighting', name_en:'Electrical & Lighting', name_ur:'بجلی و روشنی', name_zh:'电器与照明' },
  { slug:'bags-luggage', name_en:'Bags & Luggage', name_ur:'بیگ و سامان', name_zh:'箱包' },
  { slug:'cosmetics-personal', name_en:'Cosmetics & Personal Care', name_ur:'کاسمیٹکس و ذاتی نگہداشت', name_zh:'化妆品与个人护理' },
  { slug:'packaging-display', name_en:'Packaging & Display', name_ur:'پیکنگ و ڈسپلے', name_zh:'包装与陈列' }
];

const LIST_COLS = [
  'id','slug','code','title_en','title_ur','title_zh','unit','moq',
  'cny_unit_price','listed_currency','listed_price_min','listed_price_max',
  'hero_url','tier','status','category_id','capture_status','spin_frames','model_url',
  'source_platform','source_url','source_captured_at','price_verified_at','price_verified_by',
  'market_price_pkr','supplier_name','supplier_contact','hs_code','duty_pct_override','seller_id'
].join(',');

export default async (request) => {
  const url = new URL(request.url);
  const demo   = url.searchParams.get('demo') === '1';
  const cat    = url.searchParams.get('category');
  const tier   = url.searchParams.get('tier');
  const limit  = Math.min(parseInt(url.searchParams.get('limit') || '48', 10) || 48, 96);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

  if (!configured()) {
    return json({
      ok:true, configured:false, categories:FALLBACK_CATEGORIES, listings:[], total:0,
      note:'Database not configured for this deployment. No listings are being shown.'
    });
  }

  // role decides how much of each row the caller may see
  let role = 'guest';
  try { const me = await currentAccount(request); if (me) role = me.role; } catch (e) {}

  try {
    const cats = await pgGet(
      'categories?select=id,slug,name_en,name_ur,name_zh,blurb_en,blurb_ur,blurb_zh' +
      '&active=eq.true&order=sort.asc'
    );
    const bySlug = {}, byId = {};
    (cats || []).forEach(c => { bySlug[c.slug] = c; byId[c.id] = c; });

    let q = `listings?select=${LIST_COLS}&status=eq.live`;
    if (!demo) q += '&is_demo=eq.false';
    if (cat && bySlug[cat]) q += `&category_id=eq.${bySlug[cat].id}`;
    if (tier === 'verified' || tier === 'indicative') q += `&tier=eq.${tier}`;
    // verified goods first — they are the ones he has actually stood in front of
    q += `&order=tier.asc,published_at.desc.nullslast&limit=${limit}&offset=${offset}`;

    const rows = await pgGet(q);

    const listings = (rows || []).map(l => {
      const out = publicListing(l, role);
      const c = byId[l.category_id];
      out.category_slug = c ? c.slug : null;
      out.category_en = c ? c.name_en : null;
      out.category_ur = c ? c.name_ur : null;
      out.category_zh = c ? c.name_zh : null;
      return out;
    });

    return json({
      ok:true, configured:true, role, demo,
      categories:(cats && cats.length) ? cats : FALLBACK_CATEGORIES,
      listings, count:listings.length, offset
    }, 200, { 'cache-control': role === 'guest' ? 'public, max-age=60' : 'no-store' });

  } catch (e) {
    // Surface WHY it failed. A silent "degraded" flag hides real breakage,
    // which cost us a debugging cycle. The message never contains the key.
    const reason = String(e && e.message || e).slice(0, 400);
    return json({
      ok:true, configured:true, degraded:true,
      categories:FALLBACK_CATEGORIES, listings:[], count:0,
      note:'Catalogue temporarily unavailable.',
      reason
    });
  }
};

export const config = { path: '/api/catalog' };
