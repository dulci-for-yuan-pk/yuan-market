/* ============================================================
   /api/admin/*  — Mirza Javaid Iqbal's console
   Every route requires an admin session, re-read from the database
   on each request. Anything that changes money or public visibility
   is written to admin_audit.
   ============================================================ */
import {
  pg, pgGet, pgCount, pgInsert, pgPatch, pgDelete, json, fail, configured,
  requireRole, clientIp, newRef
} from '../lib/core.js';
import { computeLanded, loadRules } from '../lib/costing.js';
import { amountInWordsEn, amountInWordsUr } from '../lib/pdf.js';

async function audit(account, action, extra = {}) {
  try {
    await pgInsert('admin_audit', [{
      account_id: account.id, actor_email: account.email, action, ...extra
    }]);
  } catch (e) {}
}

/* ---------------- OVERVIEW ---------------- */
async function overview(request) {
  const [
    liveListings, reviewListings, pendingRequests, pendingResults,
    placedOrders, confirmedOrders, pendingBuyers, sellers, queuedJobs
  ] = await Promise.all([
    pgCount('listings?status=eq.live'),
    pgCount('listings?status=eq.review'),
    pgCount('price_requests?status=eq.pending'),
    pgCount('scrape_results?status=eq.pending'),
    pgCount('orders?status=eq.placed'),
    pgCount('orders?status=eq.confirmed'),
    pgCount('accounts?role=eq.buyer&can_order=is.false'),
    pgCount('sellers?select=id'),
    pgCount('agent_jobs?status=in.(queued,awaiting_approval)')
  ].map(p => p.catch(() => null)));

  const rules = await loadRules().catch(() => []);
  const costHealth = {
    confirmed: rules.filter(r => r.value != null).length,
    estimated: rules.filter(r => r.value == null && r.value_estimated != null).length,
    blank:     rules.filter(r => r.value == null && r.value_estimated == null).length
  };

  /* The single most useful thing he could do right now, decided by what is
     actually blocking money — not a generic greeting. */
  let nextAction = null;
  if (costHealth.blank > 0) {
    nextAction = {
      key: 'set_costs',
      en: `${costHealth.blank} cost figures are still blank, so no landed price can be final. Enter your real freight and clearing quotes.`,
      ur: `${costHealth.blank} خرچے ابھی خالی ہیں، اس لیے کوئی حتمی قیمت نہیں بن سکتی۔ اپنے اصل کرایہ اور کلیئرنگ کے ریٹ لکھیں۔`,
      href: '/admin/#costs'
    };
  } else if (placedOrders) {
    nextAction = { key: 'enquire', en: `${placedOrders} order(s) waiting for a supplier enquiry.`,
      ur: `${placedOrders} آرڈر سپلائر سے پوچھنے کے منتظر ہیں۔`, href: '/admin/#orders' };
  } else if (pendingRequests) {
    nextAction = { key: 'price_requests', en: `${pendingRequests} supplier price change(s) to review.`,
      ur: `${pendingRequests} قیمت کی تبدیلیاں جائزے کے لیے۔`, href: '/admin/#requests' };
  } else if (reviewListings) {
    nextAction = { key: 'review_listings', en: `${reviewListings} listing(s) held back because they are incomplete.`,
      ur: `${reviewListings} اشیاء ادھوری معلومات کی وجہ سے روکی گئی ہیں۔`, href: '/admin/#listings' };
  }

  return json({
    ok: true,
    counts: {
      listings_live: liveListings, listings_review: reviewListings,
      price_requests_pending: pendingRequests, scrape_results_pending: pendingResults,
      orders_placed: placedOrders, orders_confirmed: confirmedOrders,
      buyers_awaiting_approval: pendingBuyers, sellers, agent_jobs_open: queuedJobs
    },
    cost_health: costHealth,
    next_action: nextAction
  });
}

/* ---------------- COST SETTINGS ---------------- */
async function getCosts() {
  const rows = await pgGet(
    'cost_rules?select=key,label_en,label_ur,unit,value,value_estimated,estimate_source,' +
    'estimate_url,estimate_checked_at,estimate_confidence,applies_to_category,hs_code,' +
    'caveat,note,needs_input,updated_at&order=key.asc'
  );
  const overrides = await pgGet(
    'cost_overrides?select=id,scope,ref_slug,key,value,source_note,updated_at'
  ).catch(() => []);
  return json({ ok: true, rules: rows || [], overrides: overrides || [] });
}

async function setCost(request, body, account) {
  const key = String(body.key || '').trim();
  if (!key) return fail('key_required');

  const before = await pgGet(`cost_rules?select=key,value&key=eq.${encodeURIComponent(key)}&limit=1`);
  if (!before || !before[0]) return fail('unknown_cost_key', 404);

  // clearing a value returns the line to its estimate rather than deleting it
  const value = (body.value === null || body.value === '') ? null : Number(body.value);
  if (value != null && !Number.isFinite(value)) return fail('value_not_a_number');
  if (value != null && value < 0) return fail('value_negative');

  const upd = await pgPatch(`cost_rules?key=eq.${encodeURIComponent(key)}`, {
    value,
    needs_input: value == null,
    note: body.note != null ? String(body.note).slice(0, 500) : undefined,
    updated_at: new Date().toISOString()
  });

  await audit(account, 'cost.set', {
    target_table: 'cost_rules', target_id: key,
    before: { value: before[0].value }, after: { value },
    note: body.note || null, ip: clientIp(request)
  });
  return json({ ok: true, rule: upd && upd[0] });
}

/* ---------------- LISTINGS ---------------- */
const ADMIN_LIST_COLS = [
  'id','code','slug','title_en','title_ur','title_zh','title_zh_source','category_id',
  'unit','moq','cny_unit_price','listed_currency','listed_price_min','listed_price_max',
  'sort_cny_min','hero_url','tier','status','visited_in_person','capture_status',
  'supplier_name','supplier_booth','supplier_contact','supplier_phone','supplier_store_url',
  'market_district','source_platform','source_url','source_captured_at',
  'hs_code','duty_pct_override','carton_qty','carton_cbm','market_price_pkr','published_at'
].join(',');

async function listListings(request) {
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  const q = String(p.get('q') || '').replace(/[(),.*"'\\%]/g, ' ').trim().slice(0, 80);
  const limit = Math.min(parseInt(p.get('limit') || '50', 10) || 50, 200);
  const offset = Math.max(parseInt(p.get('offset') || '0', 10) || 0, 0);

  let f = 'select=' + ADMIN_LIST_COLS;
  if (status) f += `&status=eq.${encodeURIComponent(status)}`;
  if (q) {
    const e = encodeURIComponent(`*${q}*`);
    f += `&or=(title_en.ilike.${e},title_zh_source.ilike.${e},supplier_name.ilike.${e},code.ilike.${e},supplier_booth.ilike.${e})`;
  }
  const [rows, total] = await Promise.all([
    pgGet(`listings?${f}&order=published_at.desc.nullslast&limit=${limit}&offset=${offset}`),
    pgCount(`listings?${status ? `status=eq.${encodeURIComponent(status)}` : 'select=id'}`).catch(() => null)
  ]);
  return json({ ok: true, listings: rows || [], total, limit, offset });
}

const EDITABLE = new Set([
  'title_en','title_ur','title_zh','unit','moq','cny_unit_price','hs_code',
  'duty_pct_override','carton_qty','carton_cbm','market_price_pkr','market_price_source',
  'status','visited_in_person','category_id','hero_url','desc_en','desc_ur','desc_zh',
  'supplier_name','supplier_booth','supplier_phone','supplier_contact','market_district'
]);

async function updateListing(request, body, account) {
  const id = String(body.id || '');
  if (!id) return fail('id_required');

  const patch = {};
  for (const [k, v] of Object.entries(body.fields || {})) {
    if (EDITABLE.has(k)) patch[k] = v === '' ? null : v;
  }
  if (!Object.keys(patch).length) return fail('nothing_to_update');

  const before = await pgGet(`listings?select=${ADMIN_LIST_COLS}&id=eq.${id}&limit=1`);
  if (!before || !before[0]) return fail('not_found', 404);

  // Entering a real negotiated yuan price is what marks a listing as priced by him.
  if (patch.cny_unit_price != null && patch.cny_unit_price !== '') {
    patch.price_verified_at = new Date().toISOString();
    patch.price_verified_by = account.email;
    patch.tier = 'verified';
    patch.visited_in_person = true;
  }
  if (patch.status === 'live' && !before[0].published_at) {
    patch.published_at = new Date().toISOString();
  }
  patch.updated_at = new Date().toISOString();

  const upd = await pgPatch(`listings?id=eq.${id}`, patch);

  // keep the sort-normalised price in step with an edited price
  if (patch.cny_unit_price != null) {
    await pgPatch(`listings?id=eq.${id}`, {
      sort_cny_min: Number(patch.cny_unit_price),
      sort_cny_max: Number(patch.cny_unit_price)
    }).catch(() => null);
  }

  await audit(account, 'listing.update', {
    target_table: 'listings', target_id: id,
    before: Object.fromEntries(Object.keys(patch).map(k => [k, before[0][k]])),
    after: patch, ip: clientIp(request)
  });
  return json({ ok: true, listing: upd && upd[0] });
}

async function bulkListings(request, body, account) {
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean).slice(0, 500) : [];
  const platform = body.platform ? String(body.platform) : null;
  const action = String(body.action || '');
  if (!['publish', 'pause', 'archive', 'delete'].includes(action)) return fail('bad_action');
  if (!ids.length && !platform) return fail('ids_or_platform_required');

  const where = ids.length
    ? `id=in.(${ids.join(',')})`
    : `source_platform=eq.${encodeURIComponent(platform)}`;

  let affected = 0;
  if (action === 'delete') {
    const rows = await pgGet(`listings?select=id&${where}&limit=500`);
    affected = (rows || []).length;
    // A hard delete loses the audit link, so archiving is the safer default
    // when a real delete is refused (e.g. an order references the listing).
    await pgDelete(`listings?${where}`).catch(async () => {
      await pgPatch(`listings?${where}`, { status: 'archived' });
    });
  } else {
    const status = action === 'publish' ? 'live' : action === 'pause' ? 'paused' : 'archived';
    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'live') patch.published_at = new Date().toISOString();
    const upd = await pgPatch(`listings?${where}`, patch);
    affected = (upd || []).length;
  }

  await audit(account, `listing.bulk_${action}`, {
    target_table: 'listings', target_id: platform || `${ids.length} ids`,
    after: { affected }, ip: clientIp(request)
  });
  return json({ ok: true, action, affected });
}

/* ---------------- PRICE REQUESTS ---------------- */
async function priceRequests() {
  const rows = await pgGet(
    'price_requests?select=id,listing_id,seller_id,current_cny,proposed_cny,current_moq,' +
    'proposed_moq,note,status,created_at&order=created_at.desc&limit=100'
  );
  return json({ ok: true, requests: rows || [] });
}

async function decideRequest(request, body, account) {
  const id = String(body.id || '');
  const decision = String(body.decision || '');
  if (!id) return fail('id_required');
  if (!['accepted', 'rejected', 'delisted'].includes(decision)) return fail('bad_decision');

  const rows = await pgGet(`price_requests?select=*&id=eq.${id}&limit=1`);
  const req = rows && rows[0];
  if (!req) return fail('not_found', 404);
  if (req.status !== 'pending') return fail('already_decided', 409);

  if (decision === 'accepted' && req.listing_id) {
    const patch = { updated_at: new Date().toISOString() };
    if (req.proposed_cny != null) {
      patch.cny_unit_price = req.proposed_cny;
      patch.sort_cny_min = req.proposed_cny;
      patch.sort_cny_max = req.proposed_cny;
      patch.price_verified_at = new Date().toISOString();
      patch.price_verified_by = account.email;
    }
    if (req.proposed_moq != null) patch.moq = req.proposed_moq;
    await pgPatch(`listings?id=eq.${req.listing_id}`, patch);
  }
  if (decision === 'delisted' && req.listing_id) {
    await pgPatch(`listings?id=eq.${req.listing_id}`, { status: 'paused' });
  }

  await pgPatch(`price_requests?id=eq.${id}`, {
    status: decision, decided_by: account.id, decided_at: new Date().toISOString(),
    decision_note: body.note ? String(body.note).slice(0, 500) : null
  });
  await audit(account, `price_request.${decision}`, {
    target_table: 'price_requests', target_id: id,
    before: { current: req.current_cny }, after: { proposed: req.proposed_cny },
    ip: clientIp(request)
  });
  return json({ ok: true, decision });
}

/* ---------------- ORDERS ---------------- */
const ORDER_FLOW = {
  placed:    ['enquiring', 'cancelled'],
  enquiring: ['confirmed', 'cancelled'],
  confirmed: ['invoiced', 'cancelled'],
  invoiced:  ['paid', 'cancelled'],
  paid:      ['sourcing'],
  sourcing:  ['shipped'],
  shipped:   ['delivered'],
  delivered: [],
  cancelled: []
};

async function orders(request) {
  const p = new URL(request.url).searchParams;
  const status = p.get('status');
  let f = 'select=id,ref,buyer_name,buyer_phone,buyer_city,status,total_pkr,goods_cny,' +
          'commission_pkr,created_at,updated_at,admin_note';
  if (status) f += `&status=eq.${encodeURIComponent(status)}`;
  const rows = await pgGet(`orders?${f}&order=created_at.desc&limit=100`) || [];

  /* Attach the invoice, so the console can offer "open the PDF" instead of
     making the Director hunt for a number. */
  const ids = rows.map(o => o.id);
  let byOrder = {};
  if (ids.length) {
    const invs = await pgGet('invoices?select=number,order_id,total_pkr,status,issued_at,due_at,paid_at,' +
      `payment_ref&order_id=in.(${ids.join(',')})`) || [];
    invs.forEach(i => { byOrder[i.order_id] = i; });
  }
  const csRows = await pgGet('company_settings?select=bank_iban,bank_account,bank_title&id=eq.1&limit=1').catch(() => null);
  const cs = (csRows && csRows[0]) || {};

  return json({
    ok: true,
    orders: rows.map(o => ({
      ...o,
      invoice: byOrder[o.id] ? {
        ...byOrder[o.id],
        pdf_url: '/api/invoice/' + encodeURIComponent(byOrder[o.id].number) + '.pdf'
      } : null
    })),
    flow: ORDER_FLOW,
    bank_ready: !!((cs.bank_iban || cs.bank_account) && cs.bank_title)
  });
}

async function advanceOrder(request, body, account) {
  const id = String(body.id || '');
  const to = String(body.status || '');
  if (!id || !to) return fail('id_and_status_required');

  const rows = await pgGet(`orders?select=id,ref,status,total_pkr&id=eq.${id}&limit=1`);
  const o = rows && rows[0];
  if (!o) return fail('not_found', 404);

  const allowed = ORDER_FLOW[o.status] || [];
  if (!allowed.includes(to)) {
    return fail('illegal_transition', 409,
      { from: o.status, to, allowed, note: 'An order cannot skip states — that is how money goes missing.' });
  }

  await pgPatch(`orders?id=eq.${id}`, {
    status: to, updated_at: new Date().toISOString(),
    admin_note: body.note ? String(body.note).slice(0, 1000) : undefined
  });
  await audit(account, `order.${to}`, {
    target_table: 'orders', target_id: id,
    before: { status: o.status }, after: { status: to }, ip: clientIp(request)
  });
  return json({ ok: true, from: o.status, to });
}

/* ---------------- BUYERS / SELLERS ---------------- */
async function buyers(request) {
  const p = new URL(request.url).searchParams;
  let f = 'select=id,name,business_name,city,phone,email,role,status,can_order,approved_at,' +
          'trust_tier,orders_completed,email_verified_at,created_at&role=eq.buyer';
  if (p.get('pending') === '1') f += '&can_order=is.false';
  const rows = await pgGet(`accounts?${f}&order=created_at.desc&limit=100`);
  return json({ ok: true, buyers: rows || [] });
}

async function approveBuyer(request, body, account) {
  const id = String(body.id || '');
  if (!id) return fail('id_required');
  const approve = body.approve !== false;
  await pgPatch(`accounts?id=eq.${id}`, {
    can_order: approve,
    approved_at: approve ? new Date().toISOString() : null,
    approved_by: approve ? account.id : null,
    trust_tier: body.trust_tier && ['new','known','trusted','partner'].includes(body.trust_tier)
      ? body.trust_tier : undefined
  });
  await audit(account, approve ? 'buyer.approved' : 'buyer.unapproved',
    { target_table: 'accounts', target_id: id, ip: clientIp(request) });
  return json({ ok: true, approved: approve });
}

async function sellers() {
  const rows = await pgGet(
    'sellers?select=id,account_id,shop_name,shop_name_zh,market_name,city,province,' +
    'contact_name,phone,wechat,email,alibaba_url,verified,met_in_person,met_at,created_at' +
    '&order=created_at.desc&limit=100'
  );
  return json({ ok: true, sellers: rows || [] });
}

/* ---------------- DULCi JOBS ---------------- */
const JOB_KINDS = ['email_supplier','research_duty','translate_zh','check_market_price','refresh_price','draft_listing_copy'];

async function agentJobs() {
  const rows = await pgGet(
    'agent_jobs?select=id,kind,status,listing_id,order_id,cost_rule_key,prompt,result,' +
    'requires_approval,approved_at,error,created_at,finished_at&order=created_at.desc&limit=60'
  );
  return json({ ok: true, jobs: rows || [], kinds: JOB_KINDS });
}

async function createJob(request, body, account) {
  const kind = String(body.kind || '');
  if (!JOB_KINDS.includes(kind)) return fail('bad_kind', 400, { allowed: JOB_KINDS });

  const rows = await pgInsert('agent_jobs', [{
    kind,
    listing_id: body.listing_id || null,
    order_id: body.order_id || null,
    seller_id: body.seller_id || null,
    cost_rule_key: body.cost_rule_key || null,
    prompt: body.prompt ? String(body.prompt).slice(0, 2000) : null,
    // Anything that leaves the building (an email to a supplier) always needs
    // his explicit approval. Research does not.
    requires_approval: kind === 'email_supplier',
    requested_by: account.id,
    status: 'queued'
  }]);
  await audit(account, 'agent_job.created', {
    target_table: 'agent_jobs', target_id: rows && rows[0] && rows[0].id,
    after: { kind }, ip: clientIp(request)
  });
  return json({ ok: true, job: rows && rows[0] });
}

async function approveJob(request, body, account) {
  const id = String(body.id || '');
  if (!id) return fail('id_required');
  await pgPatch(`agent_jobs?id=eq.${id}`, {
    approved_at: new Date().toISOString(), approved_by: account.id, status: 'queued'
  });
  await audit(account, 'agent_job.approved', { target_table: 'agent_jobs', target_id: id, ip: clientIp(request) });
  return json({ ok: true });
}

/* ---------------- SCRAPE REVIEW QUEUE ---------------- */
async function scrapeQueue(request) {
  const p = new URL(request.url).searchParams;
  const status = p.get('status') || 'pending';
  const rows = await pgGet(
    `scrape_results?select=id,job_id,site,title_source,price_min,price_max,currency,moq,` +
    `supplier_name,supplier_booth,product_url,image_url,category_slug,status,created_at` +
    `&status=eq.${encodeURIComponent(status)}&order=created_at.desc&limit=100`
  );
  const jobs = await pgGet(
    'scrape_jobs?select=id,site,keywords,max_items,status,items_found,items_imported,cost_usd,error,created_at' +
    '&order=created_at.desc&limit=20'
  ).catch(() => []);
  return json({ ok: true, results: rows || [], jobs: jobs || [] });
}

/* ---------------- AUDIT ---------------- */
async function auditLog() {
  const rows = await pgGet(
    'admin_audit?select=id,actor_email,action,target_table,target_id,before,after,note,at' +
    '&order=at.desc&limit=100'
  );
  return json({ ok: true, entries: rows || [] });
}

/* ---------------- QUOTE PREVIEW (admin sees full provenance) ---------------- */
async function quotePreview(request) {
  const p = new URL(request.url).searchParams;
  const id = p.get('listing_id');
  const qty = Math.max(parseInt(p.get('qty') || '100', 10) || 100, 1);
  if (!id) return fail('listing_id_required');

  const rows = await pgGet(
    'listings?select=id,title_en,cny_unit_price,listed_currency,listed_price_min,' +
    `category_id,carton_qty,carton_cbm&id=eq.${id}&limit=1`
  );
  const l = rows && rows[0];
  if (!l) return fail('not_found', 404);

  const origin = new URL(request.url).origin;
  const fxr = await fetch(`${origin}/api/fx`);
  const fx = fxr.ok ? await fxr.json() : null;
  if (!fx || !fx.ok) return fail('no_fx', 503);

  const cat = l.category_id
    ? await pgGet(`categories?select=slug&id=eq.${l.category_id}&limit=1`).catch(() => null) : null;

  let unitCny = l.cny_unit_price != null ? Number(l.cny_unit_price) : null;
  if (unitCny == null && l.listed_price_min != null) {
    const k = l.listed_currency === 'CNY' ? 1 : (fx.to_cny[l.listed_currency] || null);
    if (k) unitCny = Number(l.listed_price_min) * k;
  }
  if (unitCny == null) return fail('no_price', 409);

  const cartons = l.carton_qty > 0 ? Math.ceil(qty / l.carton_qty) : null;
  const landed = await computeLanded({
    goods_cny: unitCny * qty,
    category_slug: cat && cat[0] ? cat[0].slug : null,
    listing_id: l.id, fx,
    cbm: (cartons && l.carton_cbm > 0) ? cartons * Number(l.carton_cbm) : null
  });
  return json({ ok: true, quantity: qty, unit_cny: unitCny, ...landed });
}

/* ---------------- COMPANY / BANK SETTINGS ----------------
   Nothing here is ever guessed. Blank means blank, and an invoice
   issued while the bank fields are blank says so on its face. */
const COMPANY_FIELDS = ['legal_name','ntn','strn','address','city','phone','email','website',
  'bank_name','bank_branch','bank_title','bank_iban','bank_account','bank_swift',
  'payment_terms','invoice_note'];

async function getCompany() {
  const rows = await pgGet('company_settings?select=*&id=eq.1&limit=1');
  const c = (rows && rows[0]) || { id: 1 };
  const missing = ['legal_name','address','phone','bank_title','bank_name']
    .filter(k => !c[k]);
  const bankReady = !!(c.bank_iban || c.bank_account) && !!c.bank_title;
  return json({
    ok: true, company: c, bank_ready: bankReady, missing,
    note: bankReady ? null
      : 'Until the bank account is entered here, invoices go out without payment details and buyers are told to telephone you to confirm the account. That is deliberate — an invented account number is how money goes missing.'
  });
}

async function saveCompany(request, body, account) {
  const patch = { updated_at: new Date().toISOString(), updated_by: account.id };
  let touched = 0;
  for (const f of COMPANY_FIELDS) {
    if (!(f in body)) continue;
    const v = body[f];
    patch[f] = (v === '' || v == null) ? null : String(v).slice(0, 600).trim();
    touched++;
  }
  if (!touched) return fail('nothing_to_save');

  const before = await pgGet('company_settings?select=*&id=eq.1&limit=1');
  await pgPatch('company_settings?id=eq.1', patch);
  /* Bank fields are audited because a change here changes where money lands. */
  await audit(account, 'company.updated', {
    target_table: 'company_settings', target_id: '1',
    before: pick(before && before[0], COMPANY_FIELDS), after: pick(patch, COMPANY_FIELDS),
    ip: clientIp(request)
  });
  return await getCompany();
}
const pick = (o, keys) => {
  const out = {};
  if (!o) return out;
  keys.forEach(k => { if (k in o) out[k] = o[k]; });
  return out;
};

/* ---------------- INVOICES ---------------- */
async function issueInvoice(request, body, account) {
  const orderId = String(body.order_id || '');
  if (!orderId) return fail('order_id_required');

  const rows = await pgGet(`orders?select=*&id=eq.${orderId}&limit=1`);
  const o = rows && rows[0];
  if (!o) return fail('not_found', 404);
  if (o.status !== 'confirmed') {
    return fail('not_confirmed', 409,
      { note: 'An invoice may only be issued after the supplier has confirmed. That order is at: ' + o.status });
  }
  const already = await pgGet(`invoices?select=number&order_id=eq.${orderId}&limit=1`);
  if (already && already[0]) return fail('already_invoiced', 409, { number: already[0].number });

  const items = await pgGet(`order_items?select=title_snapshot,qty,unit_cny,line_pkr&order_id=eq.${orderId}`) || [];

  // gapless sequential number, generated in the database
  const numRow = await pg('rpc/next_invoice_number', { method: 'POST', body: '{}' }).catch(() => null);
  const number = (typeof numRow === 'string') ? numRow : (numRow && numRow.number) || null;
  if (!number) return fail('numbering_failed', 500,
    { note: 'Refusing to issue an invoice without a sequential number — a sales-tax invoice must be gapless.' });

  const total = body.total_pkr != null ? Number(body.total_pkr) : Number(o.total_pkr);
  if (!(total > 0)) return fail('bad_total');

  /* Snapshot the company and bank details as they stand right now. If the
     bank changes next year, an invoice already in a buyer's hands must not
     silently change with it. */
  const csRows = await pgGet('company_settings?select=*&id=eq.1&limit=1').catch(() => null);
  const cs = (csRows && csRows[0]) || {};
  const snapshot = pick(cs, COMPANY_FIELDS);
  const bankReady = !!((cs.bank_iban || cs.bank_account) && cs.bank_title);

  const made = await pgInsert('invoices', [{
    number, order_id: orderId,
    due_at: body.due_at || null,
    total_pkr: total,
    amount_words_en: body.amount_words_en || amountInWordsEn(total),
    amount_words_ur: body.amount_words_ur || amountInWordsUr(total),
    bank_details: Object.keys(snapshot).length ? snapshot : null,
    lines: items,
    issued_by: account.id,
    status: 'issued'
  }]);
  await pgPatch(`orders?id=eq.${orderId}`, { status: 'invoiced', updated_at: new Date().toISOString() });
  await audit(account, 'invoice.issued', {
    target_table: 'invoices', target_id: number,
    after: { total_pkr: total, order: o.ref }, ip: clientIp(request)
  });
  return json({
    ok: true, invoice: made && made[0], pdf_url: '/api/invoice/' + encodeURIComponent(number) + '.pdf',
    bank_ready: bankReady,
    warning: bankReady ? null
      : 'This invoice has no bank details on it, because none are saved in Settings yet. It tells the buyer to telephone you to confirm the account before paying.',
    warning_ur: bankReady ? null
      : 'اِس بل پر بینک کی تفصیل نہیں ہے، کیونکہ ابھی سیٹنگز میں محفوظ نہیں۔ بل میں خریدار کو لکھا ہے کہ رقم بھیجنے سے پہلے آپ سے فون پر اکاؤنٹ کی تصدیق کریں۔'
  });
}

async function markPaid(request, body, account) {
  const number = String(body.number || '');
  if (!number) return fail('number_required');
  const rows = await pgGet(`invoices?select=id,order_id,total_pkr,status&number=eq.${encodeURIComponent(number)}&limit=1`);
  const inv = rows && rows[0];
  if (!inv) return fail('not_found', 404);
  if (inv.status === 'paid') return fail('already_paid', 409);

  await pgPatch(`invoices?id=eq.${inv.id}`, {
    status: 'paid', paid_at: new Date().toISOString(),
    payment_ref: body.payment_ref ? String(body.payment_ref).slice(0, 120) : null
  });
  await pgPatch(`orders?id=eq.${inv.order_id}`, { status: 'paid', updated_at: new Date().toISOString() });
  await audit(account, 'invoice.paid', {
    target_table: 'invoices', target_id: number,
    after: { payment_ref: body.payment_ref || null }, ip: clientIp(request)
  });
  return json({ ok: true });
}

/* ---------------- CONSOLIDATION WINDOWS ---------------- */
async function listConsolidations() {
  const rows = await pgGet(
    'consolidations?select=*&order=closes_at.desc&limit=60'
  ).catch(() => []);
  const cities = await pgGet('cities?select=slug,name_en,name_ur,active&order=sort.asc').catch(() => []);
  const out = [];
  for (const w of rows || []) {
    let used = 0;
    try {
      const os = await pgGet(`orders?select=cbm&consolidation_id=eq.${w.id}&status=in.(invoiced,paid,sourcing,shipped)`);
      used = (os || []).reduce((s, o) => s + Number(o.cbm || 0), 0);
    } catch (e) {}
    out.push({ ...w, used_cbm: Number(used.toFixed(3)),
      fill_pct: w.capacity_cbm > 0 ? Math.min(Math.round(used / w.capacity_cbm * 100), 100) : 0 });
  }
  return json({ ok: true, consolidations: out, cities: cities || [] });
}

async function saveConsolidation(request, body, account) {
  const patch = {
    city_slug: body.city_slug,
    container_size: body.container_size || '40ft',
    capacity_cbm: body.capacity_cbm != null ? Number(body.capacity_cbm) : null,
    min_viable_cbm: body.min_viable_cbm != null ? Number(body.min_viable_cbm) : null,
    closes_at: body.closes_at,
    departs_at: body.departs_at || null,
    eta_at: body.eta_at || null,
    freight_total_usd: body.freight_total_usd != null ? Number(body.freight_total_usd) : null,
    fallback: body.fallback || 'roll',
    visible: body.visible !== false,
    note_en: body.note_en || null,
    note_ur: body.note_ur || null
  };
  if (!patch.city_slug) return fail('city_required');
  if (!patch.closes_at) return fail('closes_at_required');
  if (!(patch.capacity_cbm > 0)) return fail('capacity_required');

  let row;
  if (body.id) {
    const upd = await pgPatch(`consolidations?id=eq.${body.id}`, patch);
    row = upd && upd[0];
  } else {
    const made = await pgInsert('consolidations', [{
      ...patch, ref: newRef('CON'), created_by: account.id
    }]);
    row = made && made[0];
  }
  await audit(account, body.id ? 'consolidation.updated' : 'consolidation.created', {
    target_table: 'consolidations', target_id: row && row.id, after: patch, ip: clientIp(request)
  });
  return json({ ok: true, consolidation: row });
}

async function setConsolidationStatus(request, body, account) {
  const id = String(body.id || '');
  const status = String(body.status || '');
  const allowed = ['open','closed','sailing','arrived','cleared','delivered','cancelled'];
  if (!id || !allowed.includes(status)) return fail('bad_status', 400, { allowed });
  await pgPatch(`consolidations?id=eq.${id}`, { status });
  await audit(account, 'consolidation.status', { target_table:'consolidations', target_id:id,
    after:{ status }, ip: clientIp(request) });
  return json({ ok: true, status });
}

/* ---------------- ROUTER ---------------- */
export default async (request) => {
  if (!configured()) return fail('db_not_configured', 503);

  const g = await requireRole(request, ['admin']);
  if (g.error) return g.error;
  const account = g.account;

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/admin\/?/, '').replace(/\/$/, '');
  const isPost = request.method === 'POST';

  let body = {};
  if (isPost) { try { body = await request.json(); } catch (e) { return fail('bad_json'); } }

  try {
    if (!isPost) {
      switch (path) {
        case '':              case 'overview':  return await overview(request);
        case 'costs':                           return await getCosts();
        case 'listings':                        return await listListings(request);
        case 'price-requests':                  return await priceRequests();
        case 'orders':                          return await orders(request);
        case 'buyers':                          return await buyers(request);
        case 'sellers':                         return await sellers();
        case 'agent-jobs':                      return await agentJobs();
        case 'scrape-queue':                    return await scrapeQueue(request);
        case 'audit':                           return await auditLog();
        case 'quote-preview':                   return await quotePreview(request);
        case 'consolidations':                  return await listConsolidations();
        case 'company':                         return await getCompany();
        default: return fail('unknown_route', 404);
      }
    }
    switch (path) {
      case 'costs/set':            return await setCost(request, body, account);
      case 'listings/update':      return await updateListing(request, body, account);
      case 'listings/bulk':        return await bulkListings(request, body, account);
      case 'price-requests/decide':return await decideRequest(request, body, account);
      case 'orders/advance':       return await advanceOrder(request, body, account);
      case 'buyers/approve':       return await approveBuyer(request, body, account);
      case 'agent-jobs/create':    return await createJob(request, body, account);
      case 'agent-jobs/approve':   return await approveJob(request, body, account);
      case 'invoices/issue':       return await issueInvoice(request, body, account);
      case 'invoices/paid':        return await markPaid(request, body, account);
      case 'company/save':         return await saveCompany(request, body, account);
      case 'consolidations/save':  return await saveConsolidation(request, body, account);
      case 'consolidations/status':return await setConsolidationStatus(request, body, account);
      default: return fail('unknown_route', 404);
    }
  } catch (e) {
    return fail('admin_failed', 500, { reason: String(e && e.message || e).slice(0, 300) });
  }
};

export const config = { path: '/api/admin/*' };
