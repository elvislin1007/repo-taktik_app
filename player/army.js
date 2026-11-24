// 組軍表（玩家端）：軍表存在這台裝置（localStorage），可以有很多份。
// 單位不限系列／陣營；每個單位可以調人數（OPTIONS 的「最多增加N個…每個Xpts」）和勾選選項（分數自動加總）。
// 規則檢查：分數上限、類別數量上下限（預設不限）、同一個「人物(獨特)」只能一個。
// 匯出 PDF：開啟列印畫面（軍表＋每個單位的資料卡），用瀏覽器的「儲存為 PDF」。
(function () {
  'use strict';
  const P = window.__playerAPI;
  const { el, store, CARD } = P;
  const C = window.TaktikCalc;
  const $ = (id) => document.getElementById(id);
  const text = (s) => String(s == null ? '' : s).trim();
  const KEY = 'taktik-armies-v1';

  // ---------- 資料 ----------
  let armies = store.get(KEY, []);
  if (!Array.isArray(armies)) armies = [];
  const save = () => store.set(KEY, armies);
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const findArmy = (id) => armies.find((a) => a.id === id);
  const unitOf = (path) => P.units.find((u) => u.path === path);

  // 選項 → 可以選的項目
  //   models：「此單位可以最多增加5個[X]」＋「每個150pts」→ 加人數（0～5）
  //   qty：「每個50pts」→ 填數量；check：「50pts」「免費」→ 勾選；head：沒有分數的標題列（只顯示）
  function parseOptions(card) {
    let group = -1, single = false; // 「…替換成一個以下選項：」底下的勾選項只能選一個
    return (card.options || []).map((o, i) => {
      if (!o.sub) { group = i; single = /一個以下|一個選項/.test(text(o.text)); }
      const g = { group, single: !!o.sub && single };
      const t = text(o.text), pts = text(o.pts);
      const n = (pts.match(/-?\s*\d+(?:\.\d+)?/) || [])[0];
      const val = pts === '免費' ? 0 : n != null ? parseFloat(n.replace(/\s/g, '')) : null;
      const per = /每個/.test(pts);
      const mm = t.match(/增加\s*(\d+)\s*個/);
      if (mm && val != null) return { i, kind: 'models', text: t, max: parseInt(mm[1], 10), val, sub: !!o.sub, ...g };
      if (val == null) return { i, kind: 'head', text: t, sub: !!o.sub, ...g };
      return { i, kind: per ? 'qty' : 'check', text: t, val, pts, sub: !!o.sub, ...g };
    });
  }
  const optsOf = (u) => parseOptions(CARD.normalize(u.data));
  const fmt = (n) => (Math.round(n * 100) / 100).toString();

  function entryPts(e) {
    const u = unitOf(e.path);
    if (!u || u.total == null) return null;
    let t = u.total;
    optsOf(u).forEach((o) => {
      const v = (e.sel || {})[o.i];
      if (!v) return;
      if (o.kind === 'models' || o.kind === 'qty') t += o.val * v;
      else if (o.kind === 'check') t += o.val;
    });
    return t;
  }
  const armyPts = (a) => a.entries.reduce((s, e) => s + (entryPts(e) || 0), 0);
  const isUnique = (u) => u && CARD.normalize(u.data).profiles.some((p) => /人物\s*[(（]\s*獨特/.test(p.keywords || ''));

  function checks(a) {
    const out = [];
    const total = armyPts(a);
    if (a.cap > 0 && total > a.cap) out.push(`總分 ${fmt(total)} 超過上限 ${a.cap}（多 ${fmt(total - a.cap)}）`);
    const cnt = {};
    a.entries.forEach((e) => { const u = unitOf(e.path); const c = (u && u.category) || '未分類'; cnt[c] = (cnt[c] || 0) + 1; });
    Object.entries(a.limits || {}).forEach(([c, l]) => {
      const n = cnt[c] || 0;
      if (l.min != null && n < l.min) out.push(`${c} 至少 ${l.min} 個（目前 ${n}）`);
      if (l.max != null && n > l.max) out.push(`${c} 最多 ${l.max} 個（目前 ${n}）`);
    });
    const seen = {};
    a.entries.forEach((e) => { const u = unitOf(e.path); if (isUnique(u)) seen[u.name] = (seen[u.name] || 0) + 1; });
    Object.entries(seen).forEach(([n, k]) => { if (k > 1) out.push(`「${n}」是人物(獨特)，只能放 1 個（目前 ${k}）`); });
    a.entries.forEach((e) => { if (!unitOf(e.path)) out.push(`找不到「${e.name}」（資料庫裡可能改名或刪除了）`); });
    return out;
  }
  const touch = (a) => { a.updatedAt = Date.now(); save(); };

  // ---------- 軍表清單 #/armies ----------
  function renderList() {
    const box = $('armies-list');
    box.replaceChildren();
    if (!armies.length) {
      box.append(el('div', { class: 'empty' }, el('h2', null, '還沒有軍表'), el('p', null, '按「＋ 新增軍表」開始組軍。軍表只存在這台裝置。')));
      return;
    }
    const ul = el('ul', { class: 'units' });
    armies.slice().sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0)).forEach((a) => {
      const total = armyPts(a);
      const bad = checks(a).length;
      ul.append(el('li', { class: 'army-li' },
        el('a', { class: 'unit-row', href: '#/army/' + a.id, 'data-army': '1' },
          el('div', { class: 'row-main' },
            el('div', { class: 'row-name' }, a.name || '未命名軍表'),
            el('div', { class: 'row-path' }, `${a.entries.length} 個單位${a.cap ? `・上限 ${a.cap}` : ''}${bad ? `・⚠ ${bad} 個問題` : ''}`)),
          el('div', { class: 'row-pts' + (a.cap && total > a.cap ? ' over' : '') }, el('span', null, fmt(total), el('small', null, 'pts')))),
        el('div', { class: 'army-li-actions' },
          el('button', { type: 'button', onclick: () => { const c = JSON.parse(JSON.stringify(a)); c.id = newId(); c.name = (a.name || '軍表') + '（複製）'; c.updatedAt = Date.now(); armies.push(c); save(); renderList(); } }, '複製'),
          el('button', { type: 'button', class: 'danger', onclick: () => { if (confirm(`刪除軍表「${a.name || '未命名軍表'}」？刪除後不能復原。`)) { armies = armies.filter((x) => x !== a); save(); renderList(); } } }, '刪除'))));
    });
    box.append(ul);
  }
  $('army-new').addEventListener('click', () => {
    const a = { id: newId(), name: `我的軍表 ${armies.length + 1}`, cap: null, limits: {}, entries: [], createdAt: Date.now(), updatedAt: Date.now() };
    armies.push(a); save();
    P.go('#/army/' + a.id);
  });

  // ---------- 單一軍表 #/army/<id> ----------
  let cur = null;
  const open = new Set(); // 展開設定的單位
  function renderArmy(id) {
    cur = findArmy(id);
    const body = $('army-body');
    body.replaceChildren();
    if (!cur) { $('army-name').value = ''; body.append(el('div', { class: 'empty' }, el('p', null, '找不到這份軍表（可能已刪除）。'))); return; }
    $('army-name').value = cur.name || '';
    $('army-cap').value = cur.cap || '';
    renderLimits();
    drawArmy();
  }
  function drawArmy() {
    const a = cur;
    const total = armyPts(a);
    $('army-total').replaceChildren(el('b', { class: a.cap && total > a.cap ? 'over' : '' }, fmt(total)), a.cap ? ` / ${a.cap}` : '', el('small', null, ' pts'));
    const probs = checks(a);
    const warn = $('army-warn');
    warn.replaceChildren(...(probs.length ? [el('ul', null, probs.map((p) => el('li', null, p)))] : []));
    warn.hidden = !probs.length;
    const body = $('army-body');
    body.replaceChildren();
    if (!a.entries.length) { body.append(el('div', { class: 'empty' }, el('p', null, '按「＋ 加入單位」從資料庫挑單位。'))); return; }
    const groups = {};
    a.entries.forEach((e) => { const u = unitOf(e.path); const c = (u && u.category) || '未分類'; (groups[c] = groups[c] || []).push(e); });
    Object.keys(groups).sort((x, y) => P.catIndex(x) - P.catIndex(y)).forEach((c) => {
      body.append(el('h3', { class: 'army-cat' }, `${c}（${groups[c].length}）`));
      groups[c].forEach((e) => body.append(entryView(e)));
    });
  }
  function entryView(e) {
    const u = unitOf(e.path);
    const pts = entryPts(e);
    const isOpen = open.has(e.uid);
    const head = el('div', { class: 'ae-head' },
      el('button', { type: 'button', class: 'ae-toggle', 'aria-expanded': String(isOpen), onclick: () => { if (open.has(e.uid)) open.delete(e.uid); else open.add(e.uid); drawArmy(); } },
        el('span', { class: 'ae-name' }, u ? u.name : e.name), el('span', { class: 'ae-sum' }, summary(e, u))),
      el('span', { class: 'ae-pts' }, pts == null ? '—' : fmt(pts), el('small', null, 'pts')));
    const box = el('div', { class: 'army-entry' + (u ? '' : ' missing') }, head);
    if (isOpen && u) box.append(entryEditor(e, u));
    return box;
  }
  function summary(e, u) {
    if (!u) return '找不到這個單位';
    const bits = [];
    optsOf(u).forEach((o) => {
      const v = (e.sel || {})[o.i];
      if (!v) return;
      if (o.kind === 'models') bits.push(`+${v} 個`);
      else if (o.kind === 'qty') bits.push(`${o.text}×${v}`);
      else if (o.kind === 'check') bits.push(o.text);
    });
    return bits.length ? bits.join('、') : u.segs.slice(0, 3).join(' › ');
  }
  function entryEditor(e, u) {
    e.sel = e.sel || {};
    const opts = optsOf(u);
    const box = el('div', { class: 'ae-edit' });
    const setv = (i, v) => { if (v) e.sel[i] = v; else delete e.sel[i]; touch(cur); drawArmy(); };
    if (!opts.length) box.append(el('p', { class: 'ae-none' }, '這個單位沒有可選的選項。'));
    opts.forEach((o) => {
      const v = e.sel[o.i] || 0;
      const row = el('div', { class: 'ae-opt' + (o.sub ? ' sub' : '') + (o.kind === 'head' ? ' head' : '') });
      if (o.kind === 'head') { row.append(el('span', null, o.text)); box.append(row); return; }
      if (o.kind === 'check') {
        const id = `o-${e.uid}-${o.i}`;
        const pick = (on) => {
          if (on && o.single) opts.forEach((x) => { if (x !== o && x.single && x.group === o.group && x.kind === 'check') delete e.sel[x.i]; });
          setv(o.i, on ? 1 : 0);
        };
        row.append(el('input', { type: 'checkbox', id, class: o.single ? 'one' : null, checked: v ? true : null, onchange: (ev) => pick(ev.target.checked) }),
          el('label', { for: id }, o.text), el('span', { class: 'ae-val' }, o.val ? `${o.val > 0 ? '+' : ''}${fmt(o.val)}` : '免費'));
      } else {
        const max = o.kind === 'models' ? o.max : 99;
        row.append(el('span', { class: 'ae-label' }, o.kind === 'models' ? `${o.text}（每個 ${fmt(o.val)}）` : `${o.text}（每個 ${fmt(o.val)}）`),
          el('span', { class: 'stepper' },
            el('button', { type: 'button', 'aria-label': '減少', disabled: v <= 0 ? true : null, onclick: () => setv(o.i, Math.max(0, v - 1)) }, '−'),
            el('span', { class: 'stepper-n', 'aria-live': 'polite' }, String(v)),
            el('button', { type: 'button', 'aria-label': '增加', disabled: v >= max ? true : null, onclick: () => setv(o.i, Math.min(max, v + 1)) }, '＋')));
      }
      box.append(row);
    });
    box.append(el('div', { class: 'ae-actions' },
      el('a', { href: '#/unit/' + encodeURIComponent(e.path), class: 'unit-link' }, '看資料卡'),
      el('button', { type: 'button', onclick: () => { const c = JSON.parse(JSON.stringify(e)); c.uid = newId(); cur.entries.splice(cur.entries.indexOf(e) + 1, 0, c); touch(cur); drawArmy(); } }, '再加一個'),
      el('button', { type: 'button', class: 'danger', onclick: () => { cur.entries = cur.entries.filter((x) => x !== e); open.delete(e.uid); touch(cur); drawArmy(); } }, '移除')));
    return box;
  }
  $('army-name').addEventListener('input', (ev) => { if (cur) { cur.name = ev.target.value; touch(cur); } });
  $('army-cap').addEventListener('input', (ev) => { if (!cur) return; const n = parseInt(ev.target.value, 10); cur.cap = n > 0 ? n : null; touch(cur); drawArmy(); });

  // 類別數量限制：每個類別 至少／最多，預設「不限」
  function renderLimits() {
    const box = $('army-limits');
    box.replaceChildren();
    const cats = [...new Set([...P.catList, ...P.units.map((u) => u.category).filter(Boolean)])];
    const sel = (c, k) => {
      const v = cur.limits[c] && cur.limits[c][k] != null ? String(cur.limits[c][k]) : '';
      const s = el('select', { 'aria-label': `${c} ${k === 'min' ? '至少' : '最多'}` },
        el('option', { value: '' }, '不限'), ...Array.from({ length: 13 }, (_, n) => el('option', { value: String(n) }, String(n))));
      s.value = v;
      s.addEventListener('change', () => {
        cur.limits[c] = cur.limits[c] || {};
        if (s.value === '') delete cur.limits[c][k]; else cur.limits[c][k] = parseInt(s.value, 10);
        if (!Object.keys(cur.limits[c]).length) delete cur.limits[c];
        touch(cur); drawArmy();
      });
      return s;
    };
    box.append(el('div', { class: 'lim-row lim-head' }, el('span', null, '類別'), el('span', null, '至少'), el('span', null, '最多')),
      ...cats.map((c) => el('div', { class: 'lim-row' }, el('span', null, c), sel(c, 'min'), sel(c, 'max'))));
  }
  $('army-limits-reset').addEventListener('click', () => { if (!cur) return; cur.limits = {}; touch(cur); renderLimits(); drawArmy(); });

  // ---------- 加入單位（從資料庫挑） ----------
  function openPicker() {
    $('pick-wrap').hidden = false;
    document.body.classList.add('kw-open');
    const f = $('pick-scope');
    const scopes = [...new Set(P.units.map((u) => u.segs.slice(0, 3).join(' › ')))].sort((x, y) => x.localeCompare(y, 'zh-Hant'));
    const keep = f.value;
    f.replaceChildren(el('option', { value: '' }, '全部系列／陣營'), ...scopes.map((s) => el('option', { value: s }, s)));
    if (scopes.includes(keep)) f.value = keep;
    drawPicker();
    setTimeout(() => $('pick-q').focus({ preventScroll: true }), 50);
  }
  function closePicker() { $('pick-wrap').hidden = true; document.body.classList.remove('kw-open'); drawArmy(); }
  function drawPicker() {
    const q = $('pick-q').value.toLowerCase().split(/\s+/).filter(Boolean);
    const scope = $('pick-scope').value;
    const hits = P.units.filter((u) => (!scope || u.segs.slice(0, 3).join(' › ') === scope) && q.every((w) => u.hay.includes(w)))
      .sort((x, y) => x.segs.slice(0, 3).join('/').localeCompare(y.segs.slice(0, 3).join('/'), 'zh-Hant') || P.catIndex(x.category) - P.catIndex(y.category) || x.name.localeCompare(y.name, 'zh-Hant'));
    const ul = el('ul', { class: 'pick-list' });
    let lastHead = null;
    hits.forEach((u) => {
      const head = `${u.segs.slice(0, 3).join(' › ')}　${u.category || '未分類'}`;
      if (head !== lastHead) { lastHead = head; ul.append(el('li', { class: 'cat-head' }, head)); }
      const n = cur.entries.filter((e) => e.path === u.path).length;
      ul.append(el('li', null, el('button', { type: 'button', class: 'pick-row', onclick: () => {
        cur.entries.push({ uid: newId(), path: u.path, name: u.name, sel: {} }); touch(cur); drawPicker();
        $('pick-msg').textContent = `已加入：${u.name}`;
      } },
      el('span', { class: 'pick-name' }, u.name, n ? el('span', { class: 'pick-n' }, ` ×${n}`) : null),
      el('span', { class: 'pick-pts' }, u.total != null ? `${u.total}pts` : '—'),
      el('span', { class: 'pick-add', 'aria-hidden': 'true' }, '＋'))));
    });
    $('pick-body').replaceChildren(hits.length ? ul : el('p', { class: 'empty' }, '找不到符合的單位'));
    $('pick-total').textContent = `目前 ${fmt(armyPts(cur))}${cur.cap ? ` / ${cur.cap}` : ''} pts`;
  }
  $('army-add').addEventListener('click', openPicker);
  $('pick-done').addEventListener('click', closePicker);
  $('pick-scrim').addEventListener('click', closePicker);
  $('pick-q').addEventListener('input', drawPicker);
  $('pick-scope').addEventListener('change', drawPicker);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('pick-wrap').hidden) closePicker(); });

  // ---------- 匯出 PDF（列印） ----------
  function buildPrint() {
    const a = cur;
    const root = $('print-root');
    root.replaceChildren();
    const total = armyPts(a);
    root.append(el('h1', { class: 'pr-title' }, a.name || '軍表'),
      el('p', { class: 'pr-sub' }, `總分 ${fmt(total)} pts${a.cap ? ` ／ 上限 ${a.cap}` : ''}・${a.entries.length} 個單位・${new Date().toLocaleDateString('zh-TW')}`));
    const probs = checks(a);
    if (probs.length) root.append(el('ul', { class: 'pr-warn' }, probs.map((p) => el('li', null, '⚠ ' + p))));
    const tbl = el('table', { class: 'pr-table' }, el('thead', null, el('tr', null, el('th', null, '類別'), el('th', null, '單位'), el('th', null, '選擇'), el('th', { class: 'n' }, 'pts'))));
    const tb = el('tbody');
    a.entries.slice().sort((x, y) => P.catIndex((unitOf(x.path) || {}).category) - P.catIndex((unitOf(y.path) || {}).category)).forEach((e) => {
      const u = unitOf(e.path);
      tb.append(el('tr', null, el('td', null, (u && u.category) || ''), el('td', null, u ? u.name : e.name), el('td', null, u ? summary(e, u).replace(u.segs.slice(0, 3).join(' › '), '') : ''), el('td', { class: 'n' }, fmt(entryPts(e) || 0))));
    });
    tb.append(el('tr', { class: 'pr-sum' }, el('td', { colspan: '3' }, '合計'), el('td', { class: 'n' }, fmt(total))));
    tbl.append(tb);
    root.append(tbl);
    // 每個單位的資料卡（同一個單位只印一次）
    const done = new Set();
    a.entries.slice().sort((x, y) => P.catIndex((unitOf(x.path) || {}).category) - P.catIndex((unitOf(y.path) || {}).category)).forEach((e) => {
      if (done.has(e.path)) return; done.add(e.path);
      const u = unitOf(e.path);
      if (!u) return;
      root.append(el('div', { class: 'pr-card' }, CARD.render(u.data, null, { iconBase: '../icons/', total: u.total, showOptionWeapons: true })));
    });
  }
  $('army-pdf').addEventListener('click', () => {
    if (!cur) return;
    buildPrint();
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    const go = () => { try { window.print(); } finally { setTimeout(() => { if (!matchMedia('print').matches) done(); }, 1000); } };
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 200));
  });

  window.TaktikArmy = {
    renderList, renderArmy,
    get armies() { return armies; },
    count: () => armies.length,
    _pts: armyPts, _checks: checks, _opts: optsOf,
  };
})();
