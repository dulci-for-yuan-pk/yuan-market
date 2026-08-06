/* ============================================================
   YUAN MARKET — full listings page (filter by tier + category)
   ============================================================ */
(function () {
  'use strict';
  const Y = window.Yuan;
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const qs = new URLSearchParams(location.search);
  // /c/<slug>/ pretty route is rewritten to this page — recover the slug
  const pathCat = (location.pathname.match(/^\/c\/([^/]+)/) || [])[1];
  const state = {
    tier: qs.get('tier') || '',
    category: qs.get('category') || pathCat || '',
    demo: qs.get('demo') === '1'
  };
  let categories = [];

  function catChips(){
    const box = $('#catChips');
    if (!box) return;
    const lang = Y.lang();
    const name = c => (lang === 'ur' && c.name_ur) ? c.name_ur
                    : (lang === 'zh' && c.name_zh) ? c.name_zh : c.name_en;
    box.innerHTML = [{ slug:'', name_en:Y.t('list.all'), name_ur:Y.t('list.all'), name_zh:Y.t('list.all') }]
      .concat(categories)
      .map(c => `<button class="chip${c.slug === state.category ? ' gold' : ''}"
                   data-cat="${esc(c.slug)}" style="flex:0 0 auto">${esc(name(c))}</button>`)
      .join('');
  }

  function syncUrl(){
    const p = new URLSearchParams();
    if (state.tier) p.set('tier', state.tier);
    if (state.category) p.set('category', state.category);
    if (state.demo) p.set('demo', '1');
    const q = p.toString();
    history.replaceState(null, '', '/listings/' + (q ? '?' + q : ''));
  }

  async function load(){
    const grid = $('#grid'), count = $('#listCount');
    if (grid) grid.innerHTML = '<div class="skel" style="aspect-ratio:3/4"></div>'.repeat(4);
    try{
      const p = new URLSearchParams({ limit:'96' });
      if (state.tier) p.set('tier', state.tier);
      if (state.category) p.set('category', state.category);
      if (state.demo) p.set('demo', '1');

      const d = await Y.api('/api/catalog?' + p.toString());
      categories = d.categories || [];
      catChips();

      if (!grid) return;
      if (d.listings && d.listings.length){
        grid.innerHTML = d.listings.map(window.YuanCard).join('');
        Y.observe(grid);
        if (window.YuanWatchLanded) window.YuanWatchLanded(grid);
        if (count) count.innerHTML = `<span class="num">${d.listings.length}</span> ${esc(Y.t('list.count'))}`;
      } else {
        grid.innerHTML = window.YuanEmpty('list.empty.p');
        if (count) count.textContent = '';
      }
      Y.scrubDigits(document.body);
    }catch(e){
      if (grid) grid.innerHTML = window.YuanEmpty('list.error');
    }
  }

  /* tier segmented control */
  $$('#tierSeg button').forEach(b => b.addEventListener('click', () => {
    state.tier = b.dataset.tier || '';
    $$('#tierSeg button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    syncUrl(); load();
  }));
  // reflect an incoming ?tier= on first paint
  $$('#tierSeg button').forEach(b =>
    b.setAttribute('aria-selected', String((b.dataset.tier || '') === state.tier)));

  document.addEventListener('click', e => {
    const c = e.target.closest('[data-cat]');
    if (!c) return;
    state.category = c.dataset.cat || '';
    syncUrl(); load();
  });

  document.addEventListener('yuan:lang', () => { catChips(); load(); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
