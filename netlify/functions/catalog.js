/* ============================================================
   /api/catalog — public marketplace shelf
   Search, filter, sort, paginate. Service key stays server-side.
   Supplier contacts and scrape provenance are admin-only.
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
  'sort_cny_min','sort_cny_max','price_tiers',
  'hero_url','tier','status','category_id','capture_status','spin_frames','model_url',
  'source_platform','source_url','source_captured_at','price_verified_at','price_verified_by',
  'market_price_pkr','supplier_name','supplier_contact','supplier_booth','supplier_phone',
  'market_district','hs_code','duty_pct_override','seller_id','published_at'
].join(',');

/* PostgREST reserved characters inside a filter value must be neutralised, or a
   crafted query string could alter the filter expression. */
const clean = s => String(s || '').replace(/[(),.*"'\\%]/g, ' ').trim().slice(0, 80);

const SORTS = {
  price_asc:  'sort_cny_min.asc.nullslast',
  price_desc: 'sort_cny_min.desc.nullslast',
  moq_asc:    'moq.asc.nullslast',
  moq_desc:   'moq.desc.nullslast',
  newest:     'published_at.desc.nullslast',
  relevant:   'tier.asc,published_at.desc.nullslast'
};

export default async (request) => {
  const u = new URL(request.url);
  const p = u.searchParams;
  const demo     = p.get('demo') === '1';
  const cat      = p.get('category');
  const tier     = p.get('tier');
  const platform = p.get('platform');
  const q        = clean(p.get('q'));
  const priceMin = parseFloat(p.get('price_min'));   // in CNY
  const priceMax = parseFloat(p.get('price_max'));
  const moqMax   = parseInt(p.get('moq_max'), 10);
  const sort     = SORTS[p.get('sort')] || SORTS.relevant;
  const limit    = Math.min(parseInt(p.get('limit') || '48', 10) || 48, 250);
  const offset   = Math.max(parseInt(p.get('offset') || '0', 10) || 0, 0);

  if (!configured()) {
    return json({ ok:true, configured:false, categories:FALLBACK_CATEGORIES,
      listings:[], total:0, note:'Database not configured for this deployment.' });
  }

  let role = 'guest';
  try { const me = await currentAccount(request); if (me) role = me.role; } catch (e) {}

  try {
    const cats = await pgGet(
      'categories?select=id,slug,name_en,name_ur,name_zh,blurb_en,blurb_ur,blurb_zh' +
      '&active=eq.true&order=sort.asc'
    );
    const bySlug = {}, byId = {};
    (cats || []).forEach(c => { bySlug[c.slug] = c; byId[c.id] = c; });

    /* Build the filter chain once and reuse it for both the page and the count,
       so the reported total always matches what the filters actually select. */
    let f = 'status=eq.live';
    if (!demo) f += '&is_demo=eq.false';
    if (cat && bySlug[cat]) f += `&category_id=eq.${bySlug[cat].id}`;
    if (tier === 'verified' || tier === 'indicative') f += `&tier=eq.${tier}`;
    if (platform) f += `&source_platform=eq.${encodeURIComponent(clean(platform))}`;
    if (Number.isFinite(priceMin)) f += `&sort_cny_min=gte.${priceMin}`;
    if (Number.isFinite(priceMax)) f += `&sort_cny_min=lte.${priceMax}`;
    if (Number.isFinite(moqMax))   f += `&moq=lte.${moqMax}`;
    if (q) {
      // search across all three title languages
      const enc = encodeURIComponent(`*${q}*`);
      f += `&or=(title_en.ilike.${enc},title_ur.ilike.${enc},title_zh.ilike.${enc})`;
    }

    const [rows, allIds] = await Promise.all([
      pgGet(`listings?select=${LIST_COLS}&${f}&order=${sort}&limit=${limit}&offset=${offset}`),
      // exact total so pagination reports the truth, not an estimate
      pgGet(`listings?select=id&${f}&limit=1000`).catch(() => null)
    ]);
    const total = Array.isArray(allIds) ? allIds.length : null;

    const listings = (rows || []).map(l => {
      const out = publicListing(l, role);
      const c = byId[l.category_id];
      out.category_slug = c ? c.slug : null;
      out.category_en = c ? c.name_en : null;
      out.category_ur = c ? c.name_ur : null;
      out.category_zh = c ? c.name_zh : null;
      out.price_tiers = l.price_tiers && l.price_tiers.length ? l.price_tiers : null;
      return out;
    });

    /* Facet bounds so the UI can build honest slider ranges instead of guesses. */
    let facets = null;
    try {
      const bounds = await pgGet(
        'listings?select=sort_cny_min,moq&status=eq.live&is_demo=eq.false' +
        '&order=sort_cny_min.asc.nullslast&limit=1000'
      );
      const prices = (bounds || []).map(b => Number(b.sort_cny_min)).filter(n => n > 0);
      const moqs   = (bounds || []).map(b => Number(b.moq)).filter(n => n > 0);
      if (prices.length) facets = {
        price_cny: { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) },
        moq: { min: Math.min(...moqs), max: Math.max(...moqs) }
      };
    } catch (e) {}

    return json({
      ok:true, configured:true, role, demo,
      categories:(cats && cats.length) ? cats : FALLBACK_CATEGORIES,
      listings, count:listings.length, total, offset, limit, facets,
      applied: { category:cat||null, tier:tier||null, platform:platform||null,
                 q:q||null, price_min:Number.isFinite(priceMin)?priceMin:null,
                 price_max:Number.isFinite(priceMax)?priceMax:null,
                 moq_max:Number.isFinite(moqMax)?moqMax:null, sort:p.get('sort')||'relevant' }
    }, 200, { 'cache-control': role === 'guest' ? 'public, max-age=60' : 'no-store' });

  } catch (e) {
    return json({
      ok:true, configured:true, degraded:true,
      categories:FALLBACK_CATEGORIES, listings:[], count:0, total:0,
      note:'Catalogue temporarily unavailable.',
      reason: String(e && e.message || e).slice(0, 400)
    });
  }
};

export const config = { path: '/api/catalog' };
