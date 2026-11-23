// Taktik 單位圖鑑（玩家端）— 搜尋 taktik_rules/units/ 的單位，照資料夾一層層篩選。
(function () {
  'use strict';
  const R = window.TaktikRepo;
  const C = window.TaktikCalc;
  const CARD = window.TaktikCard;
  const CACHE_KEY = 'taktik-units-cache-v1';   // { sha: 單位資料 }，內容由 sha 決定，可以一直留著
  const INDEX_KEY = 'taktik-units-index-v1';   // 上次的檔案清單 [{path, sha}]，離線時先顯示

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
  let units = [];          // [{ path, segs, data, name, total, hay }]
  let status = 'idle';     // idle | loading | ready | error | no-token
  let statusMsg = '';

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

  function fromCache(index) {
    const cache = store.get(CACHE_KEY, {});
    return index.filter((f) => cache[f.sha]).map((f) => toUnit(f.path, cache[f.sha]));
  }

  async function sync() {
    if (!R.getConfig().token) {
      status = 'no-token';
      units = fromCache(store.get(INDEX_KEY, []));
      render();
      return;
    }
    status = 'loading'; statusMsg = '讀取單位清單…'; render();
    try {
      const index = await R.listUnitFiles();
      const cache = store.get(CACHE_KEY, {});
      const need = index.filter((f) => !cache[f.sha]);
      let done = 0;
      // 只下載新增或改過的檔案，同時最多 6 個
      const queue = need.slice();
      async function worker() {
        while (queue.length) {
          const f = queue.shift();
          try { cache[f.sha] = await R.loadBlob(f.sha); } catch (e) { console.warn('讀不到', f.path, e); }
          done += 1; statusMsg = `下載單位 ${done}/${need.length}…`; renderStatus();
        }
      }
      await Promise.all(Array.from({ length: Math.min(6, need.length) }, worker));
      // 清掉已經不在 repo 的舊快取
      const keep = new Set(index.map((f) => f.sha));
      Object.keys(cache).forEach((sha) => { if (!keep.has(sha)) delete cache[sha]; });
      store.set(CACHE_KEY, cache);
      store.set(INDEX_KEY, index);
      units = index.filter((f) => cache[f.sha]).map((f) => toUnit(f.path, cache[f.sha]));
      status = 'ready'; statusMsg = '';
    } catch (e) {
      units = fromCache(store.get(INDEX_KEY, []));
      status = 'error'; statusMsg = e.message;
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
    else count.textContent = `共 ${sorted.length} 個單位`;

    const list = $('list');
    list.replaceChildren();
    if (status === 'no-token' && !units.length) {
      list.append(el('div', { class: 'empty' },
        el('h2', null, '先設定權杖'),
        el('p', null, '單位資料在私人 GitHub repo，要先填權杖才讀得到。'),
        el('button', { type: 'button', class: 'primary', onclick: openSettings }, '開啟設定')));
      return;
    }
    if (status === 'error') list.append(el('div', { class: 'notice' }, `讀取失敗：${statusMsg}${units.length ? '（先顯示上次存在這台裝置的資料）' : ''}`));
    if (status === 'no-token') list.append(el('div', { class: 'notice' }, '沒有權杖，顯示的是上次存在這台裝置的資料。', el('button', { type: 'button', class: 'link', onclick: openSettings }, '設定權杖')));
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

  // ---------- 設定 ----------
  const dlg = $('dlg');
  const cfg = (k) => $('cfg-' + k);
  const setStatus = (t, cls) => { const s = $('cfg-status'); s.textContent = t; s.className = 'status ' + (cls || ''); };
  function openSettings() {
    const c = R.getConfig();
    ['owner', 'repo', 'branch', 'token'].forEach((k) => { cfg(k).value = c[k] || ''; });
    setStatus(c.token ? '已有權杖' : '還沒填權杖');
    dlg.showModal();
  }
  const readForm = () => ({ owner: cfg('owner').value.trim(), repo: cfg('repo').value.trim(), branch: cfg('branch').value.trim() || 'main', token: cfg('token').value.trim() });
  $('btn-settings').addEventListener('click', openSettings);
  $('cfg-test').addEventListener('click', async () => {
    const prev = R.getConfig();
    R.setConfig(readForm());
    setStatus('測試中…');
    try { const t = await R.test(); setStatus(`連線成功：${t.fullName}`, 'ok'); }
    catch (e) { setStatus(`失敗：${e.message}`, 'err'); }
    R.setConfig(prev);
  });
  $('dlg-form').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') {
      if (!R.setConfig(readForm())) { e.preventDefault(); setStatus('這個瀏覽器不允許儲存設定（可能是無痕模式）', 'err'); return; }
      setTimeout(sync, 0);
    }
  });

  // ---------- 加到主畫面（離線也能開） ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('service worker', e));
  }

  // ---------- 開始 ----------
  units = fromCache(store.get(INDEX_KEY, []));
  if (!location.hash) history.replaceState(null, '', '#/');
  route();
  sync().then(() => { if (parseHash().view === 'unit') route(); });

  window.__player = { get units() { return units; }, sync, route };
})();
