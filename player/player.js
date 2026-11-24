// Taktik 玩家端 App — 頂端列＋左側選單的外殼，裡面放各個功能（目前：單位圖鑑）。
// 單位圖鑑：搜尋 units/ 的單位，照資料夾一層層篩選。不需要權杖：
// 發布時 GitHub Actions 會把 units/ 打包成網站上的 units.json，這裡只讀那個檔案。
// 玩家端只能看，不放任何編輯入口。
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


  // ---------- 關鍵字 ----------
  // keywords.json（編輯器維護）。資料卡上查得到的特規變成藍字虛線，點了跳出說明；說明裡的 [ ] 也能再點，返回一層層回去
  const KW = window.TaktikKW;
  const KW_KEY = 'taktik-keywords-v1';
  let kwdb = store.get(KW_KEY, null);
  let kwIndex = KW.buildIndex(kwdb);
  async function loadKeywords() {
    try {
      const r = await fetch('../keywords.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      kwdb = await r.json();
      kwIndex = KW.buildIndex(kwdb);
      store.set(KW_KEY, kwdb);
    } catch (e) { /* 沒網路就用上次的 */ }
  }
  const kwById = (id) => (kwIndex.items || []).find((x) => x.id === id);
  const cardKeywords = () => ({ lookup: (t) => KW.lookup(kwIndex, t) });

  // 說明文字：一行一段、「・」開頭是條列、[ ] 裡查得到的變成連結
  function kwRich(s) {
    const frag = document.createDocumentFragment();
    let ul = null;
    String(s || '').split('\n').forEach((line) => {
      const bullet = /^\s*[・•]/.test(line);
      const body = line.replace(/^\s*[・•]\s*/, '');
      const host = el(bullet ? 'li' : 'p');
      body.split(/(\[[^\]]+\])/).forEach((part) => {
        const m = part.match(/^\[([^\]]+)\]$/);
        if (!m) { if (part) host.append(part); return; }
        const it = KW.lookup(kwIndex, m[1]);
        host.append(it ? el('button', { type: 'button', class: 'kwlink', 'data-kw': it.id }, m[1]) : el('span', { class: 'kwref' }, m[1]));
      });
      if (bullet) { if (!ul) { ul = el('ul'); frag.append(ul); } ul.append(host); }
      else { ul = null; if (line.trim()) frag.append(host); }
    });
    return frag;
  }

  // 說明視窗：一個堆疊。打開一個就 push 一筆瀏覽紀錄，所以手機的返回鍵／返回按鈕都是回上一個
  const kwStack = [];
  function drawSheet() {
    const it = kwById(kwStack[kwStack.length - 1]);
    if (!it) return;
    $('kws-name').textContent = it.name;
    $('kws-en').textContent = it.en || '';
    $('kws-en').hidden = !it.en;
    const body = [];
    if (it.includes && it.includes.length) {
      body.push(el('p', { class: 'kws-inc' }, el('b', null, '包含：'),
        ...it.includes.flatMap((x, i) => {
          const hit = KW.lookup(kwIndex, x);
          const node = hit ? el('button', { type: 'button', class: 'kwlink', 'data-kw': hit.id }, x) : el('span', { class: 'kwref' }, x);
          return i ? ['、', node] : [node];
        })));
      if (!String(it.text || '').trim()) body.push(el('p', { class: 'kws-note' }, '此單位適用以上關鍵字（算分時照這些特規算）。'));
    }
    $('kws-body').replaceChildren(...body, kwRich(it.text));
    $('kws-group').textContent = it.group || '';
    const prev = kwStack.length > 1 ? kwById(kwStack[kwStack.length - 2]) : null;
    $('kws-back-label').textContent = prev ? `返回「${prev.name}」` : '返回';
    $('kw-sheet').scrollTop = 0;
  }
  function openKeyword(id) {
    if (!kwById(id)) return;
    const wasOpen = kwStack.length > 0;
    kwStack.push(id);
    history.pushState({ kw: kwStack.slice() }, '', location.href);
    drawSheet();
    if (!wasOpen) {
      kwLastFocus = document.activeElement;
      $('kw-sheet-wrap').hidden = false;
      document.body.classList.add('kw-open');
    }
    $('kw-sheet').focus({ preventScroll: true });
  }
  let kwLastFocus = null;
  function closeSheetUI() {
    $('kw-sheet-wrap').hidden = true;
    document.body.classList.remove('kw-open');
    if (kwLastFocus) kwLastFocus.focus({ preventScroll: true });
  }
  // 瀏覽器返回：照紀錄裡的堆疊顯示；回到沒有堆疊的紀錄就關掉
  function kwOnPop(e) {
    const st = e.state && Array.isArray(e.state.kw) ? e.state.kw : null;
    if (st && st.length) {
      kwStack.splice(0, kwStack.length, ...st);
      if ($('kw-sheet-wrap').hidden) { $('kw-sheet-wrap').hidden = false; document.body.classList.add('kw-open'); }
      drawSheet();
      return true;
    }
    if (kwStack.length) { kwStack.length = 0; closeSheetUI(); return true; }
    return false;
  }
  $('kws-back').addEventListener('click', () => history.back());
  $('kw-scrim').addEventListener('click', () => history.go(-kwStack.length));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && kwStack.length) history.back(); });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.kwlink');
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    openKeyword(b.dataset.kw);
  });

  // 關鍵字頁：搜尋＋列表（點了一樣跳出說明）
  function renderKeywords(q) {
    $('kw-q').value = q || '';
    const items = (kwdb && kwdb.items) || [];
    const hits = items.filter((it) => KW.matches(it, q)).map((it, i) => [KW.rank(it, q), i, it])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
    $('kw-count').textContent = items.length ? `共 ${hits.length} 個關鍵字` : '讀取中…';
    const box = $('kw-list');
    box.replaceChildren();
    if (items.length && !hits.length) { box.append(el('div', { class: 'empty' }, el('p', null, '找不到符合的關鍵字。'))); return; }
    const ul = el('ul', { class: 'units kw-units' });
    let lastGroup = null;
    hits.forEach((it) => {
      if (!q && it.group !== lastGroup) { lastGroup = it.group; ul.append(el('li', { class: 'cat-head' }, it.group || '')); }
      const first = String(it.text || '').split('\n')[0].replace(/[[\]]/g, '');
      ul.append(el('li', null, el('button', { type: 'button', class: 'unit-row kw-row', onclick: () => openKeyword(it.id) },
        el('div', { class: 'row-main' },
          el('div', { class: 'row-name' }, it.name, it.en ? el('span', { class: 'kw-en' }, ' ' + it.en) : null),
          el('div', { class: 'row-kw kw-snip' }, first)))));
    });
    box.append(ul);
  }
  $('kw-search').addEventListener('submit', (e) => { e.preventDefault(); $('kw-q').blur(); });
  $('kw-q').addEventListener('input', () => {
    const q = $('kw-q').value;
    history.replaceState(null, '', '#/keywords' + (q.trim() ? '?q=' + encodeURIComponent(q.trim()) : ''));
    renderKeywords(q);
  });

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
    const category = text(data && data.category) || (segs.length > 3 ? segs[3] : '');
    const hay = [
      name, segs.join(' '),
      ...card.profiles.map((p) => `${p.name} ${p.keywords}`),
      ...card.composition,
      ...card.abilities.map((a) => C.parseAbility(a).text),
      ...card.weapons.map((w) => `${w.name} ${w.rules} ${(w.modes || []).map((m) => `${m.name} ${m.rules}`).join(' ')}`),
    ].join(' ').toLowerCase();
    const keywords = [...new Set(card.profiles.map((p) => C.clean(p.keywords)).filter(Boolean))].join('／');
    return { path, segs, data, name, total, hay, keywords, category };
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

  // 類別（HQ、戰線、菁英…）的順序：編輯器存在 categories.json，玩家端照這個順序排
  const CAT_FALLBACK = ['HQ', '戰線', '菁英', '快攻', '重火力', '專用運輸', '飛行器', '領主級', '工事'];
  let catList = store.get('taktik-cats-v1', CAT_FALLBACK);
  async function loadCats() {
    try {
      const r = await fetch('../categories.json', { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j.units)) { catList = j.units; store.set('taktik-cats-v1', catList); } }
    } catch (e) { /* 用上次的或預設 */ }
  }
  const catIndex = (c) => { const i = catList.indexOf(c); return i < 0 ? catList.length + (c ? 0 : 1) : i; };

  async function sync() {
    status = 'loading'; statusMsg = '讀取單位資料…'; render();
    loadCats().then(() => { if (status !== 'loading') render(); });
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
  // #/ 首頁    #/units?p=系列/陣營/子陣營&q=關鍵字&s=排序 單位圖鑑    #/unit/<path> 單位頁
  function parseHash() {
    const h = location.hash.replace(/^#/, '') || '/';
    if (h.startsWith('/unit/')) return { view: 'unit', path: decodeURIComponent(h.slice(6)) };
    if (h.startsWith('/keywords')) return { view: 'keywords', q: new URLSearchParams(h.split('?')[1] || '').get('q') || '' };
    const [route0, query] = h.split('?');
    // 舊網址 #/?p=… 也當成單位圖鑑
    if (route0 === '/units' || (route0 === '/' && query)) {
      const qs = new URLSearchParams(query || '');
      return { view: 'list', p: (qs.get('p') || '').split('/').filter(Boolean), q: qs.get('q') || '', s: qs.get('s') || 'cat' };
    }
    return { view: 'home' };
  }
  function listHash(st) {
    const qs = new URLSearchParams();
    if (st.p && st.p.length) qs.set('p', st.p.join('/'));
    if (st.q) qs.set('q', st.q);
    if (st.s && st.s !== 'cat') qs.set('s', st.s);
    const s = qs.toString();
    return '#/units' + (s ? '?' + s : '');
  }
  let listState = { p: [], q: '', s: 'cat' };
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
    renderNav();
    const st = listState;
    $('sort').value = st.s;
    // 目前顯示的範圍（篩選從左上 ☰ 選單操作；本頁不放搜尋和資料夾篩選）
    const hits = units.filter((u) => matches(u, st));
    const scope = $('scope');
    scope.replaceChildren();
    const parts = [];
    if (st.p.length) parts.push(st.p.join(' › '));
    if (st.q) parts.push(`搜尋「${st.q}」`);
    scope.append(el('span', null, parts.length ? parts.join('　') : '全部單位'));
    if (parts.length) scope.append(' ', el('a', { href: listHash({ p: [], q: '', s: st.s }), class: 'scope-all' }, '顯示全部'));

    // 排序
    const sorted = hits.slice();
    if (st.s === 'pts-desc') sorted.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
    else if (st.s === 'pts-asc') sorted.sort((a, b) => (a.total ?? 1e9) - (b.total ?? 1e9));
    else if (st.s === 'cat') sorted.sort((a, b) => catIndex(a.category) - catIndex(b.category) || a.category.localeCompare(b.category, 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'));
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
        st.q || st.p.length ? el('button', { type: 'button', onclick: () => go(listHash({ p: [], q: '', s: st.s })) }, '顯示全部單位') : null));
      return;
    }
    const ul = el('ul', { class: 'units' });
    let lastCat = null;
    sorted.forEach((u) => {
      // 照類別排時，每個類別前面一個小標題（HQ、戰線、菁英…）
      if (st.s === 'cat' && u.category !== lastCat) { lastCat = u.category; ul.append(el('li', { class: 'cat-head' }, u.category || '未分類')); }
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
    const inner = el('div', { class: 'card-scale' }, CARD.render(u.data, null, { iconBase: '../icons/', total: u.total, keywords: cardKeywords() }));
    frame.append(inner);
    fitCard();
    const saved = u.data.savedAt ? new Date(u.data.savedAt) : null;
    // 玩家端只能看，不放任何編輯入口
    if (saved) $('unit-meta').append(`最後保存：${saved.toLocaleDateString('zh-TW')}`);
  }
  // 資料卡原本 540px 寬；手機上把卡片的寬度和字級變數（--card-w、--s）一起按比例縮小。
  // 不用 CSS zoom：iPhone Safari 的 zoom 只縮框不縮字，字會擠成一團。
  function fitCard() {
    const frame = $('card-frame');
    const avail = frame.clientWidth;
    if (!(avail > 0)) return; // 還沒排版時先用原尺寸
    const w = Math.min(540, Math.floor(avail));
    frame.style.setProperty('--card-w', w + 'px');
    frame.style.setProperty('--s', (1.556 * w / 540).toFixed(4));
  }
  window.addEventListener('resize', fitCard);
  if ('ResizeObserver' in window) new ResizeObserver(fitCard).observe($('card-frame'));

  // ---------- 畫面切換 ----------
  const SCREENS = ['home', 'list', 'unit', 'keywords'];
  function showScreen(name) { SCREENS.forEach((x) => { $('screen-' + x).hidden = x !== name; }); }
  function route() {
    closeDrawer(false);
    const r = parseHash();
    if (r.view === 'unit') {
      if (!$('screen-unit').hidden) { renderUnit(r.path); return; }
      if (!$('screen-list').hidden) listScroll = window.scrollY;
      showScreen('unit');
      renderUnit(r.path);
      document.title = `${$('unit-title').textContent}｜Taktik`;
      window.scrollTo(0, 0);
    } else if (r.view === 'keywords') {
      const wasKw = !$('screen-keywords').hidden;
      showScreen('keywords');
      renderKeywords(r.q);
      document.title = '關鍵字｜Taktik';
      if (!wasKw) window.scrollTo(0, 0);
    } else if (r.view === 'list') {
      const back = $('screen-unit').hidden ? null : listScroll;
      listState = { p: r.p, q: r.q, s: r.s };
      const wasList = !$('screen-list').hidden;
      showScreen('list');
      render();
      document.title = '單位圖鑑｜Taktik';
      if (back != null) window.scrollTo(0, back);
      else if (!wasList) window.scrollTo(0, 0);
    } else {
      showScreen('home');
      renderNav();
      document.title = 'Taktik';
      window.scrollTo(0, 0);
    }
  }
  let listScroll = 0;
  window.addEventListener('popstate', (e) => { if (kwOnPop(e)) return; route(); });
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

  $('sort').addEventListener('change', (e) => go(listHash({ ...listState, s: e.target.value }), true));
  $('btn-refresh').addEventListener('click', sync);

  // ---------- 側邊選單 ----------
  // 之後新增功能（規則、武器圖鑑…）就在 MENU 加一項；children 回傳子項目（可以再有 children，一層層展開）
  const seriesList = () => [...new Set(units.map((u) => u.segs[0]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  // 依 units/ 的資料夾長出選單樹：系列 › 陣營 › 子陣營
  function folderTree(prefix) {
    const depth = prefix.length;
    const next = [...new Set(units.filter((u) => prefix.every((g, i) => u.segs[i] === g) && u.segs.length > depth).map((u) => u.segs[depth]))]
      .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
    return next.map((g) => {
      const path = [...prefix, g];
      const node = { id: 'units/' + path.join('/'), label: g, href: listHash({ p: path }) };
      if (path.length < 3) node.children = () => folderTree(path); // 子陣營是最後一層
      return node;
    });
  }
  const MENU = [
    { id: 'home', label: '首頁', href: '#/' },
    { id: 'units', label: '單位圖鑑', href: '#/units', children: () => folderTree([]) },
    { id: 'keywords', label: '關鍵字', href: '#/keywords' },
  ];
  const openSub = new Set();
  function menuItems(items, level, activeId) {
    return items.map((m) => {
      const kids = m.children ? m.children() : [];
      const open = openSub.has(m.id);
      const li = el('li', { class: `menu-item lv${level}` + (m.id === activeId ? ' active' : '') });
      const row = el('div', { class: 'menu-row' },
        el('a', { href: m.href, class: 'menu-link', 'aria-current': m.id === activeId ? 'page' : null }, m.label));
      if (kids.length) {
        const tog = el('button', { type: 'button', class: 'menu-toggle', 'aria-expanded': String(open), 'aria-label': `${open ? '收合' : '展開'}${m.label}`,
          onclick: () => { if (openSub.has(m.id)) openSub.delete(m.id); else openSub.add(m.id); renderNav(); } });
        tog.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        row.append(tog);
      }
      li.append(row);
      if (kids.length && open) li.append(el('ul', { class: 'submenu' }, menuItems(kids, level + 1, activeId)));
      return li;
    });
  }
  function renderNav() {
    const r = parseHash();
    // 目前所在的資料夾也標示出來
    const activeId = r.view === 'home' ? 'home' : r.view === 'keywords' ? 'keywords' : (r.view === 'list' && r.p.length && !r.q ? 'units/' + r.p.join('/') : 'units');
    $('menu').replaceChildren(...menuItems(MENU, 0, activeId));
    renderHome();
  }
  // 首頁下方：各功能入口
  function renderHome() {
    const box = $('home-sections');
    if (!box) return;
    const n = units.length;
    box.replaceChildren(el('a', { class: 'home-card', href: '#/units' },
      el('div', { class: 'hc-title' }, '單位圖鑑'),
      el('div', { class: 'hc-desc' }, status === 'loading' && !n ? '讀取中…' : `${n} 個單位・${seriesList().length} 個系列`),
      el('div', { class: 'hc-go', 'aria-hidden': 'true' }, '›')),
    el('a', { class: 'home-card', href: '#/keywords' },
      el('div', { class: 'hc-title' }, '關鍵字'),
      el('div', { class: 'hc-desc' }, kwdb && kwdb.items ? `${kwdb.items.length} 個關鍵字・可搜尋` : '讀取中…'),
      el('div', { class: 'hc-go', 'aria-hidden': 'true' }, '›')));
  }

  let lastFocus = null;
  function openDrawer() {
    renderNav();
    lastFocus = document.activeElement;
    ['scrim', 'btn-close', 'drawer'].forEach((id) => { $(id).hidden = false; });
    // 先讓瀏覽器排版一次再加 class，滑入動畫才會出現；不用 requestAnimationFrame，免得在它執行前就關掉時又被打開
    void $('drawer').offsetWidth;
    document.body.classList.add('drawer-open');
    $('btn-menu').setAttribute('aria-expanded', 'true');
    // 焦點放在選單本身（不要直接進搜尋框，免得手機一打開選單就跳出鍵盤）
    setTimeout(() => $('drawer').focus({ preventScroll: true }), 50);
  }
  function closeDrawer(restoreFocus = true) {
    if ($('drawer').hidden) return;
    document.body.classList.remove('drawer-open');
    $('btn-menu').setAttribute('aria-expanded', 'false');
    setTimeout(() => { if (!document.body.classList.contains('drawer-open')) ['scrim', 'btn-close', 'drawer'].forEach((id) => { $(id).hidden = true; }); }, 260);
    if (restoreFocus && lastFocus) lastFocus.focus({ preventScroll: true });
  }
  $('btn-menu').addEventListener('click', openDrawer);
  $('btn-close').addEventListener('click', () => closeDrawer());
  $('scrim').addEventListener('click', () => closeDrawer());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  $('drawer').addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(false); });
  // 選單裡的搜尋：關鍵字 → 單位圖鑑（搜尋全部單位）
  $('drawer-search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('ds-q').value.trim();
    closeDrawer(false);
    go(listHash({ p: [], q, s: listState.s }));
  });

  // ---------- 加到主畫面（離線也能開） ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }

  // ---------- 開始 ----------
  useBundle(store.get(BUNDLE_KEY, null));
  if (!location.hash) history.replaceState(null, '', '#/');
  renderNav();
  route();
  sync().then(() => { if (parseHash().view === 'unit') route(); });
  loadKeywords().then(() => { renderHome(); const v = parseHash().view; if (v === 'unit' || v === 'keywords') route(); });

  window.__player = { get units() { return units; }, sync, route };
})();
