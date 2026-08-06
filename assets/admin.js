/* ============================================================
   YUAN MARKET — admin console
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const n0 = v => (v == null || v === '' || isNaN(v)) ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(v);
  const n2 = v => (v == null || v === '' || isNaN(v)) ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
  const when = iso => { try { return new Date(iso).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}); } catch(e){ return '—'; } };

  let ME = null, OVER = null;

  /* ================= GATE ================= */
  const gateErr = $('#gateErr');
  const showGateErr = m => { gateErr.textContent = m; gateErr.style.display = 'block'; };

  async function boot() {
    try {
      const d = await Y.api('/api/me');
      if (d && d.account && d.account.role === 'admin') { ME = d.account; return openConsole(); }
    } catch (e) {}
    $('#gate').style.display = '';
  }

  $('#adminLogin').addEventListener('submit', async e => {
    e.preventDefault();
    gateErr.style.display = 'none';
    const b = Object.fromEntries(new FormData(e.target).entries());
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Checking…';
    try {
      const d = await Y.api('/api/admin-auth/login', { method:'POST', body:b });
      ME = d.account; $('#gate').style.display = 'none'; openConsole();
    } catch (err) {
      const code = (err.data && err.data.error) || 'failed';
      showGateErr({
        bad_credentials: 'That email and password do not match.',
        password_not_set: 'No password is set for this administrator yet. Use the setup link below.',
        too_many_attempts: 'Too many attempts. Wait a few minutes.',
        locked: 'This account is locked for a short while.',
        account_disabled: 'This account is disabled.'
      }[code] || 'Sign in failed.');
      btn.disabled = false; btn.textContent = 'Sign in';
    }
  });

  $('#needSetup').addEventListener('click', async () => {
    const email = $('#adminLogin [name=email]').value.trim();
    if (!email) return showGateErr('Enter the administrator email first.');
    const out = $('#bootstrapOut');
    out.style.display = 'block';
    out.innerHTML = '<div class="dim" style="font-size:13px">Requesting a setup link…</div>';
    try {
      const d = await Y.api('/api/admin-auth/bootstrap', { method:'POST', body:{ email } });
      if (!d.sent) {
        out.innerHTML = `<div class="muted" style="font-size:13px;line-height:1.6">${esc(d.note)}</div>`;
        return;
      }
      out.innerHTML = `
        <div class="glass" style="border-radius:12px;padding:13px 15px">
          <div style="font-size:13px;font-weight:650;margin-bottom:7px">
            One-time link created — valid ${d.expires_in_minutes} minutes</div>
          <div class="muted" style="font-size:12.5px;line-height:1.6;margin-bottom:9px">
            Open this to set your password. It works once, then dies.</div>
          <a class="btn btn-gold btn-sm btn-block" href="${esc(d.link)}">Set my password</a>
        </div>`;
    } catch (err) {
      out.innerHTML = '<div class="err">Could not create a setup link.</div>';
    }
  });

  $('#signOut').addEventListener('click', async () => {
    try { await fetch('/api/auth/logout', { credentials:'same-origin' }); } catch(e){}
    location.href = '/admin/';
  });

  /* ================= NAV ================= */
  const SECTIONS = [
    { g:'Today' },
    { id:'overview', label:'Overview' },
    { id:'costs',    label:'Cost settings', badgeKey:'cost_blank', alert:true },
    { g:'Catalogue' },
    { id:'listings', label:'Listings',      badgeKey:'listings_live', quiet:true },
    { id:'review',   label:'Needs attention', badgeKey:'listings_review', alert:true },
    { id:'scrape',   label:'Scraper & queue', badgeKey:'scrape_results_pending' },
    { id:'requests', label:'Price requests', badgeKey:'price_requests_pending', alert:true },
    { g:'Trade' },
    { id:'orders',   label:'Orders',         badgeKey:'orders_placed', alert:true },
    { id:'buyers',   label:'Buyers',         badgeKey:'buyers_awaiting_approval', alert:true },
    { id:'sellers',  label:'Suppliers' },
    { g:'System' },
    { id:'dulci',    label:'DULCi jobs',     badgeKey:'agent_jobs_open' },
    { id:'company',  label:'Company & bank', badgeKey:'company_blank', alert:true },
    { id:'admins',   label:'Administrators' },
    { id:'audit',    label:'Audit trail' }
  ];

  function badgeFor(key) {
    if (!OVER) return null;
    if (key === 'cost_blank') return OVER.cost_health ? OVER.cost_health.blank : null;
    return OVER.counts ? OVER.counts[key] : null;
  }

  function paintNav(active) {
    $('#admNav').innerHTML = SECTIONS.map(s => {
      if (s.g) return `<div class="sect">${esc(s.g)}</div>`;
      const n = badgeFor(s.badgeKey);
      const show = n != null && n > 0;
      return `<a href="#${s.id}" class="${s.id === active ? 'on' : ''}">
        <span>${esc(s.label)}</span>
        ${show ? `<span class="badge${s.quiet || !s.alert ? ' quiet' : ''}">${n0(n)}</span>` : ''}
      </a>`;
    }).join('');
  }

  /* ================= ROUTER ================= */
  const VIEWS = {};
  async function route() {
    const id = (location.hash || '#overview').slice(1).split('?')[0] || 'overview';
    paintNav(id);
    const main = $('#admMain');
    main.innerHTML = '<div class="skel" style="height:38vh;border-radius:var(--r-l)"></div>';
    const fn = VIEWS[id] || VIEWS.overview;
    try { await fn(main); } catch (e) {
      main.innerHTML = `<div class="panel"><div class="panel-b">
        <div class="err">Could not load this section.</div>
        <div class="dim" style="font-size:12px;margin-top:8px">${esc(String(e.message||e).slice(0,200))}</div>
      </div></div>`;
    }
    Y.scrubDigits(main);
  }

  async function openConsole() {
    $('#console').style.display = '';
    $('#whoami').textContent = ME.email || ME.name || 'admin';
    try { OVER = await Y.api('/api/admin/overview'); } catch (e) {}
    window.addEventListener('hashchange', route);
    route();
  }

  const head = (title, sub) => `<div class="adm-head"><div>
    <h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div></div>`;

  /* ================= OVERVIEW ================= */
  VIEWS.overview = async (main) => {
    const d = OVER = await Y.api('/api/admin/overview');
    const c = d.counts, h = d.cost_health;
    const na = d.next_action;

    main.innerHTML = head('Overview', 'What needs you right now.') +
      (na ? `<div class="nextup">
        <div class="ico">!</div>
        <div class="txt">
          <div class="en">${esc(na.en)}</div>
          <div class="ur">${esc(na.ur)}</div>
        </div>
        <a class="btn btn-gold btn-sm" href="${esc(na.href)}">Open</a>
      </div>` : `<div class="nextup" style="background:var(--mat-1);border-color:var(--hair)">
        <div class="ico" style="background:var(--ok);color:#fff">✓</div>
        <div class="txt"><div class="en">Nothing is waiting on you.</div>
        <div class="ur">اِس وقت آپ کے لیے کوئی کام باقی نہیں۔</div></div></div>`) +
      `<div class="tiles">
        ${tile('Live listings', c.listings_live, 'good', '#listings')}
        ${tile('Needs attention', c.listings_review, c.listings_review ? 'alert' : '', '#review')}
        ${tile('Orders to action', c.orders_placed, c.orders_placed ? 'alert' : '', '#orders')}
        ${tile('Buyers to approve', c.buyers_awaiting_approval, c.buyers_awaiting_approval ? 'alert' : '', '#buyers')}
        ${tile('Price requests', c.price_requests_pending, c.price_requests_pending ? 'alert' : '', '#requests')}
        ${tile('Scraped, unreviewed', c.scrape_results_pending, '', '#scrape')}
        ${tile('Suppliers', c.sellers, '', '#sellers')}
        ${tile('DULCi jobs open', c.agent_jobs_open, '', '#dulci')}
      </div>
      <div class="panel">
        <div class="panel-h">
          <div><h2>Cost figures</h2>
          <div class="sub">Every price on the site is built from these. Blank lines are excluded from totals.</div></div>
          <a class="btn btn-glass btn-sm" href="#costs">Set them</a>
        </div>
        <div class="panel-b">
          <div class="tiles" style="margin:0">
            ${tile('Confirmed by you', h.confirmed, 'good')}
            ${tile('Using an estimate', h.estimated, 'alert')}
            ${tile('Still blank', h.blank, h.blank ? 'bad' : 'good')}
          </div>
          ${h.blank ? `<p class="muted" style="font-size:13px;line-height:1.65;margin-top:14px">
            While any line is blank, a landed total is <b>incomplete and will read lower than reality</b>.
            The buyer-facing sheet says so openly, but the sooner you enter real freight and clearing
            quotes, the sooner your prices become final.</p>` : ''}
        </div>
      </div>`;
    paintNav('overview');
  };

  const tile = (k, v, cls, href) => {
    const inner = `<div class="k">${esc(k)}</div><div class="v num">${n0(v)}</div>`;
    return `<div class="tile ${cls || ''}">${href ? `<a href="${href}">${inner}</a>` : inner}</div>`;
  };

  /* ================= COST SETTINGS ================= */
  VIEWS.costs = async (main) => {
    const d = await Y.api('/api/admin/costs');
    const rows = d.rules.slice().sort((a, b) => {
      const rank = r => r.value != null ? 2 : (r.value_estimated != null ? 1 : 0);
      return rank(a) - rank(b) || String(a.key).localeCompare(b.key);
    });

    main.innerHTML = head('Cost settings',
      'Enter what you are actually charged. Every price on the site is calculated from these figures, so nothing here should be a guess. Leave a field empty to fall back to the published estimate.') +
      `<div class="panel">
        <div class="panel-h">
          <div><h2>All cost lines</h2><div class="sub">Blank first — those are the ones holding your prices back.</div></div>
        </div>
        <div class="panel-b flush">
          ${rows.map(costRow).join('')}
        </div>
      </div>`;

    $$('#admMain [data-cost-save]').forEach(b => b.addEventListener('click', async () => {
      const key = b.dataset.costSave;
      const inp = $(`[data-cost-input="${key}"]`);
      const raw = inp.value.trim();
      b.disabled = true; b.textContent = '…';
      try {
        await Y.api('/api/admin/costs/set', { method:'POST',
          body:{ key, value: raw === '' ? null : Number(raw) } });
        b.textContent = 'Saved';
        setTimeout(() => { route(); }, 500);
      } catch (e) {
        b.disabled = false; b.textContent = 'Save';
        alert('Could not save: ' + ((e.data && e.data.error) || e.message));
      }
    }));

    $$('#admMain [data-ask-dulci]').forEach(b => b.addEventListener('click', async () => {
      const key = b.dataset.askDulci;
      b.disabled = true; b.textContent = 'Asked DULCi';
      try {
        await Y.api('/api/admin/agent-jobs/create', { method:'POST',
          body:{ kind:'research_duty', cost_rule_key:key,
                 prompt:`Find the current, citable figure for cost rule "${key}" for imports from China into Pakistan. Give the source URL and the date checked. If no citable source exists, say so — do not estimate.` } });
      } catch (e) { b.textContent = 'Could not queue'; }
    }));
  };

  function costRow(r) {
    const basis = r.value != null ? 'confirmed' : (r.value_estimated != null ? 'estimated' : 'unsourced');
    const shown = r.value != null ? r.value : '';
    return `<div class="costrow ${basis === 'unsourced' ? 'is-blank' : ''}">
      <div>
        <div class="lbl">${esc(r.label_en || r.key)}
          <span class="prov prov-${basis}" style="margin-inline-start:8px">${basis}</span></div>
        <div class="meta">
          <span class="mono" style="font-size:11px">${esc(r.key)}</span>
          ${r.hs_code ? ` · HS ${esc(r.hs_code)}` : ''}
          ${r.applies_to_category ? ` · ${esc(r.applies_to_category)}` : ''}
          ${r.value_estimated != null ? ` · estimate <b>${n2(r.value_estimated)}${esc(r.unit||'')}</b>` : ''}
          ${r.estimate_confidence ? ` <span class="conf">(${esc(r.estimate_confidence)} confidence)</span>` : ''}
          ${r.estimate_source ? `<br>source: ${r.estimate_url
              ? `<a href="${esc(r.estimate_url)}" target="_blank" rel="noopener noreferrer">${esc(r.estimate_source.slice(0,70))}</a>`
              : esc(r.estimate_source.slice(0,70))}` : ''}
          ${r.caveat ? `<br><span style="color:var(--warn)">${esc(r.caveat.slice(0,160))}</span>` : ''}
          ${r.note && basis === 'unsourced' ? `<br><span style="color:var(--bad)">${esc(r.note.slice(0,160))}</span>` : ''}
        </div>
      </div>
      <div><input data-cost-input="${esc(r.key)}" type="number" step="any" min="0"
        value="${shown}" placeholder="${r.value_estimated != null ? n2(r.value_estimated) : '—'}"></div>
      <div class="dim" style="font-size:12px">${esc(r.unit || '')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-glass btn-sm" data-cost-save="${esc(r.key)}">Save</button>
        <button class="btn btn-ghost btn-sm" data-ask-dulci="${esc(r.key)}" title="Have DULCi research this rate">Ask DULCi</button>
      </div>
    </div>`;
  }

  /* ================= LISTINGS ================= */
  async function listingsView(main, forcedStatus, title, sub) {
    const qs = new URLSearchParams({ limit:'50' });
    if (forcedStatus) qs.set('status', forcedStatus);
    const d = await Y.api('/api/admin/listings?' + qs);

    main.innerHTML = head(title, sub) + `
      <div class="panel">
        <div class="fbar">
          <input type="search" id="lq" placeholder="Search title, Chinese title, supplier, booth, code…">
          <select id="lstatus">
            ${['','live','review','paused','archived','draft'].map(s =>
              `<option value="${s}" ${s===(forcedStatus||'')?'selected':''}>${s||'any status'}</option>`).join('')}
          </select>
          <span class="dim" style="font-size:12.5px;margin-inline-start:auto">
            ${n0(d.total)} total</span>
        </div>
        <div class="tbl-wrap">${listingsTable(d.listings)}</div>
      </div>`;

    const reload = async () => {
      const p = new URLSearchParams({ limit:'50' });
      const q = $('#lq').value.trim(); if (q) p.set('q', q);
      const s = $('#lstatus').value; if (s) p.set('status', s);
      const dd = await Y.api('/api/admin/listings?' + p);
      $('.tbl-wrap').innerHTML = listingsTable(dd.listings);
      wire();
    };
    let t; $('#lq').addEventListener('input', () => { clearTimeout(t); t = setTimeout(reload, 350); });
    $('#lstatus').addEventListener('change', reload);

    function wire() {
      $$('#admMain [data-open-listing]').forEach(b =>
        b.addEventListener('click', () => openListing(b.dataset.openListing)));
    }
    wire();
  }

  VIEWS.listings = m => listingsView(m, '', 'Listings',
    'Everything in the catalogue. Enter a real yuan price to mark an item as priced by you.');
  VIEWS.review = m => listingsView(m, 'review', 'Needs attention',
    'Held back because something is missing — usually no published minimum order quantity. Nothing here is visible to buyers.');

  function listingsTable(rows) {
    if (!rows.length) return '<div class="empty-sm">Nothing here.</div>';
    return `<table class="adm"><thead><tr>
      <th></th><th>Item</th><th>Price</th><th>MOQ</th><th>Supplier</th><th>Booth</th>
      <th>Source</th><th>Status</th><th></th></tr></thead><tbody>
      ${rows.map(l => `<tr>
        <td>${l.hero_url ? `<img class="thumb" src="${esc(l.hero_url)}" referrerpolicy="no-referrer" alt="">` : ''}</td>
        <td style="max-width:300px">
          <div style="font-weight:600">${esc((l.title_en||'').slice(0,60))}</div>
          ${l.title_zh_source ? `<span class="zh">${esc(l.title_zh_source.slice(0,60))}</span>` : ''}
        </td>
        <td class="num">${l.cny_unit_price != null
          ? `<b style="color:var(--ok)">¥${n2(l.cny_unit_price)}</b>`
          : `¥${n2(l.listed_price_min)}${l.listed_price_max&&l.listed_price_max>l.listed_price_min?'–'+n2(l.listed_price_max):''}
             <span class="dim" style="font-size:11px">${esc(l.listed_currency||'')}</span>`}</td>
        <td class="num">${l.moq == null ? '<span style="color:var(--bad)">none</span>' : n0(l.moq)}</td>
        <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.supplier_name||'—')}</td>
        <td class="booth">${esc(l.supplier_booth||'—')}</td>
        <td class="dim" style="font-size:11.5px">${esc(l.source_platform||'—')}</td>
        <td><span class="pill-sm st-${esc(l.status)}">${esc(l.status)}</span></td>
        <td><button class="btn btn-ghost btn-sm" data-open-listing="${esc(l.id)}">Open</button></td>
      </tr>`).join('')}</tbody></table>`;
  }

  /* ---- listing detail sheet ---- */
  async function openListing(id) {
    Y.openSheet('#sheet');
    const body = $('#sheetBody');
    body.innerHTML = '<div class="skel" style="height:300px;border-radius:14px"></div>';
    const d = await Y.api('/api/admin/listings?limit=1&q=' + encodeURIComponent(id)).catch(() => null);
    // fall back to a direct fetch by scanning the page list
    let l = d && d.listings && d.listings.find(x => x.id === id);
    if (!l) {
      const all = await Y.api('/api/admin/listings?limit=200');
      l = all.listings.find(x => x.id === id);
    }
    if (!l) { body.innerHTML = '<div class="err">Could not load that listing.</div>'; return; }

    body.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:16px">
        ${l.hero_url ? `<img src="${esc(l.hero_url)}" referrerpolicy="no-referrer"
           style="width:84px;height:84px;border-radius:14px;object-fit:cover;flex:0 0 84px">` : ''}
        <div style="min-width:0">
          <div style="font-family:var(--display);font-weight:660;font-size:16px;line-height:1.3">
            ${esc((l.title_en||'').slice(0,90))}</div>
          ${l.title_zh_source ? `<div class="zh" style="white-space:normal;margin-top:5px">${esc(l.title_zh_source)}</div>` : ''}
          <div class="dim" style="font-size:11.5px;margin-top:6px">
            <span class="mono">${esc(l.code||'')}</span> · ${esc(l.source_platform||'')}
            ${l.source_url ? ` · <a href="${esc(l.source_url)}" target="_blank" rel="noopener noreferrer nofollow"
               style="color:var(--accent)">source page</a>` : ''}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <div class="panel-h"><h2>Supplier — visible only to you</h2></div>
        <div class="panel-b" style="font-size:13px;line-height:1.9">
          <div><b>${esc(l.supplier_name||'—')}</b></div>
          ${l.supplier_booth ? `<div>Booth <span class="booth">${esc(l.supplier_booth)}</span></div>` : ''}
          ${l.supplier_contact ? `<div class="zh" style="white-space:normal">${esc(l.supplier_contact)}</div>` : ''}
          ${l.market_district ? `<div class="zh" style="white-space:normal">${esc(l.market_district)}</div>` : ''}
          ${l.supplier_phone ? `<div>Phone <span class="mono">${esc(l.supplier_phone)}</span></div>` : ''}
          ${l.supplier_store_url ? `<div><a href="${esc(l.supplier_store_url)}" target="_blank"
             rel="noopener noreferrer nofollow" style="color:var(--accent)">supplier store</a></div>` : ''}
          <div class="dulci">
            <button data-job="email_supplier" data-listing="${esc(l.id)}">Ask DULCi to email this supplier</button>
            <button data-job="translate_zh" data-listing="${esc(l.id)}">Translate for the supplier</button>
            <button data-job="check_market_price" data-listing="${esc(l.id)}">Check the Pakistani market price</button>
            <button data-job="research_duty" data-listing="${esc(l.id)}">Research the duty for this item</button>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:14px">
        <div class="panel-h"><h2>Edit</h2><div class="sub">Entering a yuan price marks this as priced by you.</div></div>
        <div class="panel-b">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            ${fld('title_en','Title (English)', l.title_en)}
            ${fld('title_ur','Title (Urdu)', l.title_ur)}
            ${fld('cny_unit_price','Your negotiated price ¥', l.cny_unit_price, 'number')}
            ${fld('moq','Minimum order', l.moq, 'number')}
            ${fld('unit','Unit', l.unit)}
            ${fld('hs_code','HS code', l.hs_code)}
            ${fld('carton_qty','Pieces per carton', l.carton_qty, 'number')}
            ${fld('carton_cbm','Carton CBM', l.carton_cbm, 'number')}
            ${fld('market_price_pkr','Pakistani market price (PKR)', l.market_price_pkr, 'number')}
            <div><label class="field-l">Status</label>
              <select class="inp" data-f="status">
                ${['live','review','paused','archived','draft'].map(s =>
                  `<option ${s===l.status?'selected':''}>${s}</option>`).join('')}
              </select></div>
          </div>
          <div style="display:flex;gap:9px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-gold btn-sm" id="saveListing">Save changes</button>
            <button class="btn btn-glass btn-sm" id="previewQuote">Preview landed cost</button>
            <button class="btn btn-ghost btn-sm" data-close-sheet>Close</button>
          </div>
          <div id="quoteOut" style="margin-top:14px"></div>
        </div>
      </div>`;

    $('#saveListing').addEventListener('click', async e => {
      const fields = {};
      $$('#sheetBody [data-f]').forEach(i => {
        const v = i.value.trim();
        fields[i.dataset.f] = v === '' ? null : (i.type === 'number' ? Number(v) : v);
      });
      e.target.disabled = true; e.target.textContent = 'Saving…';
      try {
        await Y.api('/api/admin/listings/update', { method:'POST', body:{ id, fields } });
        e.target.textContent = 'Saved';
        setTimeout(() => { Y.closeSheet(); route(); }, 500);
      } catch (err) {
        e.target.disabled = false; e.target.textContent = 'Save changes';
        alert('Could not save: ' + ((err.data && err.data.error) || err.message));
      }
    });

    $('#previewQuote').addEventListener('click', async () => {
      const out = $('#quoteOut');
      out.innerHTML = '<div class="dim" style="font-size:13px">Working out the landed cost…</div>';
      try {
        const q = await Y.api(`/api/admin/quote-preview?listing_id=${id}&qty=${l.moq || 100}`);
        out.innerHTML = quoteTable(q);
      } catch (e) {
        out.innerHTML = `<div class="err">${esc((e.data && e.data.error) || 'Could not compute')}</div>`;
      }
    });

    $$('#sheetBody [data-job]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true; const was = b.textContent; b.textContent = 'Queued for DULCi';
      try {
        await Y.api('/api/admin/agent-jobs/create', { method:'POST',
          body:{ kind:b.dataset.job, listing_id:b.dataset.listing } });
      } catch (e) { b.textContent = 'Could not queue'; setTimeout(()=>{b.textContent=was;b.disabled=false;},1500); }
    }));
  }

  const fld = (name, label, val, type) => `<div>
    <label class="field-l">${esc(label)}</label>
    <input class="inp ${type==='number'?'num':''}" data-f="${name}" type="${type||'text'}"
      ${type==='number'?'step="any"':''} value="${val == null ? '' : esc(val)}">
  </div>`;

  function quoteTable(q) {
    return `<div class="panel" style="margin:0">
      <div class="panel-h"><h2>Landed cost — ${n0(q.quantity)} units</h2>
        <div class="sub">unit ¥${n2(q.unit_cny)} · rate ${n2(q.fx_rate)}</div></div>
      <div class="tbl-wrap"><table class="adm"><thead><tr>
        <th>Line</th><th>Basis</th><th>Rate</th><th style="text-align:right">PKR</th></tr></thead><tbody>
        ${q.lines.map(l => `<tr>
          <td>${esc(l.label)}${l.hs_code?` <span class="dim">HS ${esc(l.hs_code)}</span>`:''}</td>
          <td><span class="prov prov-${l.basis}">${l.basis}</span></td>
          <td class="num">${l.value == null ? '—' : n2(l.value) + (l.unit||'')}</td>
          <td class="num" style="text-align:right">${l.amount_pkr == null ? '—' : n0(l.amount_pkr)}</td>
        </tr>`).join('')}
        <tr><td colspan="3"><b>Our fee ${n2(q.commission.pct)}%</b></td>
          <td class="num" style="text-align:right"><b>${n0(q.commission.amount_pkr)}</b></td></tr>
        <tr><td colspan="3"><b>Total</b></td>
          <td class="num" style="text-align:right"><b style="color:var(--gold)">${n0(q.total_pkr)}</b></td></tr>
      </tbody></table></div>
      <div class="panel-b" style="font-size:12.5px;line-height:1.7">
        <span class="prov prov-confirmed">${q.completeness.confirmed} confirmed</span>
        <span class="prov prov-estimated" style="margin-inline-start:6px">${q.completeness.estimated} estimated</span>
        <span class="prov prov-unsourced" style="margin-inline-start:6px">${q.completeness.unsourced} blank</span>
        ${q.completeness.caveat ? `<div class="muted" style="margin-top:9px">${esc(q.completeness.caveat)}</div>` : ''}
      </div>
    </div>`;
  }

  /* ================= PRICE REQUESTS ================= */
  VIEWS.requests = async (main) => {
    const d = await Y.api('/api/admin/price-requests');
    main.innerHTML = head('Price requests',
      'Suppliers cannot change a public price themselves. They ask here, and you decide. This is what keeps the market honest for buyers.') +
      `<div class="panel"><div class="tbl-wrap">
        ${!d.requests.length ? '<div class="empty-sm">No requests waiting.</div>' :
        `<table class="adm"><thead><tr><th>When</th><th>Now</th><th>Proposed</th><th>Change</th>
          <th>Note</th><th>Status</th><th></th></tr></thead><tbody>
        ${d.requests.map(r => {
          const diff = (r.current_cny && r.proposed_cny)
            ? ((r.proposed_cny - r.current_cny) / r.current_cny * 100) : null;
          return `<tr>
            <td class="dim" style="font-size:11.5px">${when(r.created_at)}</td>
            <td class="num">¥${n2(r.current_cny)}</td>
            <td class="num"><b>¥${n2(r.proposed_cny)}</b></td>
            <td class="num" style="color:${diff>0?'var(--bad)':'var(--ok)'}">${diff==null?'—':(diff>0?'+':'')+n2(diff)+'%'}</td>
            <td style="max-width:220px">${esc((r.note||'').slice(0,90))}</td>
            <td><span class="pill-sm st-${r.status==='pending'?'review':'live'}">${esc(r.status)}</span></td>
            <td>${r.status==='pending' ? `<div style="display:flex;gap:6px">
              <button class="btn btn-gold btn-sm" data-decide="accepted" data-id="${esc(r.id)}">Accept</button>
              <button class="btn btn-ghost btn-sm" data-decide="rejected" data-id="${esc(r.id)}">Reject</button>
              <button class="btn btn-ghost btn-sm" data-decide="delisted" data-id="${esc(r.id)}">Delist</button>
            </div>` : ''}</td></tr>`;
        }).join('')}</tbody></table>`}
      </div></div>`;

    $$('#admMain [data-decide]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await Y.api('/api/admin/price-requests/decide', { method:'POST',
          body:{ id:b.dataset.id, decision:b.dataset.decide } });
        route();
      } catch (e) { alert('Failed: ' + ((e.data&&e.data.error)||e.message)); b.disabled = false; }
    }));
  };

  /* ================= ORDERS ================= */
  VIEWS.orders = async (main) => {
    const d = await Y.api('/api/admin/orders');

    main.innerHTML = head('Orders',
      'An order cannot skip a step — the system refuses illegal jumps, because that is how money goes missing.') +
      (!d.bank_ready ? `<div class="nextup"><div class="ico">!</div><div class="txt">
        <div class="en">Your bank account is not saved yet, so any invoice you issue goes out without payment
        details and tells the buyer to telephone you first. Enter it once and every invoice carries it.</div></div>
        <a class="btn btn-gold btn-sm" href="#company">Enter bank details</a></div>` : '') +
      `<div class="panel"><div class="tbl-wrap">
        ${!d.orders.length ? '<div class="empty-sm">No orders yet.</div>' :
        `<table class="adm"><thead><tr><th>Ref</th><th>Buyer</th><th>City</th>
          <th style="text-align:right">Total PKR</th><th>Status</th><th>Invoice</th><th>Next step</th></tr></thead><tbody>
        ${d.orders.map(o => `<tr>
          <td class="mono" style="font-size:11.5px">${esc(o.ref)}</td>
          <td>${esc(o.buyer_name||'—')}<div class="dim num" style="font-size:11px">${esc(o.buyer_phone||'')}</div></td>
          <td>${esc(o.buyer_city||'—')}</td>
          <td class="num" style="text-align:right">${n0(o.total_pkr)}</td>
          <td><span class="pill-sm st-placed">${esc(o.status)}</span></td>
          <td>${o.invoice ? `
              <a class="btn btn-glass btn-sm" href="${esc(o.invoice.pdf_url)}" target="_blank" rel="noopener noreferrer">PDF</a>
              <div class="mono dim" style="font-size:10.5px;margin-top:4px">${esc(o.invoice.number)}</div>
              ${o.invoice.status === 'paid'
                ? `<span class="pill-sm st-live">paid</span>`
                : `<button class="btn btn-ghost btn-sm" data-paid="${esc(o.invoice.number)}"
                     data-total="${esc(o.invoice.total_pkr)}">Mark paid</button>`}`
            : (o.status === 'confirmed'
                ? `<button class="btn btn-gold btn-sm" data-invoice="${esc(o.id)}"
                     data-ref="${esc(o.ref)}" data-total="${esc(o.total_pkr)}">Issue invoice</button>`
                : '<span class="dim">—</span>')}</td>
          <td><div style="display:flex;gap:6px;flex-wrap:wrap">
            ${(d.flow[o.status]||[]).filter(s => !(s === 'invoiced' && !o.invoice)).map(s =>
              `<button class="btn btn-glass btn-sm" data-adv="${esc(s)}" data-id="${esc(o.id)}">${esc(s)}</button>`).join('')
              || '<span class="dim">—</span>'}
          </div></td></tr>`).join('')}</tbody></table>`}
      </div></div>`;

    $$('#admMain [data-adv]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await Y.api('/api/admin/orders/advance', { method:'POST',
          body:{ id:b.dataset.id, status:b.dataset.adv } });
        route();
      } catch (e) {
        alert('Refused: ' + ((e.data && (e.data.note || e.data.error)) || e.message));
        b.disabled = false;
      }
    }));

    /* Issuing an invoice moves money, so it is confirmed with the figure
       spelled out — never a bare "are you sure". */
    $$('#admMain [data-invoice]').forEach(b => b.addEventListener('click', async () => {
      const total = Number(b.dataset.total);
      if (!confirm(`Issue an invoice to ${b.dataset.ref} for PKR ${n0(total)}?\n\n` +
        `The order moves to "invoiced" and the buyer can download the PDF from their account.`)) return;
      b.disabled = true;
      try {
        const r = await Y.api('/api/admin/invoices/issue', { method:'POST', body:{ order_id: b.dataset.invoice } });
        if (r.warning) alert(r.warning);
        if (r.pdf_url) window.open(r.pdf_url, '_blank', 'noopener');
        route();
      } catch (e) {
        alert('Refused: ' + ((e.data && (e.data.note || e.data.error)) || e.message));
        b.disabled = false;
      }
    }));

    $$('#admMain [data-paid]').forEach(b => b.addEventListener('click', async () => {
      const ref = prompt(`Payment received for invoice ${b.dataset.paid} — PKR ${n0(Number(b.dataset.total))}.\n\n` +
        `Enter the bank reference or transaction ID (leave blank if you do not have one):`);
      if (ref === null) return;
      b.disabled = true;
      try {
        await Y.api('/api/admin/invoices/paid', { method:'POST',
          body:{ number: b.dataset.paid, payment_ref: ref || null } });
        route();
      } catch (e) {
        alert('Refused: ' + ((e.data && (e.data.note || e.data.error)) || e.message));
        b.disabled = false;
      }
    }));
  };

  /* ================= COMPANY & BANK ================= */
  VIEWS.company = async (main) => {
    const d = await Y.api('/api/admin/company');
    const c = d.company || {};
    const f = (key, label, hint, ph) => `<div class="costrow">
      <div><b>${esc(label)}</b>${hint ? `<div class="dim" style="font-size:11.5px">${esc(hint)}</div>` : ''}</div>
      <input class="inp" data-co="${key}" value="${esc(c[key] == null ? '' : c[key])}"
        placeholder="${esc(ph || '')}" autocomplete="off" spellcheck="false"></div>`;

    main.innerHTML = head('Company & bank',
      'These details are printed on every invoice. They are snapshotted onto each invoice as it is issued, so changing your bank next year never rewrites an invoice already in a buyer\'s hands.') +
      (!d.bank_ready ? `<div class="nextup"><div class="ico">!</div><div class="txt">
        <div class="en">${esc(d.note || '')}</div>
        <div class="ur">جب تک بینک اکاؤنٹ یہاں محفوظ نہ ہو، بل پر ادائیگی کی تفصیل نہیں جائے گی اور خریدار کو لکھا جائے گا کہ پہلے آپ سے فون پر تصدیق کریں۔ یہ جان بوجھ کر ہے — غلط اکاؤنٹ نمبر لکھنے سے رقم ضائع ہوتی ہے۔</div>
      </div></div>` : '') +
      `<div class="panel">
        <div class="panel-h"><div><h2>The company</h2>
          <div class="sub">As it should appear on a tax invoice.</div></div></div>
        <div class="panel-b flush">
          ${f('legal_name','Registered name','Exactly as registered.','Yuan.pk (Private) Limited')}
          ${f('ntn','NTN','National Tax Number.','')}
          ${f('strn','STRN','Sales tax registration number, if you have one.','')}
          ${f('address','Address','','')}
          ${f('city','City','','Multan, Punjab')}
          ${f('phone','Phone','','+92 300 630 7380')}
          ${f('email','Email','Where buyers send payment receipts.','javaid.yuan.pk@gmail.com')}
          ${f('website','Website','','yuan.pk')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-h"><div><h2>Where buyers pay</h2>
          <div class="sub">Type this from your own bank letter or app — not from memory.</div></div></div>
        <div class="panel-b flush">
          ${f('bank_title','Account title','The name on the account.','')}
          ${f('bank_name','Bank','','Meezan Bank')}
          ${f('bank_branch','Branch','','Gulgasht, Multan')}
          ${f('bank_iban','IBAN','24 characters, starts PK.','PK__ ____ ____ ____ ____ ____')}
          ${f('bank_account','Account number','','')}
          ${f('bank_swift','SWIFT / BIC','Only needed for money coming from abroad.','')}
          ${f('payment_terms','Payment terms','Printed under the total.','Payable within 7 days of issue.')}
          ${f('invoice_note','Note on every invoice','Anything you always want to say.','')}
        </div>
        <div class="fbar">
          <span class="dim" id="coState">${d.bank_ready ? 'Bank details are complete.' : 'Bank details incomplete.'}</span>
          <button class="btn btn-gold btn-sm" id="coSave">Save</button>
        </div>
      </div>`;

    $('#coSave').addEventListener('click', async () => {
      const btn = $('#coSave'); btn.disabled = true;
      const body = {};
      $$('#admMain [data-co]').forEach(i => { body[i.dataset.co] = i.value.trim(); });

      /* Catch a mistyped IBAN before it reaches an invoice. Pakistani IBANs
         are 24 characters: PK, 2 check digits, 4-letter bank code, 16 more. */
      const iban = (body.bank_iban || '').replace(/\s+/g, '').toUpperCase();
      if (iban && !/^PK\d{2}[A-Z]{4}[A-Z0-9]{16}$/.test(iban)) {
        if (!confirm(`That IBAN does not look like a Pakistani IBAN.\n\n` +
          `Expected: PK, 2 digits, 4 letters, then 16 characters — 24 in total.\n` +
          `You typed ${iban.length} characters.\n\nSave it anyway?`)) { btn.disabled = false; return; }
      }
      if (iban) body.bank_iban = iban;

      try {
        const r = await Y.api('/api/admin/company/save', { method:'POST', body });
        $('#coState').textContent = r.bank_ready
          ? 'Saved. Every invoice from now on carries these details.'
          : 'Saved, but the bank account is still incomplete.';
      } catch (e) {
        alert('Could not save: ' + ((e.data && (e.data.note || e.data.error)) || e.message));
      }
      btn.disabled = false;
    });
  };

  /* ================= BUYERS ================= */
  VIEWS.buyers = async (main) => {
    const d = await Y.api('/api/admin/buyers');
    main.innerHTML = head('Buyers',
      'A buyer may browse freely, but cannot place an order until you approve the account. Approving a wholesale buyer is a real business decision, so it is yours.') +
      `<div class="panel"><div class="tbl-wrap">
        ${!d.buyers.length ? '<div class="empty-sm">No buyers registered yet.</div>' :
        `<table class="adm"><thead><tr><th>Name</th><th>Shop</th><th>City</th><th>Phone</th>
          <th>Verified</th><th>Can order</th><th></th></tr></thead><tbody>
        ${d.buyers.map(b => `<tr>
          <td><b>${esc(b.name||'—')}</b></td>
          <td>${esc(b.business_name||'—')}</td>
          <td>${esc(b.city||'—')}</td>
          <td class="num">${esc(b.phone||'—')}</td>
          <td>${b.email_verified_at ? '<span class="pill-sm st-live">email</span>' : '<span class="dim">—</span>'}</td>
          <td>${b.can_order ? '<span class="pill-sm st-live">yes</span>' : '<span class="pill-sm st-review">no</span>'}</td>
          <td><button class="btn ${b.can_order?'btn-ghost':'btn-gold'} btn-sm"
            data-approve="${esc(b.id)}" data-to="${b.can_order?'0':'1'}">
            ${b.can_order?'Revoke':'Approve'}</button></td>
        </tr>`).join('')}</tbody></table>`}
      </div></div>`;

    $$('#admMain [data-approve]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await Y.api('/api/admin/buyers/approve', { method:'POST',
          body:{ id:b.dataset.approve, approve:b.dataset.to === '1' } });
        route();
      } catch (e) { b.disabled = false; alert('Failed'); }
    }));
  };

  /* ================= SELLERS ================= */
  VIEWS.sellers = async (main) => {
    const d = await Y.api('/api/admin/sellers');
    main.innerHTML = head('Suppliers', 'Chinese suppliers. Their contact details never leave this console.') +
      `<div class="panel"><div class="tbl-wrap">
        ${!d.sellers.length ? '<div class="empty-sm">No supplier records yet. Suppliers appear here once you create an account for one in China.</div>' :
        `<table class="adm"><thead><tr><th>Shop</th><th>City</th><th>Contact</th><th>Phone</th>
          <th>WeChat</th><th>Met</th></tr></thead><tbody>
        ${d.sellers.map(s => `<tr>
          <td><b>${esc(s.shop_name||'—')}</b>${s.shop_name_zh?`<div class="zh">${esc(s.shop_name_zh)}</div>`:''}</td>
          <td>${esc(s.city||'—')}</td><td>${esc(s.contact_name||'—')}</td>
          <td class="num">${esc(s.phone||'—')}</td><td>${esc(s.wechat||'—')}</td>
          <td>${s.met_in_person?'<span class="pill-sm st-live">in person</span>':'<span class="dim">—</span>'}</td>
        </tr>`).join('')}</tbody></table>`}
      </div></div>`;
  };

  /* ================= SCRAPER ================= */
  VIEWS.scrape = async (main) => {
    const d = await Y.api('/api/admin/scrape-queue');
    main.innerHTML = head('Scraper & review queue',
      'Nothing a scraper finds goes live unreviewed. Jobs are hard-capped at 200 products each so a re-run cannot spend real money unexpectedly.') +
      `<div class="panel">
        <div class="panel-h"><div><h2>Recent scrape jobs</h2></div></div>
        <div class="tbl-wrap">
        ${!d.jobs.length ? '<div class="empty-sm">No scrape jobs have been run from the console yet.</div>' :
        `<table class="adm"><thead><tr><th>When</th><th>Site</th><th>Keywords</th><th>Cap</th>
          <th>Found</th><th>Imported</th><th>Cost</th><th>Status</th></tr></thead><tbody>
        ${d.jobs.map(j => `<tr>
          <td class="dim" style="font-size:11.5px">${when(j.created_at)}</td>
          <td>${esc(j.site)}</td>
          <td class="zh" style="max-width:220px">${esc((j.keywords||[]).join(', '))}</td>
          <td class="num">${n0(j.max_items)}</td><td class="num">${n0(j.items_found)}</td>
          <td class="num">${n0(j.items_imported)}</td>
          <td class="num">${j.cost_usd==null?'—':'$'+n2(j.cost_usd)}</td>
          <td><span class="pill-sm st-${j.status==='done'?'live':'review'}">${esc(j.status)}</span></td>
        </tr>`).join('')}</tbody></table>`}
        </div>
      </div>
      <div class="panel">
        <div class="panel-h"><div><h2>Awaiting your review</h2>
          <div class="sub">${n0(d.results.length)} scraped rows not yet published</div></div></div>
        ${!d.results.length ? '<div class="empty-sm">Nothing awaiting review.</div>' :
        `<div class="tbl-wrap"><table class="adm"><thead><tr><th>Item</th><th>Price</th><th>MOQ</th>
          <th>Supplier</th><th>Booth</th><th>Site</th></tr></thead><tbody>
        ${d.results.map(r => `<tr>
          <td class="zh" style="max-width:280px">${esc((r.title_source||'').slice(0,70))}</td>
          <td class="num">${n2(r.price_min)} ${esc(r.currency||'')}</td>
          <td class="num">${n0(r.moq)}</td>
          <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.supplier_name||'—')}</td>
          <td class="booth">${esc(r.supplier_booth||'—')}</td>
          <td class="dim">${esc(r.site)}</td>
        </tr>`).join('')}</tbody></table></div>`}
      </div>`;
  };

  /* ================= DULCi ================= */
  VIEWS.dulci = async (main) => {
    const d = await Y.api('/api/admin/agent-jobs');
    main.innerHTML = head('DULCi jobs',
      'Work you have handed to DULCi. Anything that leaves the building — an email to a supplier — waits for your explicit approval first.') +
      `<div class="panel"><div class="tbl-wrap">
        ${!d.jobs.length ? '<div class="empty-sm">No jobs yet. Ask DULCi from a listing or a cost line.</div>' :
        `<table class="adm"><thead><tr><th>When</th><th>Job</th><th>Status</th><th>Result</th><th></th></tr></thead><tbody>
        ${d.jobs.map(j => `<tr>
          <td class="dim" style="font-size:11.5px">${when(j.created_at)}</td>
          <td><b>${esc(j.kind.replace(/_/g,' '))}</b>
            ${j.cost_rule_key?`<div class="mono dim" style="font-size:11px">${esc(j.cost_rule_key)}</div>`:''}</td>
          <td><span class="pill-sm st-${j.status==='done'?'live':'review'}">${esc(j.status)}</span></td>
          <td style="max-width:340px;font-size:12.5px;line-height:1.6">${esc((j.result||j.error||'—').slice(0,200))}</td>
          <td>${j.requires_approval && !j.approved_at
            ? `<button class="btn btn-gold btn-sm" data-approve-job="${esc(j.id)}">Approve</button>` : ''}</td>
        </tr>`).join('')}</tbody></table>`}
      </div></div>`;

    $$('#admMain [data-approve-job]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await Y.api('/api/admin/agent-jobs/approve', { method:'POST', body:{ id:b.dataset.approveJob } }); route(); }
      catch (e) { b.disabled = false; }
    }));
  };

  /* ================= ADMINS ================= */
  VIEWS.admins = async (main) => {
    const d = await Y.api('/api/admin-auth/admins');
    main.innerHTML = head('Administrators',
      'Anyone on this list can sign in with their own password. The system refuses to remove the last administrator.') +
      `<div class="panel">
        <div class="tbl-wrap"><table class="adm"><thead><tr><th>Email</th><th>Note</th><th>Active</th><th></th></tr></thead><tbody>
        ${d.admins.map(a => `<tr>
          <td class="ltr"><b>${esc(a.email)}</b></td>
          <td>${esc(a.note||'—')}</td>
          <td>${a.active?'<span class="pill-sm st-live">yes</span>':'<span class="dim">no</span>'}</td>
          <td>${a.active?`<button class="btn btn-ghost btn-sm" data-rm-admin="${esc(a.email)}">Remove</button>`:''}</td>
        </tr>`).join('')}</tbody></table></div>
        <div class="panel-b">
          <label class="field-l">Add an administrator</label>
          <div style="display:flex;gap:9px;flex-wrap:wrap">
            <input class="inp ltr" id="newAdmin" type="email" placeholder="name@example.com" style="flex:1;min-width:220px">
            <button class="btn btn-gold btn-sm" id="addAdmin">Add</button>
          </div>
          <div class="hint">They then request a setup link from the sign-in page and choose their own password.</div>
        </div>
      </div>`;

    $('#addAdmin').addEventListener('click', async () => {
      const email = $('#newAdmin').value.trim();
      if (!email) return;
      try { await Y.api('/api/admin-auth/admins/add', { method:'POST', body:{ email } }); route(); }
      catch (e) { alert('Failed: ' + ((e.data&&e.data.error)||e.message)); }
    });
    $$('#admMain [data-rm-admin]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Remove ' + b.dataset.rmAdmin + ' as an administrator?')) return;
      try { await Y.api('/api/admin-auth/admins/remove', { method:'POST', body:{ email:b.dataset.rmAdmin } }); route(); }
      catch (e) { alert((e.data && (e.data.note||e.data.error)) || 'Failed'); }
    }));
  };

  /* ================= AUDIT ================= */
  VIEWS.audit = async (main) => {
    const d = await Y.api('/api/admin/audit');
    main.innerHTML = head('Audit trail', 'Every change to money, prices or visibility, with who did it and when.') +
      `<div class="panel"><div class="audit">
        ${!d.entries.length ? '<div class="empty-sm">Nothing recorded yet.</div>' :
        d.entries.map(e => `<div class="audit-row">
          <div class="when">${when(e.at)}</div>
          <div class="what"><b>${esc(e.action)}</b>
            ${e.target_table?` on ${esc(e.target_table)}`:''}
            <div class="dim" style="font-size:11.5px;margin-top:3px">
              ${esc(e.actor_email||'')}
              ${e.before?` · was ${esc(JSON.stringify(e.before).slice(0,60))}`:''}
              ${e.after?` · now ${esc(JSON.stringify(e.after).slice(0,60))}`:''}
            </div>
          </div>
        </div>`).join('')}
      </div></div>`;
  };

  boot();
})();
