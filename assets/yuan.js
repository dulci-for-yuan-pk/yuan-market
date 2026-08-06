/* ============================================================
   YUAN MARKET — shared runtime
   Language (en/ur/zh), theme (day/night), live FX, session,
   reveal motion, numeral enforcement.
   ============================================================ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const store = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }
  };
  const Y = window.Yuan = {};

  /* ---------------- NUMERALS: force Western 0-9 ---------------- */
  // Defensive: if any Urdu-Indic / Arabic-Indic digits ever reach the DOM
  // (from a data source or a stray translation), rewrite them.
  const EASTERN = /[٠-٩۰-۹]/g;
  function westernise(str){
    return str.replace(EASTERN, d => {
      const c = d.charCodeAt(0);
      return String(c >= 0x06F0 ? c - 0x06F0 : c - 0x0660);
    });
  }
  Y.westernise = westernise;
  function scrubDigits(root){
    const w = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT);
    let n; const hits = [];
    while ((n = w.nextNode())) if (EASTERN.test(n.nodeValue)) hits.push(n);
    hits.forEach(n => { n.nodeValue = westernise(n.nodeValue); });
  }
  Y.scrubDigits = scrubDigits;

  /* ---------------- NUMBER FORMATTING (always en-US digits) ---- */
  const fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  Y.n0 = v => (v == null || isNaN(v)) ? '—' : fmt0.format(v);
  Y.n2 = v => (v == null || isNaN(v)) ? '—' : fmt2.format(v);
  Y.pkr = v => (v == null || isNaN(v)) ? '—' : fmt0.format(v) + ' PKR';
  Y.cny = v => (v == null || isNaN(v)) ? '—' : '¥ ' + fmt2.format(v);
  Y.usd = v => (v == null || isNaN(v)) ? '—' : '$ ' + fmt2.format(v);
  Y.date = iso => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('en-GB',
        { day:'2-digit', month:'short', year:'numeric' }).format(new Date(iso));
    } catch(e){ return '—'; }
  };

  /* ---------------- i18n ---------------- */
  const DICT = window.YUAN_I18N || { en:{}, ur:{}, zh:{} };
  let LANG = store.get('yuan-lang') || 'en';
  if (!['en','ur','zh'].includes(LANG)) LANG = 'en';

  function t(key, lang){
    const L = lang || LANG;
    const table = DICT[L] || {};
    if (table[key] != null) return table[key];
    // fallback chain -> English. Guarantees no stranded wrong-language text.
    if (DICT.en && DICT.en[key] != null) return DICT.en[key];
    return '';
  }
  Y.t = t;
  Y.lang = () => LANG;

  function applyLang(lang, save){
    LANG = ['en','ur','zh'].includes(lang) ? lang : 'en';
    if (save) store.set('yuan-lang', LANG);

    document.body.classList.toggle('ur', LANG === 'ur');
    document.body.classList.toggle('zh', LANG === 'zh');
    document.documentElement.lang = LANG;
    document.documentElement.dir = (LANG === 'ur') ? 'rtl' : 'ltr';

    // translate every marked node
    $$('[data-t]').forEach(el => {
      const v = t(el.getAttribute('data-t'));
      if (v !== '') el.textContent = v;
    });
    $$('[data-t-ph]').forEach(el => {
      const v = t(el.getAttribute('data-t-ph'));
      if (v !== '') el.setAttribute('placeholder', v);
    });
    $$('[data-t-aria]').forEach(el => {
      const v = t(el.getAttribute('data-t-aria'));
      if (v !== '') el.setAttribute('aria-label', v);
    });
    $$('[data-t-title]').forEach(el => {
      const v = t(el.getAttribute('data-t-title'));
      if (v !== '') el.setAttribute('title', v);
    });

    // language button shows the NEXT language, not the current one
    const lb = $('#langLabel');
    if (lb) lb.textContent = LANG === 'en' ? 'اردو' : LANG === 'ur' ? '中文' : 'English';

    scrubDigits(document.body);
    document.dispatchEvent(new CustomEvent('yuan:lang', { detail:{ lang: LANG } }));
  }
  Y.applyLang = applyLang;

  /* ---------------- THEME ---------------- */
  function autoTheme(){ const h = new Date().getHours(); return (h >= 6 && h < 18) ? 'day' : 'night'; }
  function applyTheme(mode){
    const day = mode === 'day';
    document.body.classList.toggle('day', day);
    const ico = $('#themeIco'); if (ico) ico.textContent = day ? '☀' : '☾';
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', day ? '#F6F3EC' : '#05080C');
  }
  Y.applyTheme = applyTheme;

  /* ---------------- BOOT CHROME ---------------- */
  function boot(){
    applyTheme(store.get('yuan-theme') || autoTheme());
    applyLang(LANG, false);

    const tb = $('#themeBtn');
    if (tb) tb.addEventListener('click', () => {
      const next = document.body.classList.contains('day') ? 'night' : 'day';
      store.set('yuan-theme', next); applyTheme(next);
    });

    const lg = $('#langBtn');
    if (lg) lg.addEventListener('click', () => {
      const next = LANG === 'en' ? 'ur' : LANG === 'ur' ? 'zh' : 'en';
      applyLang(next, true);
    });

    const nav = $('#nav');
    if (nav){
      const s = () => nav.classList.toggle('tight', window.scrollY > 20);
      s(); window.addEventListener('scroll', s, { passive:true });
    }

    const dr = $('#drawer');
    const open = () => dr && dr.classList.add('open');
    const close = () => dr && dr.classList.remove('open');
    const bg = $('#burger'); if (bg) bg.addEventListener('click', open);
    const dx = $('#drawerX'); if (dx) dx.addEventListener('click', close);
    if (dr) $$('a', dr).forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    const yr = $('#yr'); if (yr) yr.textContent = new Date().getFullYear();

    Y.observe(document);
    Y.loadFx();
    Y.loadSession();
    Y.bumpCart();
  }

  /* ---------------- REVEAL ---------------- */
  const io = ('IntersectionObserver' in window)
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      }), { threshold:0.1, rootMargin:'0px 0px -6% 0px' })
    : null;
  Y.observe = root => $$('.rv', root || document).forEach(el => io ? io.observe(el) : el.classList.add('in'));

  /* ---------------- LIVE FX ---------------- */
  Y.fx = null;
  Y.loadFx = async function(){
    const pill = $('#ratePill'), val = $('#rateVal'), foot = $('#fxFoot');
    try{
      const r = await fetch('/api/fx');
      const d = await r.json();
      if (!r.ok || !d.ok || !d.rate) throw new Error(d.reason || 'fx');
      Y.fx = d;
      if (val) val.textContent = d.rate.toFixed(2);
      if (pill) pill.classList.remove('dead');
      if (foot) foot.textContent = `¥1 = ${d.rate.toFixed(2)} PKR · ${d.source} · ${Y.date(d.as_of)}`;
      document.dispatchEvent(new CustomEvent('yuan:fx', { detail:d }));
    }catch(e){
      Y.fx = null;
      if (pill) pill.classList.add('dead');
      if (val) val.textContent = 'n/a';
      if (foot) foot.textContent = t('misc.rateoff');
    }
  };
  setInterval(() => Y.loadFx(), 15*60*1000);

  /* ---------------- SESSION ---------------- */
  Y.me = null;
  Y.loadSession = async function(){
    try{
      const r = await fetch('/api/me', { credentials:'same-origin' });
      if (!r.ok) throw new Error('no session');
      const d = await r.json();
      Y.me = d && d.ok ? d.account : null;
    }catch(e){ Y.me = null; }
    paintSession();
    document.dispatchEvent(new CustomEvent('yuan:session', { detail:Y.me }));
  };
  function paintSession(){
    const slot = $('#authSlot');
    if (!slot) return;
    if (!Y.me){
      slot.innerHTML = `<a class="chip" href="/login/"><span data-t="nav.login"></span></a>`;
    } else {
      const home = Y.me.role === 'admin' ? '/admin/' : Y.me.role === 'seller' ? '/seller/' : '/account/';
      const label = Y.me.role === 'admin' ? 'nav.admin' : Y.me.role === 'seller' ? 'nav.seller' : 'nav.account';
      slot.innerHTML = `<a class="chip gold" href="${home}"><span data-t="${label}"></span></a>`;
    }
    applyLang(LANG, false);
  }

  /* ---------------- CART BADGE ---------------- */
  Y.bumpCart = async function(){
    const el = $('#cartCount');
    if (!el) return;
    try {
      const d = await fetch('/api/shop/cart', { credentials:'same-origin' });
      if (!d.ok) { el.textContent = ''; return; }
      const j = await d.json();
      const n = (j.cart && j.cart.items) ? j.cart.items.length : 0;
      el.textContent = n ? String(n) : '';
    } catch (e) { el.textContent = ''; }
  };

  /* ---------------- API HELPER ---------------- */
  Y.api = async function(path, opts){
    const o = Object.assign({ credentials:'same-origin', headers:{} }, opts || {});
    if (o.body && typeof o.body !== 'string'){
      o.headers['content-type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const r = await fetch(path, o);
    let d = null;
    try { d = await r.json(); } catch(e){}
    if (!r.ok) throw Object.assign(new Error((d && d.error) || ('HTTP ' + r.status)), { status:r.status, data:d });
    return d;
  };

  /* ---------------- SOFT PAGE TRANSITIONS ---------------- */
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:')
        || href.startsWith('tel:') || a.target === '_blank') return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    document.body.classList.add('leaving');
    setTimeout(() => { location.href = href; }, 190);
  });

  /* ---------------- SHEETS ---------------- */
  Y.openSheet = function(id){
    const s = $(id), sc = $('#scrim');
    if (s) s.classList.add('open');
    if (sc) sc.classList.add('open');
  };
  Y.closeSheet = function(){
    $$('.sheet').forEach(s => s.classList.remove('open'));
    const sc = $('#scrim'); if (sc) sc.classList.remove('open');
  };
  document.addEventListener('click', e => {
    if (e.target.id === 'scrim' || e.target.closest('[data-close-sheet]')) Y.closeSheet();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
