(function () {
  'use strict';
  const C = window.TaktikCalc;
  const R = window.TaktikRepo;
  const STAT_KEYS = ['M', 'STR', 'FS', 'BS', 'CON', 'AGI', 'PER', 'INT', 'WP', 'DEF', 'HP', 'WT'];
  const WTYPES = {
    ranged: { label: '射擊', icon: 'icons/ranged.png' },
    melee: { label: '近戰', icon: 'icons/melee.png' },
    shield: { label: '盾牌', icon: 'icons/shield.png' },
  };
  const DRAFT_KEY = 'taktik-draft-v1';

  const blankWeapon = (type) => (type === 'ranged' || !type
    ? { type: 'ranged', name: '', rules: '', RNG: '', STR: '', D: '', AS: '', RL: '-' }
    : { type, name: '', rules: '', RNG: 'CC1', STR: '', D: '', AS: '+0', RL: '-' });
  const blankCard = () => ({
    faction: '', subfaction: '', name: '', keywords: '',
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, ''])),
    composition: [''], abilities: [{ text: '', score: '' }],
    weapons: [blankWeapon('ranged')], options: [],
    savedPath: null,
  });

  let state = blankCard();
  let lastResult = null;
  let booted = false; // 開啟時的空白卡不要蓋掉上次的草稿

  // ---------- 小工具 ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  }
  // 可編輯欄位：plaintext，內容超出欄寬自動換行往下長
  function editable(value, onChange, opts = {}) {
    const n = el(opts.tag || 'span', { class: opts.class, 'data-ph': opts.ph || '', spellcheck: 'false' });
    n.contentEditable = 'plaintext-only';
    if (n.contentEditable !== 'plaintext-only') n.contentEditable = 'true';
    n.textContent = value || '';
    n.addEventListener('input', () => { onChange(n.textContent.replace(/ /g, ' ')); saveDraft(); });
    n.addEventListener('paste', (e) => {
      e.preventDefault();
      const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\r?\n/g, opts.multiline ? '\n' : ' ');
      document.execCommand('insertText', false, t);
    });
    if (!opts.multiline) n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (opts.onEnter) opts.onEnter(); }
      if (e.key === 'Backspace' && opts.onEmptyBackspace && n.textContent === '') { e.preventDefault(); opts.onEmptyBackspace(); }
    });
    return n;
  }
  const text = (s) => (s || '').trim();
  const stripBrackets = (s) => C.clean(s);
  function focusLast(sel) { requestAnimationFrame(() => { const all = document.querySelectorAll(sel); const n = all[all.length - 1]; if (n) n.focus(); }); }
  function focusAt(sel, i) { requestAnimationFrame(() => { const n = document.querySelectorAll(sel)[i]; if (n) { n.focus(); placeCaretEnd(n); } }); }
  function placeCaretEnd(n) { const r = document.createRange(); r.selectNodeContents(n); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

  // ---------- 卡片 ----------
  function renderCard(card, mode, result) {
    const edit = mode === 'edit';
    const root = el('div', { class: 'card' });

    // 名稱列（黑底白字）
    const pts = result ? `${result.total}pts` : '—pts';
    root.append(el('table', { class: 'bar-name' }, el('tr', null,
      el('td', null, edit ? editable(card.name, (v) => { card.name = v; }, { tag: 'div', ph: '單位名稱 English Name' }) : card.name),
      el('td', { class: 'pts' }, pts))));

    // 關鍵字列（藍字）
    root.append(edit
      ? editable(card.keywords, (v) => { card.keywords = v; }, { tag: 'div', class: 'kw', ph: '關鍵字：陣營、子陣營、類型、特規，用「、」分隔（例：人類帝國(40K)、阿斯塔特、步兵、生物、免傷(5+)）' })
      : el('div', { class: 'kw' }, stripBrackets(card.keywords)));

    // 能力值
    const shieldOn = /能量護盾/.test(card.keywords || '');
    root.append(el('table', { class: 'stats' },
      el('tr', { class: 'h' }, STAT_KEYS.map((k) => el('td', null, k))),
      el('tr', { class: 'v' }, STAT_KEYS.map((k) => el('td', null,
        edit ? editable(card.stats[k], (v) => { card.stats[k] = v; }, { tag: 'div', ph: '–' }) : statView(card.stats[k], k, shieldOn))))));

    // 單位構成
    root.append(el('div', { class: 'gray' }, 'UNIT COMPOSITION'));
    root.append(bulletList(card.composition, edit, 'comp', '例：1個劍衛老兵士官[領導(Lv1)]配備：重爆彈手槍、精工動力劍'));

    // 能力
    root.append(el('div', { class: 'gray' }, 'ABILITIES'));
    root.append(abilityList(card, edit));

    // 武器
    root.append(weaponTable(card, edit, result));

    // 選項
    if (card.options.length || edit) {
      if (card.options.length) {
        root.append(el('div', { class: 'gray' }, 'ABILITIES'));
        root.append(optionList(card, edit));
      }
    }
    return root;
  }

  function statView(v, k, shieldOn) {
    const s = text(v);
    if ((k === 'DEF' || k === 'HP') && s.includes('/')) {
      const [a, b] = s.split('/');
      return el('span', null, a + '/', el('span', { class: shieldOn ? 'blue' : null }, b));
    }
    return s;
  }

  function bulletList(arr, edit, key, ph) {
    const ul = el('ul', { class: 'bul' });
    if (!edit) { arr.filter((x) => text(x)).forEach((x) => ul.append(el('li', null, blueTags(x)))); return ul; }
    arr.forEach((v, i) => {
      const li = el('li', { class: 'row-ctrl-anchor' });
      const ed = editable(v, (nv) => { arr[i] = nv; }, {
        tag: 'div', class: `ed-${key}`, ph: i === 0 ? ph : '',
        onEnter: () => { arr.splice(i + 1, 0, ''); rerender(); focusAt(`.ed-${key}`, i + 1); },
        onEmptyBackspace: () => { if (arr.length > 1) { arr.splice(i, 1); rerender(); focusAt(`.ed-${key}`, Math.max(0, i - 1)); } },
      });
      li.append(ed, el('span', { class: 'ctrl' },
        el('button', { type: 'button', title: '刪除這一行', 'aria-label': '刪除這一行', onclick: () => { arr.splice(i, 1); if (!arr.length) arr.push(''); rerender(); } }, '×')));
      ul.append(li);
    });
    ul.append(el('li', { style: 'list-style:none' }, el('div', { class: 'add-row' },
      el('button', { type: 'button', onclick: () => { arr.push(''); rerender(); focusLast(`.ed-${key}`); } }, '＋ 新增一行'))));
    return ul;
  }

  function abilityList(card, edit) {
    const ul = el('ul', { class: 'bul' });
    const arr = card.abilities;
    if (!edit) {
      arr.filter((a) => text(a.text)).forEach((a) => ul.append(el('li', null, abilityView(a.text))));
      return ul;
    }
    arr.forEach((a, i) => {
      const li = el('li', { class: 'row-ctrl-anchor' });
      li.append(editable(a.text, (v) => { a.text = v; }, {
        tag: 'div', class: 'ed-abil', ph: i === 0 ? '例：爆彈訓練、戰鬥教條（陣營共用，不填分）／戰爭之儀 Rites of Battle：說明…' : '',
        onEnter: () => { arr.splice(i + 1, 0, { text: '', score: '' }); rerender(); focusAt('.ed-abil', i + 1); },
        onEmptyBackspace: () => { if (arr.length > 1) { arr.splice(i, 1); rerender(); focusAt('.ed-abil', Math.max(0, i - 1)); } },
      }));
      const inp = el('input', { type: 'number', step: '5', placeholder: '分數', 'aria-label': '這條能力的分數', value: a.score });
      inp.addEventListener('input', () => { a.score = inp.value; saveDraft(); });
      li.append(el('span', { class: 'ctrl' }, inp,
        el('button', { type: 'button', title: '刪除這一行', 'aria-label': '刪除這一行', onclick: () => { arr.splice(i, 1); if (!arr.length) arr.push({ text: '', score: '' }); rerender(); } }, '×')));
      ul.append(li);
    });
    ul.append(el('li', { style: 'list-style:none' }, el('div', { class: 'add-row' },
      el('button', { type: 'button', onclick: () => { arr.push({ text: '', score: '' }); rerender(); focusLast('.ed-abil'); } }, '＋ 新增能力'))));
    return ul;
  }
  // 單位構成：[ ] 裡的特規（如 領導(Lv1)、砲塔）照範本用 7.5pt 藍字，括號拿掉
  function blueTags(s) {
    const span = el('span');
    String(s).split(/(\[[^\]]*\])/).forEach((part) => {
      if (/^\[.*\]$/.test(part)) span.append(el('span', { class: 'kwtag' }, part.slice(1, -1)));
      else if (part) span.append(part);
    });
    return span;
  }
  // 「名稱 English：說明」→ 名稱到冒號粗體
  function abilityView(s) {
    s = stripBrackets(s);
    const i = s.indexOf('：');
    if (i < 0) return s;
    return el('span', null, el('b', null, s.slice(0, i + 1)), s.slice(i + 1));
  }

  function optionList(card, edit) {
    const ul = el('ul', { class: 'bul opts' });
    card.options.forEach((o, i) => {
      const li = el('li', { class: (o.sub ? 'sub' : 'main') + ' row-ctrl-anchor' });
      if (edit) {
        li.append(editable(o.text, (v) => { o.text = v; }, { class: 'otext ed-opt', ph: '選項說明' }),
          el('span', { class: 'leader' }),
          editable(o.pts, (v) => { o.pts = v; }, { class: 'opts-pts', ph: '0pts' }),
          el('span', { class: 'ctrl' },
            el('button', { type: 'button', title: o.sub ? '改成主選項' : '改成子選項', onclick: () => { o.sub = !o.sub; rerender(); } }, o.sub ? '主' : '子'),
            el('button', { type: 'button', title: '刪除', 'aria-label': '刪除這個選項', onclick: () => { card.options.splice(i, 1); rerender(); } }, '×')));
      } else {
        li.append(el('span', { class: 'otext' }, stripBrackets(o.text)));
        if (text(o.pts)) li.append(el('span', { class: 'leader' }), el('span', { class: 'opts-pts' }, o.pts));
      }
      ul.append(li);
    });
    return ul;
  }

  function weaponTable(card, edit, result) {
    const wrap = el('div');
    const tbl = el('table', { class: 'wg' },
      el('colgroup', null, ['name', 'rng', 'str', 'd', 'as', 'rl'].map((c) => el('col', { class: 'c-' + c }))),
      el('tr', { class: 'h' }, el('td', null, 'WARGEARS'), ['RNG(”)', 'STR', 'D', 'AS', 'RL'].map((h) => el('td', { class: 'n' }, h))));
    card.weapons.forEach((w, i) => {
      if (!edit && !text(w.name) && !text(w.STR) && !text(w.RNG)) return;
      tbl.append(weaponRow(card, w, i, edit, result));
    });
    wrap.append(tbl);
    if (edit) {
      wrap.append(el('div', { class: 'add-row' },
        el('button', { type: 'button', onclick: () => { card.weapons.push(blankWeapon('ranged')); rerender(); focusLast('.ed-wname'); } }, '＋ 新增武器'),
        card.options.length ? null : el('button', { type: 'button', onclick: () => { card.options.push({ text: '', pts: '', sub: false }); rerender(); focusLast('.ed-opt'); } }, '＋ 新增選項（升級／替換）'),
        card.options.length ? el('button', { type: 'button', onclick: () => { card.options.push({ text: '', pts: '', sub: false }); rerender(); focusLast('.ed-opt'); } }, '＋ 新增選項') : null));
    }
    return wrap;
  }

  function weaponRow(card, w, i, edit, result) {
    const type = WTYPES[w.type] ? w.type : 'ranged';
    const nameCell = el('td', { class: 'row-ctrl-anchor' });
    if (edit) {
      nameCell.append(iconPicker(w, () => rerender()), ' ',
        editable(w.name, (v) => { w.name = v; }, { class: 'wname ed-wname', ph: '武器名稱 English' }), ' ',
        editable(w.rules, (v) => { w.rules = v; }, { class: 'wrules', ph: '武器特規（例：能量彈、突擊）' }));
    } else {
      nameCell.append(el('img', { class: 'icon', src: WTYPES[type].icon, alt: WTYPES[type].label }),
        el('span', { class: 'wname' }, text(w.name)), ' ', el('span', { class: 'wrules' }, stripBrackets(w.rules)));
    }
    const cell = (k, ph) => el('td', { class: 'n' }, edit
      ? editable(w[k], (v) => { w[k] = v; }, { tag: 'div', ph })
      : (k === 'STR' && type !== 'ranged' ? meleeStr(w.STR, result) : text(w[k])));
    const melee = type !== 'ranged';
    const rl = cell('RL', '-');
    if (edit) rl.append(el('span', { class: 'ctrl' }, el('button', { type: 'button', title: '刪除這把武器', 'aria-label': '刪除這把武器', onclick: () => { card.weapons.splice(i, 1); rerender(); } }, '×')));
    return el('tr', null, nameCell,
      cell('RNG', melee ? 'CC1' : '24'), cell('STR', melee ? '+6' : '6'), cell('D', '1'),
      cell('AS', melee ? '+0' : '2'), rl);
  }
  // 近戰 STR 顯示成 合計(+X)
  function meleeStr(s, result) {
    const x = C.num(s);
    const body = result && !isNaN(result.strValue) ? result.strValue : NaN;
    if (isNaN(x) || isNaN(body)) return text(s);
    return `${body + x}(+${x})`;
  }

  // 武器符號下拉清單
  function iconPicker(w, onPick) {
    const box = el('span', { class: 'icon-pick' });
    const cur = WTYPES[w.type] || WTYPES.ranged;
    const btn = el('button', { type: 'button', title: '選擇武器類型', 'aria-haspopup': 'listbox', 'aria-label': `武器類型：${cur.label}` },
      el('img', { class: 'icon', src: cur.icon, alt: cur.label }));
    let menu = null;
    const close = () => { if (menu) { menu.remove(); menu = null; document.removeEventListener('mousedown', outside); } };
    const outside = (e) => { if (!box.contains(e.target)) close(); };
    btn.addEventListener('click', () => {
      if (menu) return close();
      menu = el('div', { class: 'icon-menu', role: 'listbox' }, Object.entries(WTYPES).map(([k, t]) =>
        el('button', { type: 'button', role: 'option', 'aria-selected': String(k === w.type), onclick: () => { switchType(w, k); close(); onPick(); } },
          el('img', { class: 'icon', src: t.icon, alt: '' }), t.label)));
      box.append(menu);
      document.addEventListener('mousedown', outside);
    });
    box.append(btn);
    return box;
  }
  function switchType(w, type) {
    if (w.type === type) return;
    const wasRanged = (w.type || 'ranged') === 'ranged';
    w.type = type;
    if (type === 'ranged') {
      if (/^CC/i.test(w.RNG)) w.RNG = '';
      if (/^\+/.test(w.STR)) w.STR = '';
      if (/^[+\-×x*]/.test(w.AS)) w.AS = '';
    } else if (wasRanged) {
      w.RNG = 'CC1';
      if (w.STR && !/^\+/.test(w.STR)) w.STR = '';
      w.AS = '+0';
      w.RL = '-';
    }
    saveDraft();
  }

  // ---------- 結果 ----------
  function renderBreakdown(res) {
    const box = document.getElementById('breakdown');
    box.replaceChildren();
    box.append(el('h3', null, `算分過程 — 總分 ${res.total}pts`));
    if (res.warnings.length) box.append(el('div', { class: 'warn' }, el('b', null, `要確認的地方（${res.warnings.length}）`), el('ul', null, res.warnings.map((w) => el('li', null, w)))));
    const t = el('table');
    res.steps.forEach((s) => t.append(el('tr', { class: s.label === '總分' ? 'total' : null },
      el('td', null, s.label), el('td', { class: 'c' }, s.calc), el('td', { class: 'v' }, String(s.value)))));
    box.append(t);
    if (res.notes.length) box.append(el('div', { class: 'notes' }, el('ul', null, res.notes.map((n) => el('li', null, n)))));
  }

  // ---------- 畫面切換 ----------
  const views = ['edit', 'result', 'list'];
  function show(v) { views.forEach((x) => { document.getElementById('view-' + x).hidden = x !== v; }); window.scrollTo(0, 0); }

  function rerender() {
    const host = document.getElementById('card-edit');
    host.replaceChildren(renderCard(state, 'edit'));
    document.getElementById('in-faction').value = state.faction || '';
    document.getElementById('in-subfaction').value = state.subfaction || '';
    saveDraft();
  }

  function confirmScore() {
    const kw = C.splitList(state.keywords);
    if (!text(state.faction) && kw[0]) state.faction = kw[0];
    if (!text(state.subfaction) && kw[1]) state.subfaction = kw[1];
    lastResult = C.scoreUnit(state);
    document.getElementById('card-result').replaceChildren(renderCard(state, 'view', lastResult));
    renderBreakdown(lastResult);
    const msg = document.getElementById('save-msg'); msg.textContent = ''; msg.className = 'save-msg';
    show('result');
  }

  async function save() {
    const msg = document.getElementById('save-msg');
    if (!text(state.name)) { msg.textContent = '單位名稱是空的，回上頁填好再保存。'; msg.className = 'save-msg err'; return; }
    const payload = { ...state, result: { total: lastResult.total, steps: lastResult.steps, warnings: lastResult.warnings }, savedAt: new Date().toISOString() };
    delete payload.savedPath;
    const path = R.unitPath(state);
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    msg.textContent = '保存中…'; msg.className = 'save-msg';
    try {
      const res = await R.saveUnit(path, payload, `${res0(state)}：${text(state.name)} ${lastResult.total}pts`);
      state.savedPath = path;
      saveDraft();
      msg.replaceChildren(`已${res.created ? '新增' : '更新'}到 repo：${path} `,
        res.commitUrl ? el('a', { href: res.commitUrl, target: '_blank', rel: 'noopener' }, '看這次 commit') : '');
      msg.className = 'save-msg ok';
    } catch (e) {
      msg.textContent = `保存失敗：${e.message}`; msg.className = 'save-msg err';
      if (e.status === 0 || e.status === 401 || e.status === 403) openSettings();
    } finally { btn.disabled = false; }
  }
  const res0 = (s) => (s.savedPath ? '更新單位' : '新增單位');

  async function showList() {
    show('list');
    const box = document.getElementById('unit-tree');
    box.replaceChildren(el('p', { class: 'empty' }, '讀取中…'));
    try {
      const tree = await R.listUnits();
      box.replaceChildren();
      const { owner, repo, branch } = R.getConfig();
      box.append(el('p', { class: 'empty' }, `來源：github.com/${owner}/${repo}（${branch}）的 units/`));
      const factions = Object.keys(tree);
      if (!factions.length) { box.append(el('p', { class: 'empty' }, '還沒有保存的單位。')); return; }
      const wrap = el('div', { class: 'tree' });
      factions.sort().forEach((f) => {
        const fd = el('details', { open: true }, el('summary', null, f));
        Object.keys(tree[f]).sort().forEach((s) => {
          const sd = el('details', { open: true }, el('summary', null, s));
          tree[f][s].forEach((u) => sd.append(el('button', { type: 'button', class: 'unit', onclick: () => loadUnit(u.path) }, u.name)));
          fd.append(sd);
        });
        wrap.append(fd);
      });
      box.append(wrap);
    } catch (e) {
      box.replaceChildren(el('p', { class: 'empty' }, `讀不到 repo 的單位：${e.message}`));
    }
  }
  async function loadUnit(path) {
    let data;
    try { data = await R.loadUnit(path); } catch (e) { alert(`讀取失敗：${e.message}`); return; }
    delete data.result; delete data.savedAt;
    state = Object.assign(blankCard(), data, { savedPath: path });
    rerender(); show('edit');
  }

  // ---------- 草稿（只是本機方便，正式資料以保存為準） ----------
  function saveDraft() { if (!booted) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* 無痕或封鎖時略過 */ } }
  function loadDraft() { try { const s = localStorage.getItem(DRAFT_KEY); return s ? Object.assign(blankCard(), JSON.parse(s)) : null; } catch (e) { return null; } }

  // ---------- GitHub 設定 ----------
  const dlg = document.getElementById('dlg-settings');
  const cfgIn = (k) => document.getElementById('cfg-' + k);
  const cfgStatus = (t, cls) => { const s = document.getElementById('cfg-status'); s.textContent = t; s.className = 'dlg-status ' + (cls || ''); };
  function openSettings() {
    const c = R.getConfig();
    ['owner', 'repo', 'branch', 'token'].forEach((k) => { cfgIn(k).value = c[k] || ''; });
    cfgStatus(c.token ? '已有權杖' : '尚未填權杖：讀不到也存不了已存單位（資料 repo 是私人的）');
    if (!dlg.open) dlg.showModal();
  }
  const readCfgForm = () => ({ owner: cfgIn('owner').value.trim(), repo: cfgIn('repo').value.trim(), branch: cfgIn('branch').value.trim() || 'main', token: cfgIn('token').value.trim() });
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('cfg-test').addEventListener('click', async () => {
    const prev = R.getConfig();
    R.setConfig(readCfgForm());
    cfgStatus('測試中…');
    try {
      const t = await R.test();
      if (t.hasToken && t.canPush) cfgStatus(`連線成功：${t.fullName}，這個權杖可以保存。`, 'ok');
      else if (t.hasToken) cfgStatus(`讀得到 ${t.fullName}，但這個權杖沒有寫入權限。`, 'err');
      else cfgStatus(`讀得到 ${t.fullName}（沒填權杖，不能保存）。`, 'ok');
    } catch (e) { cfgStatus(`失敗：${e.message}`, 'err'); }
    R.setConfig(prev);
  });
  document.getElementById('cfg-clear').addEventListener('click', () => { cfgIn('token').value = ''; R.setConfig(Object.assign(R.getConfig(), { token: '' })); cfgStatus('已清除這台電腦上的權杖。'); });
  document.getElementById('form-settings').addEventListener('submit', (e) => {
    if (e.submitter && e.submitter.value === 'save') {
      if (!R.setConfig(readCfgForm())) { e.preventDefault(); cfgStatus('這個瀏覽器不允許儲存設定（可能是無痕模式）。', 'err'); }
    }
  });

  // ---------- 綁定 ----------
  document.getElementById('in-faction').addEventListener('input', (e) => { state.faction = e.target.value; saveDraft(); });
  document.getElementById('in-subfaction').addEventListener('input', (e) => { state.subfaction = e.target.value; saveDraft(); });
  document.getElementById('btn-confirm').addEventListener('click', confirmScore);
  document.getElementById('btn-back').addEventListener('click', () => { rerender(); show('edit'); });
  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('btn-list').addEventListener('click', showList);
  document.getElementById('btn-new').addEventListener('click', () => {
    if (!confirm('清空目前的資料卡，開一張新的？（沒保存的內容會不見）')) return;
    state = blankCard(); rerender(); show('edit');
  });

  // 開啟時：一律從空白卡開始（使用者要求）；有上次的草稿就多一個按鈕可以載回來
  const draft = loadDraft();
  state = blankCard();
  if (draft && (text(draft.name) || text(draft.keywords))) {
    const b = el('button', { type: 'button', onclick: () => { state = draft; b.remove(); rerender(); show('edit'); } }, `繼續上次草稿：${text(draft.name) || '未命名'}`);
    document.querySelector('.topbar nav').prepend(b);
  }
  rerender();
  show('edit');
  booted = true;

  // 網址 ?load=units/…json 直接打開已存單位；加 &view=result 直接顯示計分結果
  const qs = new URLSearchParams(location.search);
  if (qs.get('load')) {
    loadUnit(qs.get('load')).then(() => { if (qs.get('view') === 'result') confirmScore(); });
  }

  window.__taktik = { get state() { return state; }, set state(v) { state = Object.assign(blankCard(), v); rerender(); }, confirmScore };
})();
