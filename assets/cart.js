/* ============================================================
   YUAN MARKET — basket and checkout
   No payment is taken here. An order is placed free; money is asked
   for only after the supplier confirms and an invoice is issued.
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  let CART = null, WINDOWS = [], CITIES = [], ME = null;

  const t = (en, ur) => Y.lang() === 'ur' ? ur : en;

  async function load() {
    const box = $('#cartView');
    try {
      const me = await Y.api('/api/me');
      ME = me.account;
      if (!ME) { location.href = '/login/?next=/cart/'; return; }
    } catch (e) { location.href = '/login/?next=/cart/'; return; }

    try {
      const [c, w] = await Promise.all([
        Y.api('/api/shop/cart'),
        Y.api('/api/shop/windows').catch(() => ({ windows: [], cities: [] }))
      ]);
      CART = c.cart; WINDOWS = w.windows || []; CITIES = w.cities || [];
      render();
    } catch (e) {
      box.innerHTML = `<div class="panel"><div class="panel-b">
        <div class="err">${esc(t('Could not load your basket.','آپ کی ٹوکری نہیں کھل سکی۔'))}</div></div></div>`;
    }
  }

  function render() {
    const box = $('#cartView');
    const items = CART.items || [];
    const tot = CART.totals;

    if (!items.length) {
      box.innerHTML = `<div class="panel"><div class="panel-b" style="text-align:center;padding:clamp(30px,6vw,64px)">
        <div style="font-family:var(--serif);font-size:44px;color:var(--gold);opacity:.3;margin-bottom:12px">元</div>
        <h1 class="h-s" style="margin-bottom:10px">${esc(t('Your basket is empty','آپ کی ٹوکری خالی ہے'))}</h1>
        <p class="muted" style="font-size:14px;margin-bottom:20px">
          ${esc(t('Add goods from the market and we will price the whole basket for you.',
                  'مارکیٹ سے مال شامل کریں، ہم پوری ٹوکری کا حساب بنا دیں گے۔'))}</p>
        <a class="btn btn-gold" href="/listings/">${esc(t('Browse the market','مارکیٹ دیکھیں'))}</a>
      </div></div>`;
      return;
    }

    const belowMoq = items.filter(i => i.below_moq);

    box.innerHTML = `
      <div class="adm-head"><div>
        <h1>${esc(t('Your basket','آپ کی ٹوکری'))}</h1>
        <p>${esc(t('Nothing is charged now. We confirm every price with the supplier first, then send you an invoice.',
                   'ابھی کوئی رقم نہیں لی جاتی۔ ہم پہلے ہر قیمت سپلائر سے پکی کرتے ہیں، پھر آپ کو بل بھیجتے ہیں۔'))}</p>
      </div></div>

      ${belowMoq.length ? `<div class="panel" style="border-color:color-mix(in srgb,var(--warn) 40%,transparent)">
        <div class="panel-b" style="font-size:13.5px;line-height:1.7">
          <b style="color:var(--warn)">${esc(t('Below minimum order','کم از کم مقدار سے کم'))}</b><br>
          ${belowMoq.map(i => `${esc(i.title_en.slice(0,40))} — ${esc(t('minimum','کم از کم'))}
            <b class="num">${Y.n0(i.moq)}</b>, ${esc(t('you have','آپ کے پاس'))} <b class="num">${Y.n0(i.qty)}</b>`).join('<br>')}
          <div class="muted" style="margin-top:8px">${esc(t('The supplier may refuse a quantity below their minimum. You can still order — we will tell you what they say.',
            'سپلائر کم مقدار سے انکار کر سکتا ہے۔ آپ پھر بھی آرڈر کر سکتے ہیں، ہم اُن کا جواب بتا دیں گے۔'))}</div>
        </div></div>` : ''}

      <div class="panel">
        <div class="panel-h"><h2>${esc(t('Goods','مال'))}</h2>
          <div class="sub">${Y.n0(items.length)} ${esc(t('items','اشیاء'))}</div></div>
        <div class="tbl-wrap"><table class="adm"><thead><tr>
          <th></th><th>${esc(t('Item','چیز'))}</th><th>${esc(t('Unit ¥','فی عدد ¥'))}</th>
          <th>${esc(t('Quantity','تعداد'))}</th><th style="text-align:right">${esc(t('Line PKR','رقم'))}</th><th></th>
        </tr></thead><tbody>
        ${items.map(i => `<tr>
          <td>${i.hero_url ? `<img class="thumb" src="${esc(i.hero_url)}" referrerpolicy="no-referrer" alt="">` : ''}</td>
          <td style="max-width:280px">
            <a href="/p/${esc(i.slug)}/" style="font-weight:600">${esc((i.title_en||'').slice(0,54))}</a>
            ${i.title_zh ? `<span class="zh">${esc(i.title_zh.slice(0,44))}</span>` : ''}
            ${i.moq != null ? `<div class="dim" style="font-size:11px">${esc(t('min','کم از کم'))} ${Y.n0(i.moq)}</div>` : ''}
          </td>
          <td class="num">¥${Y.n2(i.unit_cny)}</td>
          <td><input class="inp num" style="height:34px;width:96px" type="number" min="1"
                value="${i.qty}" data-qty="${esc(i.item_id)}"></td>
          <td class="num" style="text-align:right">${Y.n0(i.line_pkr)}</td>
          <td><button class="btn btn-ghost btn-sm" data-rm="${esc(i.item_id)}">✕</button></td>
        </tr>`).join('')}
        </tbody></table></div>
      </div>

      ${tot ? sheetPanel(tot) : ''}
      ${destPanel()}

      <div class="panel">
        <div class="panel-b">
          <div class="glass" style="border-radius:var(--r-m);padding:13px 16px;margin-bottom:16px">
            <p class="muted" style="font-size:13px;line-height:1.7" data-t="ord.nopay.note"></p>
          </div>
          <label class="field-l">${esc(t('Delivery address for your shop','آپ کی دکان کا پتہ'))}</label>
          <textarea class="inp" id="addr" rows="2"
            placeholder="${esc(t('Shop name, street, city','دکان کا نام، گلی، شہر'))}">${esc(ME.business_name || '')}</textarea>
          <div style="height:12px"></div>
          <label class="field-l">${esc(t('Anything we should know','کوئی بات بتانا چاہیں'))}</label>
          <textarea class="inp" id="note" rows="2"></textarea>
          <div id="coErr" class="err" style="display:none;margin-top:12px"></div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-gold btn-lg" id="placeOrder">
              ${esc(t('Place the order — no payment','آرڈر کریں — کوئی ادائیگی نہیں'))}</button>
            <button class="btn btn-glass" id="saveList">${esc(t('Save this list','یہ لسٹ محفوظ کریں'))}</button>
            <a class="btn btn-ghost" href="/listings/">${esc(t('Keep shopping','مزید مال دیکھیں'))}</a>
          </div>
        </div>
      </div>`;

    wire();
    Y.applyLang(Y.lang(), false);
    Y.scrubDigits(box);
  }

  function sheetPanel(tot) {
    const c = tot.completeness;
    const groups = tot.groups || [];
    return `<div class="panel">
      <div class="panel-h">
        <div><h2>${esc(t('The whole sheet','پورا حساب'))}</h2>
        <div class="sub">${esc(t('Duty is worked out per product type, never averaged across the basket.',
          'ڈیوٹی ہر چیز کی الگ لگتی ہے، پوری ٹوکری پر اوسط نہیں۔'))}</div></div>
      </div>
      <div class="tbl-wrap"><table class="adm"><thead><tr>
        <th>${esc(t('Line','مد'))}</th><th>${esc(t('Basis','بنیاد'))}</th>
        <th>${esc(t('Rate','شرح'))}</th><th style="text-align:right">PKR</th>
      </tr></thead><tbody>
      ${groups.map(g => g.lines.filter(l => l.amount_pkr != null || l.basis !== 'confirmed').map(l => `<tr>
        <td>${esc(l.label)}${g.category_slug && g.category_slug !== 'unknown'
          ? ` <span class="dim" style="font-size:11px">${esc(g.category_slug)}</span>` : ''}</td>
        <td><span class="prov prov-${l.basis}">${l.basis}</span></td>
        <td class="num">${l.value == null ? '—' : Y.n2(l.value) + (l.unit || '')}</td>
        <td class="num" style="text-align:right">${l.amount_pkr == null ? '—' : Y.n0(l.amount_pkr)}</td>
      </tr>`).join('')).join('')}
      <tr><td colspan="3"><b>${esc(t('Our service fee 20%','ہماری سروس فیس 20%'))}</b></td>
        <td class="num" style="text-align:right"><b>${Y.n0(tot.commission_pkr)}</b></td></tr>
      <tr><td colspan="3"><b>${esc(t('Total','کل'))}</b></td>
        <td class="num" style="text-align:right"><b style="color:var(--gold);font-size:16px">${Y.n0(tot.total_pkr)}</b></td></tr>
      </tbody></table></div>
      <div class="panel-b" style="font-size:12.5px">
        <span class="prov prov-confirmed">${c.confirmed} ${esc(t('confirmed','پکے'))}</span>
        <span class="prov prov-estimated" style="margin-inline-start:6px">${c.estimated} ${esc(t('estimated','اندازاً'))}</span>
        <span class="prov prov-unsourced" style="margin-inline-start:6px">${c.unsourced} ${esc(t('not yet known','ابھی معلوم نہیں'))}</span>
        ${c.caveat ? `<div class="muted" style="margin-top:9px;line-height:1.65">${esc(c.caveat)}</div>` : ''}
        ${tot.cbm_incomplete ? `<div class="muted" style="margin-top:7px">${esc(t(
          'Carton size is not recorded for every item yet, so freight cannot be split precisely until we confirm with the supplier.',
          'ہر چیز کے کارٹن کا سائز ابھی درج نہیں، اس لیے کرایہ سپلائر سے تصدیق تک ٹھیک سے تقسیم نہیں ہو سکتا۔'))}</div>` : ''}
      </div>
    </div>`;
  }

  function destPanel() {
    const mine = CART.city_slug;
    const forCity = WINDOWS.filter(w => !mine || w.city_slug === mine);
    return `<div class="panel">
      <div class="panel-h"><div><h2>${esc(t('Where it goes','کہاں جائے گا'))}</h2>
        <div class="sub">${esc(t('Joining a container going to your city shares the freight and lowers your cost.',
          'اپنے شہر جانے والے کنٹینر میں شامل ہوں تو کرایہ بٹ جاتا ہے اور خرچہ کم ہوتا ہے۔'))}</div></div></div>
      <div class="panel-b">
        <label class="field-l">${esc(t('Your city','آپ کا شہر'))}</label>
        <select class="inp" id="city">
          <option value="">${esc(t('Choose a city','شہر چنیں'))}</option>
          ${CITIES.map(c => `<option value="${esc(c.slug)}" ${c.slug === mine ? 'selected' : ''}>
            ${esc(Y.lang() === 'ur' ? c.name_ur : c.name_en)}</option>`).join('')}
        </select>
        ${forCity.length ? `<div style="margin-top:16px;display:grid;gap:10px">
          ${forCity.map(w => windowCard(w)).join('')}
        </div>` : `<p class="muted" style="font-size:13px;margin-top:14px;line-height:1.7">${esc(t(
          'No container is currently announced for your city. Your order will ship on its own, or we will tell you when the next container for your city opens.',
          'اِس وقت آپ کے شہر کے لیے کوئی کنٹینر اعلان نہیں ہوا۔ آپ کا مال الگ جائے گا، یا ہم بتا دیں گے جب آپ کے شہر کا اگلا کنٹینر کھلے۔'))}</p>`}
      </div>
    </div>`;
  }

  function windowCard(w) {
    const sel = CART.consolidation_id === w.id;
    return `<label class="glass" style="border-radius:var(--r-m);padding:14px 16px;display:block;cursor:pointer;
      ${sel ? 'border-color:var(--hair-gold)' : ''}">
      <div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap">
        <input type="radio" name="cons" value="${esc(w.id)}" ${sel ? 'checked' : ''} data-cons>
        <b style="font-size:14px">${esc(w.city_slug)} · ${esc(w.container_size)}</b>
        <span class="pill-sm st-live num">${esc(t('closes in','بند ہونے میں'))} ${w.closes_in_days} ${esc(t('days','دن'))}</span>
      </div>
      <div style="margin-top:11px;height:9px;border-radius:99px;background:var(--mat-3);overflow:hidden">
        <div style="height:100%;width:${w.fill_pct}%;background:linear-gradient(90deg,var(--gold-2),var(--gold));
          transition:width .8s var(--e-out)"></div>
      </div>
      <div class="dim" style="font-size:11.5px;margin-top:7px">
        <span class="num">${w.fill_pct}%</span> ${esc(t('full','بھرا'))} ·
        <span class="num">${Y.n2(w.free_cbm)}</span> CBM ${esc(t('free','خالی'))}
        ${w.departs_at ? ` · ${esc(t('sails','روانگی'))} <span class="num">${Y.date(w.departs_at)}</span>` : ''}
        · ${esc(w.fallback === 'roll' ? t('if it does not fill, it rolls to the next one','نہ بھرے تو اگلے میں چلا جائے گا')
              : w.fallback === 'lcl' ? t('if it does not fill, it ships LCL','نہ بھرے تو الگ بھیجا جائے گا')
              : t('if it does not fill, it is cancelled','نہ بھرے تو منسوخ'))}
      </div>
    </label>`;
  }

  function wire() {
    $$('[data-qty]').forEach(inp => inp.addEventListener('change', async () => {
      const qty = parseInt(inp.value, 10);
      try { await Y.api('/api/shop/cart/update', { method:'POST', body:{ item_id: inp.dataset.qty, qty } }); load(); }
      catch (e) { alert('Could not update'); }
    }));
    $$('[data-rm]').forEach(b => b.addEventListener('click', async () => {
      try { await Y.api('/api/shop/cart/update', { method:'POST', body:{ item_id: b.dataset.rm, qty: 0 } }); load(); }
      catch (e) {}
    }));
    const city = $('#city');
    if (city) city.addEventListener('change', async () => {
      await Y.api('/api/shop/cart/city', { method:'POST', body:{ city_slug: city.value } }).catch(()=>{});
      load();
    });
    $$('[data-cons]').forEach(r => r.addEventListener('change', async () => {
      await Y.api('/api/shop/cart/city', { method:'POST', body:{ consolidation_id: r.value } }).catch(()=>{});
      load();
    }));

    $('#placeOrder').addEventListener('click', async e => {
      const err = $('#coErr');
      err.style.display = 'none';
      const address = $('#addr').value.trim();
      if (!address) { err.textContent = t('Please give the delivery address for your shop.','براہِ کرم اپنی دکان کا پتہ لکھیں۔'); err.style.display='block'; return; }
      e.target.disabled = true; e.target.textContent = t('Placing…','بھیجا جا رہا ہے…');
      try {
        const d = await Y.api('/api/shop/checkout', { method:'POST', body:{
          address, note: $('#note').value.trim(),
          city_slug: $('#city') ? $('#city').value : null
        }});
        location.href = '/account/?placed=' + encodeURIComponent(d.order.ref);
      } catch (ex) {
        const code = (ex.data && ex.data.error) || '';
        const note = ex.data && (Y.lang()==='ur' ? ex.data.note_ur : ex.data.note);
        err.textContent = note || {
          city_required: t('Please choose your city.','براہِ کرم اپنا شہر چنیں۔'),
          cart_empty: t('Your basket is empty.','ٹوکری خالی ہے۔'),
          no_fx: t('The live rate is unavailable right now — we will not price an order on a guess.','ابھی ریٹ دستیاب نہیں — ہم اندازے پر آرڈر نہیں بناتے۔')
        }[code] || t('Could not place the order.','آرڈر نہیں ہو سکا۔');
        err.style.display = 'block';
        e.target.disabled = false; e.target.textContent = t('Place the order — no payment','آرڈر کریں — کوئی ادائیگی نہیں');
      }
    });

    $('#saveList').addEventListener('click', async e => {
      const name = prompt(t('Name this list','اس لسٹ کا نام'), t('Season order','سیزن کا آرڈر'));
      if (!name) return;
      try { await Y.api('/api/shop/saved-lists/save', { method:'POST', body:{ name } });
        e.target.textContent = t('Saved','محفوظ ہو گئی'); } catch (ex) {}
    });
  }

  document.addEventListener('yuan:lang', () => { if (CART) render(); });
  load();
})();
