/* ============================================================
   YUAN MARKET — 供应商后台 / seller dashboard
   Chinese first. A supplier can flag stock and ask for a price
   change; they can never move a public price themselves, and they
   never see what a Pakistani buyer pays.
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* Chinese unless the supplier flips to English. Urdu is not offered
     here — a Yiwu supplier has no use for it. */
  const zh = () => Y.lang() !== 'en';
  const t = (en, cn) => zh() ? cn : en;

  let SHOP = null, LISTINGS = [], REQUESTS = [], ENQUIRIES = [], TAB = 'goods';

  const STATUS = {
    live:     ['On sale', '在售', 'pill-ok'],
    sold_out: ['Out of stock', '缺货', 'pill-warn'],
    review:   ['Yuan.pk is checking it', '元市场审核中', 'pill-neutral'],
    draft:    ['Not published', '未发布', 'pill-neutral'],
    archived: ['Archived', '已下架', 'pill-neutral']
  };
  const REQ = {
    pending:  ['Waiting for review', '等待审核', 'pill-warn'],
    approved: ['Approved', '已通过', 'pill-ok'],
    accepted: ['Approved', '已通过', 'pill-ok'],
    rejected: ['Not approved', '未通过', 'pill-bad']
  };
  const title = l => esc(zh() ? (l.title_zh || l.title_en) : (l.title_en || l.title_zh));

  async function load() {
    let me;
    try { me = await Y.api('/api/me'); } catch (e) { return gotoLogin(); }
    if (!me.account) return gotoLogin();
    if (!['seller', 'admin'].includes(me.account.role)) {
      $('#shop').innerHTML = notice(
        t('This is the supplier area', '这里是供应商专区'),
        esc(t('Your account is a buyer account. Please open the market instead.',
              '您的账号是采购方账号，请前往市场页面。')), '/listings/');
      return;
    }
    const who = $('#whoami');
    if (who) who.textContent = me.account.business_name || me.account.name || '';

    let d;
    try { d = await Y.api('/api/seller'); }
    catch (e) {
      $('#shop').innerHTML = notice(t('Could not load your shop', '无法加载店铺'), esc(e.message || ''), null);
      return;
    }
    SHOP = d.seller; LISTINGS = d.listings || [];
    REQUESTS = d.requests || []; ENQUIRIES = d.enquiries || [];
    render();
  }
  function gotoLogin() { location.href = '/login/?next=/seller/'; }

  const notice = (h, body, href) => `<div class="panel"><div class="panel-b"
      style="text-align:center;padding:clamp(30px,5vw,56px)">
      <div style="font-family:var(--serif);font-size:40px;color:var(--gold);opacity:.28;margin-bottom:12px">元</div>
      <b style="font-size:18px">${esc(h)}</b>
      <p class="muted" style="margin-top:10px;line-height:1.8;max-width:44ch;margin-inline:auto">${body}</p>
      ${href ? `<a class="btn btn-gold btn-sm" style="margin-top:18px" href="${href}">${esc(t('Open the market','进入市场'))}</a>` : ''}
    </div></div>`;

  function render() {
    if (!SHOP) {
      $('#shop').innerHTML = notice(
        t('Your shop is not linked yet', '店铺尚未关联'),
        esc(t('Mirza Javaid Iqbal links a shop to an account after meeting the supplier in person. Once he does, your products appear here.',
              '米尔扎·贾维德·伊克巴尔先生与供应商当面见过后会关联店铺。关联完成后，您的产品会显示在这里。')), null);
      return;
    }

    const live = LISTINGS.filter(l => l.status === 'live').length;
    const out  = LISTINGS.filter(l => l.status === 'sold_out').length;
    const pend = REQUESTS.filter(r => r.status === 'pending').length;
    const open = ENQUIRIES.filter(e => e.status === 'sent').length;

    $('#shop').innerHTML = `
      <div class="adm-head"><div>
        <h1>${esc(zh() ? (SHOP.shop_name_zh || SHOP.shop_name) : (SHOP.shop_name || SHOP.shop_name_zh))}</h1>
        <p>${esc([SHOP.market_name, SHOP.city, SHOP.province].filter(Boolean).join(' · '))}
          ${SHOP.verified ? `<span class="pill pill-ok" style="margin-inline-start:8px">${esc(t('Verified partner','已认证合作商'))}</span>` : ''}</p>
      </div></div>

      ${open ? `<div class="nextup">
        <div class="ico">✉</div><div class="txt"><div class="en">${esc(t(
          open + ' question(s) from Yuan.pk are waiting for your answer. A fast answer becomes an order.',
          '元市场有 ' + open + ' 个问题等待您回复。回复越快，成交越快。'))}</div></div>
        <button class="btn btn-gold btn-sm" data-tab="asks">${esc(t('Answer now','立即回复'))}</button></div>` : ''}

      <div class="tiles">
        ${tile(t('On sale','在售产品'), live)}
        ${tile(t('Out of stock','缺货'), out)}
        ${tile(t('Price requests waiting','待审价格申请'), pend)}
        ${tile(t('Questions from Yuan.pk','元市场询价'), ENQUIRIES.length)}
      </div>

      <div class="seg" role="tablist" style="margin:20px 0 16px">
        ${seg('goods', t('My products','我的产品'), LISTINGS.length)}
        ${seg('asks',  t('Questions','询价'), ENQUIRIES.length)}
        ${seg('reqs',  t('Price requests','价格申请'), REQUESTS.length)}
        ${seg('info',  t('Shop details','店铺资料'), null)}
      </div>
      <div id="panel"></div>`;

    $$('[data-tab]').forEach(b => b.addEventListener('click', () => { TAB = b.dataset.tab; render(); }));
    paint();
  }

  const tile = (k, v) => `<div class="tile"><div class="k">${esc(k)}</div>
    <div class="v num">${Y.n0(v)}</div></div>`;
  const seg = (id, label, n) => `<button data-tab="${id}" role="tab" aria-selected="${TAB === id}">
    ${esc(label)}${n != null ? ` <span class="num" style="opacity:.5">${Y.n0(n)}</span>` : ''}</button>`;

  function paint() {
    const p = $('#panel'); if (!p) return;
    p.innerHTML = TAB === 'goods' ? goodsView()
      : TAB === 'asks' ? asksView()
      : TAB === 'reqs' ? reqsView() : infoView();
    wire();
    Y.applyLang(Y.lang(), false);
    Y.scrubDigits(p);
  }

  const emptyBox = m => `<div class="panel"><div class="panel-b"
    style="text-align:center;padding:38px"><span class="muted">${esc(m)}</span></div></div>`;

  /* ---------------- MY PRODUCTS ---------------- */
  function goodsView() {
    if (!LISTINGS.length) return emptyBox(t('No products linked to your shop yet.', '您的店铺暂无产品。'));
    return `<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr>
        <th>${esc(t('Product','产品'))}</th>
        <th class="num">${esc(t('Price / unit','单价'))}</th>
        <th class="num">${esc(t('MOQ','起订量'))}</th>
        <th>${esc(t('Status','状态'))}</th>
        <th></th></tr></thead><tbody>
      ${LISTINGS.map(l => {
        const s = STATUS[l.status] || [l.status, l.status, 'pill-neutral'];
        const openReq = REQUESTS.find(r => r.listing_id === l.id && r.status === 'pending');
        return `<tr>
          <td><div style="display:flex;align-items:center;gap:11px;min-width:220px">
            <span style="width:44px;height:44px;flex:0 0 44px;border-radius:11px;overflow:hidden;
              background:var(--mat-2);display:grid;place-items:center">
              ${l.hero_url ? `<img src="${esc(l.hero_url)}" alt="" loading="lazy" decoding="async"
                style="width:100%;height:100%;object-fit:cover">`
                : `<span class="dim" style="font-size:10px">${esc(t('no photo','无图'))}</span>`}</span>
            <span><b>${title(l)}</b>
              <div class="dim num ltr" style="font-size:11.5px">${esc(l.code || '')}${l.booth ? ' · ' + esc(l.booth) : ''}</div></span>
          </div></td>
          <td class="num ltr"><b>${l.price_cny != null ? Y.cny(l.price_cny) : '—'}</b></td>
          <td class="num ltr">${l.moq != null ? Y.n0(l.moq) : '—'} <span class="dim">${esc(l.unit || '')}</span></td>
          <td><span class="pill ${s[2]}">${esc(zh() ? s[1] : s[0])}</span>
            ${openReq ? `<div class="dim" style="font-size:11px;margin-top:4px">${esc(t('price request pending','价格申请待审'))}</div>` : ''}</td>
          <td style="white-space:nowrap">
            ${['live','sold_out'].includes(l.status) ? `<button class="btn btn-ghost btn-sm"
              data-stock="${esc(l.id)}" data-to="${l.status === 'live' ? '0' : '1'}">${esc(
                l.status === 'live' ? t('Out of stock','标记缺货') : t('Back in stock','恢复在售'))}</button>` : ''}
            <button class="btn btn-glass btn-sm" data-ask="${esc(l.id)}">${esc(t('Change price','申请改价'))}</button>
          </td></tr>`;
      }).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------------- QUESTIONS FROM YUAN.PK ---------------- */
  function asksView() {
    if (!ENQUIRIES.length) return emptyBox(t('No questions yet.', '暂无询价。'));
    return ENQUIRIES.map(e => {
      const l = LISTINGS.find(x => x.id === e.listing_id);
      return `<div class="panel">
        <div class="panel-h"><div>
          <h2>${esc(e.subject || t('Question about a product','产品咨询'))}</h2>
          <div class="sub">${l ? title(l) + ' · ' : ''}<span class="num ltr">${esc(Y.date(e.sent_at || e.created_at))}</span></div>
        </div>${e.response_text ? `<span class="pill pill-ok">${esc(t('answered','已回复'))}</span>`
              : `<span class="pill pill-warn">${esc(t('waiting','待回复'))}</span>`}</div>
        <div class="panel-b">
          <p style="line-height:1.85;white-space:pre-wrap">${esc(e.body || '')}</p>
          ${e.response_text
            ? `<div style="margin-top:14px;padding:13px 15px;border-radius:var(--r-m);
                 background:var(--mat-2);border:1px solid var(--hair)">
                 <b style="font-size:12.5px">${esc(t('Your answer','您的回复'))}</b>
                 <p style="white-space:pre-wrap;margin-top:6px;line-height:1.8">${esc(e.response_text)}</p>
                 <span class="dim num ltr" style="font-size:11.5px">${esc(Y.date(e.response_at))}</span></div>`
            : `<div class="stack" style="margin-top:14px">
                 <textarea class="inp" rows="3" id="ans-${esc(e.id)}"
                   placeholder="${esc(t('Price, minimum quantity, delivery time…','价格、起订量、交期…'))}"></textarea>
                 <button class="btn btn-gold btn-sm" data-answer="${esc(e.id)}"
                   style="align-self:flex-start">${esc(t('Send answer','发送回复'))}</button>
               </div>`}
        </div></div>`;
    }).join('');
  }

  /* ---------------- PRICE REQUESTS ---------------- */
  function reqsView() {
    if (!REQUESTS.length) return emptyBox(t('No price requests yet.', '暂无价格申请。'));
    return `<div class="panel"><div class="tblwrap"><table class="tbl"><thead><tr>
        <th>${esc(t('Product','产品'))}</th>
        <th class="num">${esc(t('Price','价格'))}</th>
        <th class="num">${esc(t('MOQ','起订量'))}</th>
        <th>${esc(t('Result','结果'))}</th></tr></thead><tbody>
      ${REQUESTS.map(r => {
        const l = LISTINGS.find(x => x.id === r.listing_id);
        const s = REQ[r.status] || [r.status, r.status, 'pill-neutral'];
        return `<tr>
          <td><b>${l ? title(l) : esc(r.listing_id)}</b>
            <div class="dim num ltr" style="font-size:11.5px">${esc(Y.date(r.created_at))}</div>
            ${r.note ? `<div class="muted" style="font-size:12.5px;margin-top:5px;max-width:46ch">${esc(r.note)}</div>` : ''}</td>
          <td class="num ltr">${r.proposed_cny != null
            ? `<s style="opacity:.45">${Y.cny(r.current_cny)}</s> → <b>${Y.cny(r.proposed_cny)}</b>` : '—'}</td>
          <td class="num ltr">${r.proposed_moq != null
            ? `<s style="opacity:.45">${Y.n0(r.current_moq)}</s> → <b>${Y.n0(r.proposed_moq)}</b>` : '—'}</td>
          <td><span class="pill ${s[2]}">${esc(zh() ? s[1] : s[0])}</span>
            ${r.decision_note ? `<div class="muted" style="font-size:12px;margin-top:5px;max-width:34ch">${esc(r.decision_note)}</div>` : ''}</td>
        </tr>`;
      }).join('')}
      </tbody></table></div></div>`;
  }

  /* ---------------- SHOP DETAILS ---------------- */
  function infoView() {
    const rows = [
      [t('Shop name','店铺名称'), SHOP.shop_name_zh || SHOP.shop_name],
      [t('Market','市场'), SHOP.market_name],
      [t('City','城市'), [SHOP.city, SHOP.province].filter(Boolean).join(', ')],
      [t('Contact','联系人'), SHOP.contact_name],
      [t('Phone','电话'), SHOP.phone],
      [t('WeChat','微信'), SHOP.wechat],
      [t('Email','邮箱'), SHOP.email]
    ].filter(r => r[1]);
    return `<div class="panel">
      <div class="panel-h"><h2>${esc(t('Shop details','店铺资料'))}</h2></div>
      <div class="panel-b" style="font-size:13.5px;line-height:2.1">
        ${rows.map(([k, v]) => `<div>${esc(k)}: <b class="ltr">${esc(v)}</b></div>`).join('')}
        <p class="muted" style="margin-top:16px;font-size:13px;line-height:1.85">${esc(t(
          'To correct anything here, tell Yuan.pk on WeChat. We keep shop details ourselves so that a buyer in Pakistan can trust them.',
          '如需修改资料，请通过微信告知元市场。店铺资料由我们统一维护，巴基斯坦采购方才会信任。'))}</p>
        <p class="dim num ltr" style="margin-top:6px;font-size:12.5px">Yuan.pk Pvt. Ltd. · +92 300 630 7380</p>
      </div></div>`;
  }

  /* ---------------- ACTIONS ---------------- */
  function wire() {
    $$('[data-stock]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        await Y.api('/api/seller/stock', { method: 'POST',
          body: { listing_id: b.dataset.stock, in_stock: b.dataset.to === '1' } });
        await load();
      } catch (e) { alert(e.message || 'error'); b.disabled = false; }
    }));

    $$('[data-answer]').forEach(b => b.addEventListener('click', async () => {
      const box = $('#ans-' + b.dataset.answer);
      const txt = ((box && box.value) || '').trim();
      if (!txt) { if (box) box.focus(); return; }
      b.disabled = true;
      try {
        await Y.api('/api/seller/enquiry/reply', { method: 'POST',
          body: { id: b.dataset.answer, response: txt } });
        await load();
      } catch (e) { alert(e.message || 'error'); b.disabled = false; }
    }));

    $$('[data-ask]').forEach(b => b.addEventListener('click', () => askSheet(b.dataset.ask)));
  }

  function askSheet(id) {
    const l = LISTINGS.find(x => x.id === id); if (!l) return;
    $('#sheetBody').innerHTML = `
      <div class="panel-h"><div><h2>${esc(t('Ask to change price or MOQ','申请修改价格或起订量'))}</h2>
        <div class="sub">${title(l)}</div></div></div>
      <div class="panel-b">
        <p class="muted" style="font-size:13px;line-height:1.85;margin-bottom:16px">${esc(t(
          'Yuan.pk reviews every change before buyers see it. That is what keeps the price on the site honest — and honesty is why buyers order from us.',
          '所有改动经元市场审核后才会对采购方显示。网站价格因此真实可信，采购方也才愿意在我们这里下单。'))}</p>
        <div class="stack">
          <label><span class="p-lbl">${esc(t('New price per unit (CNY)','新单价（元）'))}</span>
            <input class="inp num ltr" id="pReq" type="number" step="0.01" min="0" inputmode="decimal"
              placeholder="${l.price_cny != null ? esc(l.price_cny) : ''}"></label>
          <label><span class="p-lbl">${esc(t('New minimum order quantity','新起订量'))}</span>
            <input class="inp num ltr" id="mReq" type="number" step="1" min="1" inputmode="numeric"
              placeholder="${l.moq != null ? esc(l.moq) : ''}"></label>
          <label><span class="p-lbl">${esc(t('Reason (helps us approve it fast)','原因（有助于快速通过）'))}</span>
            <textarea class="inp" id="nReq" rows="3"
              placeholder="${esc(t('Material cost went up, new mould, discount for a bigger order…','原材料涨价、新模具、大单折扣…'))}"></textarea></label>
          <div class="err" id="reqErr" style="display:none"></div>
          <button class="btn btn-gold" id="reqGo">${esc(t('Send request','提交申请'))}</button>
          <button class="btn btn-ghost btn-sm" data-close-sheet>${esc(t('Close','关闭'))}</button>
        </div>
      </div>`;
    Y.openSheet('#sheet');
    $('#reqGo').addEventListener('click', async () => {
      const btn = $('#reqGo'), err = $('#reqErr');
      const p = $('#pReq').value.trim(), m = $('#mReq').value.trim(), n = $('#nReq').value.trim();
      if (!p && !m) {
        err.textContent = t('Enter a new price or a new minimum order quantity.', '请填写新价格或新起订量。');
        err.style.display = 'block'; return;
      }
      btn.disabled = true; err.style.display = 'none';
      try {
        await Y.api('/api/seller/price-request', { method: 'POST',
          body: { listing_id: id, proposed_cny: p || null, proposed_moq: m || null, note: n || null } });
        Y.closeSheet(); TAB = 'reqs'; await load();
      } catch (e) {
        err.textContent = (e.data && (zh() ? e.data.note_zh : e.data.note)) || e.message || 'error';
        err.style.display = 'block'; btn.disabled = false;
      }
    });
  }

  const so = $('#signOut');
  if (so) so.addEventListener('click', async () => {
    try { await Y.api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    location.href = '/';
  });

  /* Chinese first, and only Chinese ⇄ English here. The shared nav button
     cycles through Urdu, which a Yiwu supplier has no use for — so this page
     owns its own toggle. */
  (function language() {
    const btn = document.getElementById('langBtn');
    if (Y.lang() === 'ur') Y.applyLang('zh', true);
    else if (!['zh', 'en'].includes(Y.lang())) Y.applyLang('zh', true);
    if (btn) {
      const fresh = btn.cloneNode(true);          // drops the shared cycle handler
      btn.parentNode.replaceChild(fresh, btn);
      const label = () => {
        const l = document.getElementById('langLabel');
        if (l) l.textContent = Y.lang() === 'en' ? '中文' : 'English';
      };
      label();
      fresh.addEventListener('click', () => {
        Y.applyLang(Y.lang() === 'en' ? 'zh' : 'en', true);
        label();
      });
      document.addEventListener('yuan:lang', label);
    }
  })();

  document.addEventListener('yuan:lang', () => { if (SHOP) render(); });
  load();
})();
