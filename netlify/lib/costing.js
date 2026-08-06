/* ============================================================
   YUAN MARKET — landed cost engine
   Turns a yuan goods price into a rupee landed cost, line by line.

   Every line reports its own PROVENANCE:
     confirmed  — Mirza Javaid Iqbal entered this from a real quote
     estimated  — a citable published rate, with source and confidence
     unsourced  — no citable figure exists; excluded from the total and
                  named openly rather than silently guessed

   The total therefore always states how complete it is. A sheet built on
   three confirmed lines and four estimates says exactly that.
   ============================================================ */
import { pgGet } from './core.js';

let rulesCache = { at: 0, rows: null };
const RULES_TTL = 5 * 60 * 1000;

export async function loadRules() {
  if (rulesCache.rows && Date.now() - rulesCache.at < RULES_TTL) return rulesCache.rows;
  const rows = await pgGet(
    'cost_rules?select=key,value,value_estimated,unit,label_en,label_ur,' +
    'estimate_source,estimate_url,estimate_checked_at,estimate_confidence,' +
    'applies_to_category,hs_code,caveat,needs_input'
  );
  rulesCache = { at: Date.now(), rows: rows || [] };
  return rulesCache.rows;
}

/* Per-listing and per-category overrides beat the global rule. */
export async function loadOverrides() {
  try {
    return await pgGet('cost_overrides?select=scope,ref_id,ref_slug,key,value,value_estimated,source_note') || [];
  } catch (e) { return []; }
}

function resolve(rules, overrides, key, categorySlug, listingId) {
  // precedence: listing override > category override > global rule
  const byListing = overrides.find(o => o.scope === 'listing' && o.key === key && o.ref_id === listingId);
  const byCat     = overrides.find(o => o.scope === 'category' && o.key === key && o.ref_slug === categorySlug);
  const rule      = rules.find(r => r.key === key);

  for (const src of [byListing, byCat]) {
    if (src && src.value != null)  return { value: Number(src.value), basis: 'confirmed', label: key, source: src.source_note || 'set by admin' };
    if (src && src.value_estimated != null) return { value: Number(src.value_estimated), basis: 'estimated', label: key, source: src.source_note || null };
  }
  if (rule) {
    if (rule.value != null) {
      return { value: Number(rule.value), basis: 'confirmed', label: rule.label_en, label_ur: rule.label_ur,
               unit: rule.unit, source: 'entered by Mirza Javaid Iqbal' };
    }
    if (rule.value_estimated != null) {
      return { value: Number(rule.value_estimated), basis: 'estimated', label: rule.label_en, label_ur: rule.label_ur,
               unit: rule.unit, source: rule.estimate_source, source_url: rule.estimate_url,
               confidence: rule.estimate_confidence, checked_at: rule.estimate_checked_at,
               caveat: rule.caveat, hs_code: rule.hs_code };
    }
    return { value: null, basis: 'unsourced', label: rule.label_en, label_ur: rule.label_ur,
             unit: rule.unit, note: rule.note || rule.caveat };
  }
  return { value: null, basis: 'unsourced', label: key };
}

/* Duty depends on the product's category — never averaged across a mixed load. */
const DUTY_KEY_BY_CATEGORY = {
  'kitchen-home':        'duty_pct_household_plastics',
  'stationery-school':   'duty_pct_stationery_notebooks',
  'toys-gifts':          'duty_pct_toys',
  'electrical-lighting': 'duty_pct_led_lighting',
  'bags-luggage':        'duty_pct_luggage_bags',
  'hardware-tools':      'duty_pct_hardware_tools',
  'cosmetics-personal':  'duty_pct_cosmetics',
  'packaging-display':   'duty_pct_packaging'
};

/**
 * @param {object} o
 *   goods_cny        yuan value of the goods (unit price x quantity)
 *   category_slug    drives which duty rule applies
 *   listing_id       enables a per-listing override
 *   fx               { rate: CNY->PKR }
 *   cbm, weight_kg   optional, for freight when a rate exists
 *   commission_pct   defaults to the agreed 20
 */
export async function computeLanded(o) {
  const rules = await loadRules();
  const overrides = await loadOverrides();
  const r = (key) => resolve(rules, overrides, key, o.category_slug, o.listing_id);

  const lines = [];
  const push = (id, res, amount_pkr, extra = {}) => lines.push({
    id, label: res.label || id, label_ur: res.label_ur || null,
    basis: res.basis, value: res.value, unit: res.unit || null,
    amount_pkr: amount_pkr == null ? null : Math.round(amount_pkr),
    source: res.source || null, source_url: res.source_url || null,
    confidence: res.confidence || null, checked_at: res.checked_at || null,
    caveat: res.caveat || null, hs_code: res.hs_code || null, note: res.note || null,
    ...extra
  });

  const rate = o.fx && o.fx.rate;
  if (!(rate > 0)) {
    return { ok: false, reason: 'no_fx', message: 'Live rate unavailable — refusing to quote a landed cost.' };
  }

  /* 1. goods, converted */
  const goodsPkr = Number(o.goods_cny) * rate;
  push('goods', { basis: 'confirmed', label: 'Goods value', source: 'supplier listing' }, goodsPkr,
       { detail_cny: Number(o.goods_cny), fx_rate: rate });

  /* 2. freight — only if a real rate exists */
  const seaRate = r('sea_freight_per_cbm_usd');
  const usdCny = o.fx && o.fx.to_cny && o.fx.to_cny.USD;
  let freightPkr = null;
  if (seaRate.value != null && o.cbm > 0 && usdCny > 0) {
    freightPkr = seaRate.value * Number(o.cbm) * usdCny * rate;
  }
  push('freight', seaRate, freightPkr, { needs: o.cbm ? null : 'carton CBM not known for this listing' });

  /* 3. customs duty — per category, per HS code. Never averaged. */
  const dutyKey = DUTY_KEY_BY_CATEGORY[o.category_slug] || null;
  const duty = dutyKey ? r(dutyKey) : { value: null, basis: 'unsourced', label: 'Customs duty' };
  // duty is assessed on the assessed value: goods + freight where freight is known
  const dutiableBase = goodsPkr + (freightPkr || 0);
  const dutyPkr = duty.value != null ? dutiableBase * duty.value / 100 : null;
  push('duty', duty, dutyPkr, { assessed_on_pkr: Math.round(dutiableBase) });

  /* 4. additional customs duty — only applies where the CD slab is 20% */
  const acd = r('additional_customs_duty_20pct_slab');
  const acdApplies = duty.value === 20;
  push('acd', acd, (acdApplies && acd.value != null) ? dutiableBase * acd.value / 100 : null,
       { applies: acdApplies, note: acdApplies ? null : 'only applies to goods in the 20% duty slab' });

  /* 5. sales tax — on goods + freight + duty */
  const gst = r('gst_standard_rate');
  const gstBase = dutiableBase + (dutyPkr || 0);
  push('gst', gst, gst.value != null ? gstBase * gst.value / 100 : null,
       { assessed_on_pkr: Math.round(gstBase) });

  /* 6. advance income tax at import */
  const ait = r('ait_import_part2_commercial_filer');
  push('ait', ait, ait.value != null ? gstBase * ait.value / 100 : null,
       { assessed_on_pkr: Math.round(gstBase) });

  /* 7. port + clearing + inland — each only if sourced */
  for (const key of ['port_charges_pkr_per_consignment', 'clearing_agent_pkr_per_consignment']) {
    const res = r(key);
    // a per-consignment charge cannot be attributed to one item without a
    // consignment context, so it is reported but not folded into a unit price
    push(key, res, null, { per: 'consignment', value_pkr: res.value });
  }
  const inland = r('inland_karachi_to_multan_pkr_per_cbm');
  push('inland', inland,
       (inland.value != null && o.cbm > 0) ? inland.value * Number(o.cbm) : null,
       { needs: o.cbm ? null : 'carton CBM not known for this listing' });

  /* ---- totals ---- */
  const counted = lines.filter(l => l.amount_pkr != null && l.id !== 'goods');
  const costPkr = goodsPkr + counted.reduce((s, l) => s + l.amount_pkr, 0);

  const commissionPct = o.commission_pct != null ? Number(o.commission_pct)
    : (r('commission_pct').value != null ? r('commission_pct').value : 20);
  const commissionPkr = costPkr * commissionPct / 100;

  const missing = lines.filter(l => l.basis === 'unsourced').map(l => l.label);
  const estimated = lines.filter(l => l.basis === 'estimated').map(l => l.label);

  return {
    ok: true,
    fx_rate: rate,
    lines,
    commission: { pct: commissionPct, amount_pkr: Math.round(commissionPkr), basis: 'confirmed' },
    subtotal_cost_pkr: Math.round(costPkr),
    total_pkr: Math.round(costPkr + commissionPkr),
    /* Completeness is stated, never implied. The UI must show this. */
    completeness: {
      lines_total: lines.length,
      confirmed: lines.filter(l => l.basis === 'confirmed').length,
      estimated: estimated.length,
      unsourced: missing.length,
      is_final: missing.length === 0 && estimated.length === 0,
      estimated_lines: estimated,
      unsourced_lines: missing,
      caveat: missing.length
        ? 'This total excludes lines with no published rate yet, so the real landed cost will be higher.'
        : (estimated.length ? 'This total uses published estimates, not quotes obtained for your shipment.' : null)
    }
  };
}
