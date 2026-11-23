// Taktik 單位圖鑑（玩家端）— 搜尋 units/ 的單位，照資料夾一層層篩選。不需要權杖：
// 發布時 GitHub Actions 會把 units/ 打包成網站上的 units.json，這裡只讀那個檔案。
(function () {
  'use strict';
  const R = window.TaktikRepo;
  const C = window.TaktikCalc;
  const CARD = window.TaktikCard;
  const BUNDLE_KEY = 'taktik-units-bundle-v1'; // 上次讀到的 units.json，沒網路時先顯示

  const $ = (id) => document.getElementById(id);
  const text = (s) => String(s == null ? '' : s).trim();
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 空間不足或封鎖時略過 */ } },
  };

  // ---------- 資料 ----------
  let units = [];          // [{ path, segs, data, name, total, hay, keywords }]
  let status = 'idle';     // idle | loading | ready | error
  let statusMsg = '';
  let generatedAt = null;

  function toUnit(path, data) {
    const segs = path.replace(/^units\//, '').replace(/\.json$/, '').split('/');
    const file = segs.pop();
    const card = CARD.normalize(data);
    const name = text(card.name) || file;
    const total = data && data.result && data.result.total != null ? data.result.total : null;
    const hay = [
      name, segs.join(' '),
      ...card.profiles.map((p) => `${p.name} ${p.keywords}`),
      ...card.composition,
      ...card.abilities.map((a) => C.parseAbility(a).text),
      ...card.weapons.map((w) => `${w.name} ${w.rules}`),
    ].join(' ').toLowerCase();
    const keywords = [...new Set(card.profiles.map((p) => C.clean(p.keywords)).filter(Boolean))].join('／');
    return { path, segs, data, name, total, hay, keywords };
  }
  function useBundle(b) {
    units = (b && Array.isArray(b.units) ? b.units : []).filter((u) => u && u.path && u.data).map((u) => toUnit(u.path, u.data));
    generatedAt = b && b.generatedAt ? new Date(b.generatedAt) : null;
  }

  // 網站上沒有 units.json（例如在自己電腦上測試）時，直接讀公開 repo 的 units/
  async function bundleFromRepo() {
    const files = await R.listUnitFiles();
    const out = [];
    const queue = files.slice();
    async function worker() {
      while (queue.length) {
        const f = queue.shift();
        try { out.push({ path: f.path, data: await R.loadBlob(f.sha) }); } catch (e) { console.warn('讀不到', f.path, e); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
    return { generatedAt: new Date().toISOString(), units: out };
  }

  async function sync() {
    status = 'loading'; statusMsg = '讀取單位資料…'; render();
    try {
      let bundle;
      const r = await fetch('../units.json', { cache: 'no-cache' });
      if (r.ok) bundle = await r.json();
      else if (r.status === 404) bundle = await bundleFromRepo();
      else throw new Error(`${r.status} ${r.statusText}`);
      useBundle(bundle);
      store.set(BUNDLE_KEY, bundle);
      status = 'ready'; statusMsg = '';
    } catch (e) {
      useBundle(store.get(BUNDLE_KEY, null));
      status = 'error'; statusMsg = navigator.onLine === false ? '目前沒有網路' : e.message;
    }
    render();
  }

  // ---------- 狀態（放在網址 # 後面，手機返回鍵可用） ----------
  // #/?p=陣營/子陣營&q=關鍵字&s=排序    #/unit/<path>
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    if (h.startsWith('/unit/')) return { view: 'unit', path: decodeURIComponent(h.slice(6)) };
    const qs = new URLSearchParams(h.split('?')[1] || '');
    return { view: 'list', p: (qs.get('p') || '').split('/').filter(Boolean), q: qs.get('q') || '', s: qs.get('s') || 'name' };
  }
  function listHash(st) {
    const qs = new URLSearchParams();
    if (st.p.length) qs.set('p', st.p.join('/'));
    if (st.q) qs.set('q', st.q);
    if (st.s && st.s !== 'name') qs.set('s', st.s);
    const s = qs.toString();
    return '#/' + (s ? '?' + s : '');
  }
  let listState = { p: [], q: '', s: 'name' };
  function go(hash, replace) {
    if (replace) history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
    route();
  }

  // ---------- 列表 ----------
  function matches(u, st) {
    for (let i = 0; i < st.p.length; i++) if (u.segs[i] !== st.p[i]) return false;
    const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    return words.every((w) => u.hay.includes(w));
  }

  function renderStatus() {
    const box = $('count');
    if (status === 'loading') box.textContent = statusMsg;
  }

  function render() {
    const st = listState;
    $('q').value = st.q;
    $('sort').value = st.s;

    // 路徑（麵包屑）
    const crumbs = $('crumbs');
    crumbs.replaceChildren();
    const all = el('button', { type: 'button', class: 'crumb', 'aria-current': st.p.length ? null : 'page', onclick: () => go(listHash({ ...st, p: [] })) }, '全部');
    crumbs.append(all);
    st.p.forEach((seg, i) => {
      crumbs.append(el('span', { class: 'sep', 'aria-hidden': 'true' }, '›'),
        el('button', { type: 'button', class: 'crumb', 'aria-current': i === st.p.length - 1 ? 'page' : null, onclick: () => go(listHash({ ...st, p: st.p.slice(0, i + 1) })) }, seg));
    });

    // 下一層分類（照資料夾）
    const hits = units.filter((u) => matches(u, st));
    const depth = st.p.length;
    const next = new Map();
    hits.forEach((u) => { if (u.segs.length > depth) next.set(u.segs[depth], (next.get(u.segs[depth]) || 0) + 1); });
    const chips = $('chips');
    chips.replaceChildren(...[...next.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant')).map(([seg, n]) =>
      el('button', { type: 'button', class: 'chip', role: 'listitem', onclick: () => go(listHash({ ...st, p: [...st.p, seg] })) },
        el('span', null, seg), el('span', { class: 'n' }, String(n)))));
    chips.hidden = next.size === 0;

    // 排序
    const sorted = hits.slice();
    if (st.s === 'pts-desc') sorted.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    else if (st.s === 'pts-asc') sorted.sort((a, b) => (a.total ?? 1e9) - (b.total ?? 1e9));
    else sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));

    // 數量／狀態
    const count = $('count');
    if (status === 'loading') count.textContent = statusMsg;
    else count.textContent = `共 ${sorted.length} 個單位${generatedAt ? `・資料更新 ${generatedAt.toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}`;

    const list = $('list');
    list.replaceChildren();
    if (status === 'error') list.append(el('div', { class: 'notice' }, `讀取失敗：${statusMsg}${units.length ? '（先顯示上次存在這台裝置的資料）' : ''}`));
    if (status === 'loading' && !units.length) { list.append(el('div', { class: 'empty' }, el('p', null, '讀取中…'))); return; }
    if (!sorted.length) {
      list.append(el('div', { class: 'empty' }, el('p', null, units.length ? '找不到符合的單位。' : '資料庫裡還沒有單位。'),
        st.q || st.p.length ? el('button', { type: 'button', onclick: () => go(listHash({ p: [], q: '', s: st.s })) }, '清除搜尋和篩選') : null));
      return;
    }
    const ul = el('ul', { class: 'units' });
    sorted.forEach((u) => {
      ul.append(el('li', null, el('a', { class: 'unit-row', href: '#/unit/' + encodeURIComponent(u.path) },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-name' }, u.name),
          el('div', { class: 'row-path' }, u.segs.join(' › ')),
          u.keywords ? el('div', { class: 'row-kw' }, u.keywords) : null),
        el('div', { class: 'row-pts' }, u.total != null ? el('span', null, String(u.total), el('small', null, 'pts')) : '—'))));
    });
    list.append(ul);
  }

  // ---------- 單位頁 ----------
  function renderUnit(path) {
    const u = units.find((x) => x.path === path);
    $('unit-title').textContent = u ? u.name : '找不到單位';
    $('unit-path').textContent = u ? u.segs.join(' › ') : '';
    const frame = $('card-frame');
    frame.replaceChildren();
    $('unit-meta').replaceChildren();
    if (!u) {
      frame.append(el('p', { class: 'empty' }, status === 'loading' ? '讀取中…' : '這個單位不在資料庫裡（可能被改名或刪除）。'));
      return;
    }
    const inner = el('div', { class: 'card-scale' }, CARD.render(u.data, null, { iconBase: '../icons/', total: u.total }));
    frame.append(inner);
    fitCard();
    const saved = u.data.savedAt ? new Date(u.data.savedAt) : null;
    $('unit-meta').append(
      saved ? `最後保存：${saved.toLocaleDateString('zh-TW')}　` : '',
      el('a', { href: '../?load=' + encodeURIComponent(u.path) }, '在算分編輯器開啟'));
  }
  // 資料卡固定 540px 寬，手機上整張等比例縮小
  function fitCard() {
    const frame = $('card-frame');
    const inner = frame.querySelector('.card-scale');
    if (!inner) return;
    const avail = frame.clientWidth;
    // 還沒排版（寬度 0）時先用原尺寸，等尺寸出來再縮
    inner.style.zoom = avail > 0 ? Math.min(1, avail / 540) : 1;
  }
  window.addEventListener('resize', fitCard);
  if ('ResizeObserver' in window) new ResizeObserver(fitCard).observe($('card-frame'));

  // ---------- 畫面切換 ----------
  function route() {
    const r = parseHash();
    if (r.view === 'unit') {
      if (!$('screen-unit').hidden) { renderUnit(r.path); return; }
      listScroll = window.scrollY;
      $('screen-list').hidden = true; $('screen-unit').hidden = false;
      renderUnit(r.path);
      window.scrollTo(0, 0);
    } else {
      const back = !$('screen-list').hidden ? null : listScroll;
      listState = { p: r.p, q: r.q, s: r.s };
      $('screen-unit').hidden = true; $('screen-list').hidden = false;
      render();
      if (back != null) window.scrollTo(0, back);
    }
  }
  let listScroll = 0;
  window.addEventListener('popstate', route);
  window.addEventListener('hashchange', route);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.unit-row');
    if (!a) return;
    e.preventDefault();
    openedFromList = true;
    go(a.getAttribute('href'));
  });
  // 從列表點進來的就用瀏覽器返回（保留捲動位置）；直接開單位網址的就回列表
  let openedFromList = false;
  $('btn-back').addEventListener('click', () => {
    if (openedFromList) { openedFromList = false; history.back(); }
    else go(listHash(listState), true);
  });

  // 搜尋：打字時即時篩選，不要每個字都塞進瀏覽紀錄
  let qTimer = null;
  $('q').addEventListener('input', (e) => {
    clearTimeout(qTimer);
    const v = e.target.value;
    qTimer = setTimeout(() => go(listHash({ ...listState, q: v.trim() }), true), 150);
  });
  $('sort').addEventListener('change', (e) => go(listHash({ ...listState, s: e.target.value }), true));
  $('btn-refresh').addEventListener('click', sync);

  // ---------- 加到主畫面（離線也能開） ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }

  // ---------- 開始 ----------
  useBundle(store.get(BUNDLE_KEY, null));
  if (!location.hash) history.replaceState(null, '', '#/');
  route();
  sync().then(() => { if (parseHash().view === 'unit') route(); });

  window.__player = { get units() { return units; }, sync, route };
})();
