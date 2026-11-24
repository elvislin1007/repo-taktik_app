(function () {
  'use strict';
  const C = window.TaktikCalc;
  const R = window.TaktikRepo;
  // 發布時 GitHub Actions 會把下面換成這次發布的版本號，並產生 version.json。
  // 保存前比對：這個頁面如果是舊版（開著沒重新整理），就不讓它保存，免得用舊程式存錯地方。
  const BUILD = '__BUILD__';
  async function pageIsCurrent() {
    if (BUILD === '__' + 'BUILD__') return true; // 自己電腦上測試時沒有版本號
    try {
      const r = await fetch('version.json', { cache: 'no-store' });
      if (!r.ok) return true;
      return (await r.json()).build === BUILD;
    } catch (e) { return true; } // 沒網路時交給後面的保存去報錯
  }
  const STALE_MSG = '網頁已經更新，這個頁面是舊版，先不要保存。請按 Ctrl+F5 重新整理；你填的內容已存成草稿，重新整理後按上方「繼續上次草稿」就會回來。';
  const STAT_KEYS = ['M', 'STR', 'FS', 'BS', 'CON', 'AGI', 'PER', 'INT', 'WP', 'DEF', 'HP', 'WT'];
  const WTYPES = {
    ranged: { label: '射擊', icon: 'icons/ranged.png' },
    melee: { label: '近戰', icon: 'icons/melee.png' },
    shield: { label: '盾牌', icon: 'icons/shield.png' },
    grenade: { label: '手榴彈', icon: 'icons/grenade.png' },
    multi: { label: '近戰＋射擊', icon: 'icons/multi.png' },
  };
  const isShootType = (t) => !t || t === 'ranged' || t === 'grenade';
  // 複合武器＝有「功能列」的武器（圖示照樣自己選）；名稱一列＋每個功能一列
  const isComposite = (w) => Array.isArray(w.modes) && w.modes.length > 0;
  const DRAFT_KEY = 'taktik-draft-v1';

  const blankWeapon = (type) => (isShootType(type)
    ? { type: type || 'ranged', name: '', rules: '', RNG: '', STR: '', D: '', AS: '', RL: '-' }
    : { type, name: '', rules: '', RNG: 'CC1', STR: '', D: '', AS: '+0', RL: '-' });
  const SERIES_KEY = 'taktik-last-series';
  function lastSeries() { try { return localStorage.getItem(SERIES_KEY) || ''; } catch (e) { return ''; } }
  function rememberSeries(s) { try { if (s) localStorage.setItem(SERIES_KEY, s); } catch (e) { /* 略過 */ } }
  const blankStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, '']));
  const blankProfile = () => ({ name: '', keywords: '', stats: blankStats() });
  const blankCard = () => ({
    series: lastSeries(), faction: '', subfaction: '', category: '', name: '',
    profiles: [blankProfile()],
    composition: [''], abilities: [{ text: '' }],
    weapons: [blankWeapon('ranged')], options: [],
    savedPath: null,
  });

  // 舊格式（單一 keywords／stats）轉成 profiles
  function normalize(c) {
    const card = Object.assign(blankCard(), c);
    if (!Array.isArray(c.profiles) || !c.profiles.length) {
      card.profiles = [{ name: '', keywords: c.keywords || '', stats: Object.assign(blankStats(), c.stats || {}) }];
    } else card.profiles = c.profiles.map((p) => ({ name: p.name || '', keywords: p.keywords || '', stats: Object.assign(blankStats(), p.stats || {}) }));
    delete card.keywords; delete card.stats;
    // 舊存檔的能力分數放在另一欄 → 改成寫在能力文字最後面
    card.abilities = (card.abilities || []).map((a) => {
      const t = String(a.text || '');
      const sc = String(a.score == null ? '' : a.score).trim();
      const hasNum = !isNaN(C.parseAbility({ text: t }).score);
      return { text: sc && !hasNum ? `${t} ${sc}` : t };
    });
    if (!card.abilities.length) card.abilities = [{ text: '' }];
    return card;
  }

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

    // 模型：只有一種時 = 關鍵字列＋能力值；能力值不同的模型分開列（範本：歐克老大／歐克小子）
    const multi = card.profiles.length > 1;
    card.profiles.forEach((p, i) => {
      if (!multi) {
        root.append(edit
          ? editable(p.keywords, (v) => { p.keywords = v; }, { tag: 'div', class: 'kw', ph: '關鍵字：陣營、子陣營、類型、特規，用「、」分隔（例：人類帝國(40K)、阿斯塔特、步兵、生物、免傷(5+)）' })
          : el('div', { class: 'kw' }, stripBrackets(p.keywords)));
      } else {
        const row = el('div', { class: 'prof-name row-ctrl-anchor' });
        if (edit) {
          row.append(editable(p.name, (v) => { p.name = v; }, { class: 'pname', ph: '模型名稱 English' }), ' ',
            editable(p.keywords, (v) => { p.keywords = v; }, { class: 'kwtag', ph: '這種模型的關鍵字，用「、」分隔' }),
            el('span', { class: 'ctrl' }, el('button', { type: 'button', title: '刪除這種模型', 'aria-label': '刪除這種模型', onclick: () => { card.profiles.splice(i, 1); rerender(); } }, '×')));
        } else row.append(el('span', { class: 'pname' }, text(p.name)), ' ', el('span', { class: 'kwtag' }, stripBrackets(p.keywords)));
        root.append(row);
      }
      const shieldOn = /能量護盾/.test(p.keywords || '');
      root.append(el('table', { class: 'stats' },
        el('tr', { class: 'h' }, STAT_KEYS.map((k) => el('td', null, k))),
        el('tr', { class: 'v' }, STAT_KEYS.map((k) => el('td', null,
          edit ? editable(p.stats[k], (v) => { p.stats[k] = v; }, { tag: 'div', ph: '–' }) : statView(p.stats[k], k, shieldOn))))));
    });
    if (edit) root.append(el('div', { class: 'add-row add-in' }, el('button', { type: 'button', title: '同一個單位裡能力值不同的模型（例：小子隊裡的老大）分開列', onclick: () => {
      const last = card.profiles[card.profiles.length - 1];
      card.profiles.push({ name: '', keywords: last.keywords, stats: Object.assign({}, last.stats) });
      rerender(); focusLast('.pname');
    } }, '＋ 新增模型（能力值不同）')));

    // 單位構成
    root.append(el('div', { class: 'gray' }, 'UNIT COMPOSITION'));
    root.append(bulletList(card.composition, edit, 'comp', multi ? '每種模型一行：例 1個歐克老大[領導(Lv1)]配備：…／9個歐克小子配備：…' : '例：1個劍衛老兵士官[領導(Lv1)]配備：重爆彈手槍、精工動力劍', multi ? card.profiles.map((p) => text(p.name).split(' ')[0]).filter(Boolean) : []));

    // 能力
    root.append(el('div', { class: 'gray' }, 'ABILITIES'));
    root.append(abilityList(card, edit));

    // 武器
    root.append(weaponTable(card, edit, result));

    // 選項
    if (card.options.length || edit) {
      if (card.options.length) {
        root.append(el('div', { class: 'gray' }, 'OPTIONS'));
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

  function bulletList(arr, edit, key, ph, boldNames) {
    const ul = el('ul', { class: 'bul' });
    if (!edit) { arr.filter((x) => text(x)).forEach((x) => ul.append(el('li', null, blueTags(x, boldNames)))); return ul; }
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
      // 輸出時隱藏能力後面寫的分數
      arr.filter((a) => text(C.parseAbility(a).text)).forEach((a) => ul.append(el('li', null, abilityView(C.parseAbility(a).text))));
      return ul;
    }
    arr.forEach((a, i) => {
      const li = el('li', { class: 'row-ctrl-anchor' });
      li.append(editable(a.text, (v) => { a.text = v; }, {
        tag: 'div', class: 'ed-abil', ph: i === 0 ? '例：爆彈訓練、戰鬥教條（陣營共用，不寫分數）／虎威 Tiger Fear：說明… 20（最後的數字是分數，輸出時隱藏）' : '',
        onEnter: () => { arr.splice(i + 1, 0, { text: '' }); rerender(); focusAt('.ed-abil', i + 1); },
        onEmptyBackspace: () => { if (arr.length > 1) { arr.splice(i, 1); rerender(); focusAt('.ed-abil', Math.max(0, i - 1)); } },
      }));
      li.append(el('span', { class: 'ctrl' },
        el('button', { type: 'button', title: '刪除這一行', 'aria-label': '刪除這一行', onclick: () => { arr.splice(i, 1); if (!arr.length) arr.push({ text: '' }); rerender(); } }, '×')));
      ul.append(li);
    });
    ul.append(el('li', { style: 'list-style:none' }, el('div', { class: 'add-row' },
      el('button', { type: 'button', onclick: () => { arr.push({ text: '' }); rerender(); focusLast('.ed-abil'); } }, '＋ 新增能力'))));
    return ul;
  }
  // 單位構成：[ ] 裡的特規（如 領導(Lv1)、砲塔）照範本用 7.5pt 藍字，括號拿掉
  function blueTags(s, boldNames) {
    const span = el('span');
    const names = (boldNames || []).filter(Boolean).sort((a, b) => b.length - a.length);
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = names.length ? new RegExp('(' + names.map(esc).join('|') + ')') : null;
    String(s).split(/(\[[^\]]*\])/).forEach((part) => {
      if (/^\[.*\]$/.test(part)) span.append(el('span', { class: 'kwtag' }, part.slice(1, -1)));
      else if (part && nameRe) part.split(nameRe).forEach((q) => { if (q) span.append(names.includes(q) ? el('b', null, q) : q); });
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
      tbl.append(...weaponRows(w, {
        rerender,
        onSaveLib: () => saveWeaponToLib(w),
        onDelete: () => { card.weapons.splice(i, 1); rerender(); },
      }));
    });
    wrap.append(tbl);
    if (edit) {
      wrap.append(el('div', { class: 'add-row' },
        el('button', { type: 'button', onclick: () => { card.weapons.push(blankWeapon('ranged')); rerender(); focusLast('.ed-wname'); } }, '＋ 新增武器'),
        el('button', { type: 'button', onclick: openWeaponLib }, '＋ 從武器庫加入'),
        el('span', { id: 'wlib-msg', class: 'wlib-msg', role: 'status' }),
        card.options.length ? null : el('button', { type: 'button', onclick: () => { card.options.push({ text: '', pts: '', sub: false }); rerender(); focusLast('.ed-opt'); } }, '＋ 新增選項（升級／替換）'),
        card.options.length ? el('button', { type: 'button', onclick: () => { card.options.push({ text: '', pts: '', sub: false }); rerender(); focusLast('.ed-opt'); } }, '＋ 新增選項') : null));
    }
    return wrap;
  }

  // 一把武器的編輯列：一般武器 1 列；複合武器＝名稱 1 列＋每個模式 1 列（▶）
  // opts：{ rerender, onSaveLib, onDelete }（武器庫頁不需要後兩個）
  const blankMode = () => ({ icon: 'mode', name: '', rules: '', RNG: '', STR: '', D: '', AS: '', RL: '-' });
  // 功能列的圖示：▶（看 RNG 判斷射擊／近戰）或直接選射擊、近戰、手榴彈（計分照圖示）
  const MODE_ICONS = { mode: { label: '▶ 箭頭（看 RNG）', icon: 'icons/mode.png' }, ranged: WTYPES.ranged, melee: WTYPES.melee, grenade: WTYPES.grenade };
  function modeIconPicker(m, onPick) {
    const box = el('span', { class: 'icon-pick' });
    const key = MODE_ICONS[m.icon] ? m.icon : 'mode';
    const cur = MODE_ICONS[key];
    const btn = el('button', { type: 'button', title: '選擇這個功能的圖示', 'aria-haspopup': 'listbox', 'aria-label': `功能圖示：${cur.label}` },
      el('img', { class: 'icon' + (key === 'mode' ? ' mode-icon' : ''), src: cur.icon, alt: cur.label }));
    let menu = null;
    const close = () => { if (menu) { menu.remove(); menu = null; document.removeEventListener('mousedown', outside); } };
    const outside = (e) => { if (!box.contains(e.target)) close(); };
    btn.addEventListener('click', () => {
      if (menu) return close();
      menu = el('div', { class: 'icon-menu', role: 'listbox' }, Object.entries(MODE_ICONS).map(([k, t]) =>
        el('button', { type: 'button', role: 'option', 'aria-selected': String(k === key), onclick: () => { close(); if (k !== key) { m.icon = k; saveDraft(); onPick(); } } },
          el('img', { class: 'icon', src: t.icon, alt: '' }), t.label)));
      box.append(menu);
      document.addEventListener('mousedown', outside);
    });
    box.append(btn);
    return box;
  }
  function weaponRows(w, opts) {
    const type = WTYPES[w.type] ? w.type : 'ranged';
    const ctrl = (extra) => {
      const btns = [...(extra || [])];
      if (opts.onSaveLib) btns.push(el('button', { type: 'button', title: '把這把武器存進共用武器庫（依卡片的系列、陣營、子陣營分類）', onclick: opts.onSaveLib }, '存入武器庫'));
      if (opts.onDelete) btns.push(el('button', { type: 'button', title: '刪除這把武器', 'aria-label': '刪除這把武器', onclick: opts.onDelete }, '×'));
      return btns.length ? el('span', { class: 'ctrl' }, btns) : null;
    };
    const numCell = (obj, k, ph, after) => {
      const td = el('td', { class: 'n' }, editable(obj[k], (v) => { obj[k] = v; }, { tag: 'div', ph }));
      if (after) td.append(after);
      return td;
    };
    if (isComposite(w)) {
      const nameRow = el('tr', { class: 'multi-head' },
        el('td', { class: 'row-ctrl-anchor' }, iconPicker(w, opts.rerender), ' ',
          editable(w.name, (v) => { w.name = v; }, { class: 'wname ed-wname', ph: '複合武器名稱 English（例：極限雙拳 Gauntlets of Ultramar）' })),
        el('td', { class: 'n' }), el('td', { class: 'n' }), el('td', { class: 'n' }), el('td', { class: 'n' }),
        el('td', { class: 'n' }, ctrl([el('button', { type: 'button', title: '多加一種模式（多一列）', onclick: () => { w.modes.push(blankMode()); opts.rerender(); } }, '＋模式')])));
      const rows = w.modes.map((m, mi) => {
        const melee = C.modeType(m) === 'melee';
        const del = w.modes.length > 1
          ? el('span', { class: 'ctrl' }, el('button', { type: 'button', title: '刪除這個模式', 'aria-label': '刪除這個模式', onclick: () => { w.modes.splice(mi, 1); opts.rerender(); } }, '×'))
          : null;
        return el('tr', { class: 'mode' },
          el('td', null, modeIconPicker(m, opts.rerender), ' ',
            editable(m.name, (v) => { m.name = v; }, { class: 'wname', ph: '模式名稱（例：射擊 Range）' }), ' ',
            editable(m.rules, (v) => { m.rules = v; }, { class: 'wrules', ph: '特規' })),
          numCell(m, 'RNG', '24／CC1'), numCell(m, 'STR', melee ? '+6' : '6'), numCell(m, 'D', '1'),
          numCell(m, 'AS', melee ? '+0' : '2'), numCell(m, 'RL', '-', del));
      });
      return [nameRow, ...rows];
    }
    const melee = type === 'multi' ? C.modeType(w) === 'melee' : !isShootType(type);
    const nameCell = el('td', { class: 'row-ctrl-anchor' }, iconPicker(w, opts.rerender), ' ',
      editable(w.name, (v) => { w.name = v; }, { class: 'wname ed-wname', ph: '武器名稱 English' }), ' ',
      editable(w.rules, (v) => { w.rules = v; }, { class: 'wrules', ph: '武器特規（例：能量彈、突擊）' }));
    return [el('tr', null, nameCell,
      numCell(w, 'RNG', melee ? 'CC1' : '24'), numCell(w, 'STR', melee ? '+6' : '6'), numCell(w, 'D', '1'),
      numCell(w, 'AS', melee ? '+0' : '2'), numCell(w, 'RL', '-', ctrl()))];
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
        el('button', { type: 'button', role: 'option', 'aria-selected': String(k === w.type), onclick: () => { close(); if (switchType(w, k)) onPick(); } },
          el('img', { class: 'icon', src: t.icon, alt: '' }), t.label)),
        el('div', { class: 'icon-menu-sep', role: 'separator' }),
        el('button', { type: 'button', class: 'icon-menu-extra', onclick: () => { close(); if (setModeCount(w)) onPick(); } },
          isComposite(w) ? `複合武器：改功能數（目前 ${w.modes.length}）…` : '複合武器：設定幾種功能…'),
        isComposite(w) ? el('button', { type: 'button', class: 'icon-menu-extra', onclick: () => { close(); if (makeSingle(w)) onPick(); } }, '改回單一武器') : null);
      box.append(menu);
      document.addEventListener('mousedown', outside);
    });
    box.append(btn);
    return box;
  }
  // 複合武器：問有幾種功能，照數字生成（名稱一列＋每個功能一列；2 種功能＝共 3 列）。已經是複合武器就是改列數
  function setModeCount(w) {
    const cur = isComposite(w) ? w.modes.length : 2;
    const ans = prompt('這把武器有幾種功能（攻擊模式）？\n（例：卡爾加的極限雙拳＝射擊＋近戰，填 2；畫面上會是名稱一列＋2 列功能，共 3 列）', String(cur));
    if (ans == null) return false;
    const n = parseInt(String(ans).trim(), 10);
    if (!(n >= 1 && n <= 8)) { alert('請填 1 到 8 的數字'); return false; }
    if (!isComposite(w)) {
      w.modes = Array.from({ length: n }, blankMode);
      ['rules', 'RNG', 'STR', 'D', 'AS'].forEach((k) => { w[k] = ''; });
      w.RL = '-';
    } else if (n > w.modes.length) {
      while (w.modes.length < n) w.modes.push(blankMode());
    } else if (n < w.modes.length) {
      const drop = w.modes.slice(n);
      const filled = drop.some((m) => text(m.name) || text(m.STR) || text(m.RNG));
      if (filled && !confirm(`會刪掉最後 ${drop.length} 列已經填過的功能，確定嗎？`)) return false;
      w.modes = w.modes.slice(0, n);
    } else return false;
    saveDraft();
    return true;
  }
  function makeSingle(w) {
    const filled = (w.modes || []).some((m) => text(m.name) || text(m.STR) || text(m.RNG));
    if (filled && !confirm('改回單一武器會刪掉所有功能列，確定嗎？')) return false;
    delete w.modes;
    Object.assign(w, blankWeapon(w.type === 'multi' ? 'ranged' : w.type), { name: w.name });
    saveDraft();
    return true;
  }
  function switchType(w, type) {
    if (w.type === type) return false;
    // 複合武器：圖示自己選，只換圖示，功能列不動
    if (isComposite(w)) { w.type = type; saveDraft(); return true; }
    const wasRanged = isShootType(w.type);
    w.type = type;
    if (isShootType(type)) {
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
    return true;
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


  // ---------- 第 4 層分類 ----------
  // 單位：類別（HQ、戰線、菁英…）所有系列共用一份；武器：武器種類（爆彈、電漿…）每個子陣營各自一份。
  // 清單存在 repo 根目錄的 categories.json，順序就是玩家端排列的順序；可新增、改名、刪除、調順序。
  const CAT_PATH = 'categories.json';
  const CAT_DEFAULT = { units: ['HQ', '戰線', '菁英', '快攻', '重火力', '專用運輸', '飛行器', '領主級', '工事'], weapons: {} };
  let cats = null;
  async function loadCats() {
    let c = null;
    try { c = await R.loadUnit(CAT_PATH); } catch (e) { // 讀 repo 不行（例如次數用完）就讀網站上發布的
      try { const r = await fetch(CAT_PATH, { cache: 'no-cache' }); if (r.ok) c = await r.json(); } catch (e2) { /* 用預設 */ }
    }
    c = c || JSON.parse(JSON.stringify(CAT_DEFAULT));
    cats = { units: Array.isArray(c.units) ? c.units : [], weapons: c.weapons && typeof c.weapons === 'object' ? c.weapons : {} };
    return cats;
  }
  const subKey = (s, f, sf) => [s, f, sf].map(text).join('/');
  const unitCats = () => (cats ? cats.units : CAT_DEFAULT.units);
  // 武器種類清單＝categories.json 裡的＋已存武器實際用到的（下面清單有的，上面一定有）
  const weaponCats = (s, f, sf) => {
    const key = subKey(s, f, sf);
    const base = (cats && cats.weapons[key]) || [];
    const used = (libItems || []).filter((x) => x.category && subKey(x.series, x.faction, x.subfaction) === key).map((x) => x.category);
    return [...base, ...[...new Set(used)].filter((c) => !base.includes(c)).sort((a, b) => a.localeCompare(b, 'zh-Hant'))];
  };
  // 依清單順序排（不在清單的排後面，照筆畫）
  const catOrder = (list) => (a, b) => {
    const i = list.indexOf(a), j = list.indexOf(b);
    if (i >= 0 && j >= 0) return i - j;
    if (i >= 0) return -1;
    if (j >= 0) return 1;
    return a.localeCompare(b, 'zh-Hant');
  };
  async function saveCats(message) {
    if (!(await pageIsCurrent())) throw new Error(STALE_MSG);
    await R.saveFile(CAT_PATH, cats, message);
  }
  // 類別下拉：清單＋「新增…」「管理清單…」
  // getList()：目前的清單；setList(list)：寫回 cats；cur：目前選的；onSet(v)：選了之後
  function fillCatSelect(sel, opt) {
    const list = opt.getList();
    const cur = text(opt.cur);
    const items = [el('option', { value: '' }, opt.disabledMsg || '（請選）'), ...list.map((c) => el('option', { value: c }, c))];
    if (cur && !list.includes(cur)) items.push(el('option', { value: cur }, `${cur}（不在清單）`));
    if (!opt.disabledMsg) items.push(el('option', { value: '__add' }, '＋ 新增…'), el('option', { value: '__manage' }, '管理清單（改名、刪除、排序）…'));
    sel.replaceChildren(...items);
    sel.disabled = !!opt.disabledMsg;
    sel.value = cur;
    sel.onchange = async () => {
      const v = sel.value;
      if (v === '__add') {
        sel.value = cur;
        const name = await addCat(opt);
        if (name) { opt.onSet(name); fillCatSelect(sel, Object.assign({}, opt, { cur: name })); }
      } else if (v === '__manage') {
        sel.value = cur;
        openCatDialog(opt, () => fillCatSelect(sel, Object.assign({}, opt, { cur: opt.getCur ? opt.getCur() : cur })));
      } else opt.onSet(v);
    };
  }
  async function addCat(opt, preset) {
    const name = text(preset != null ? preset : prompt(`新增${opt.what}名稱：`, ''));
    if (!name) return null;
    const list = opt.getList().slice();
    if (!list.includes(name)) {
      list.push(name);
      opt.setList(list);
      try { await saveCats(`${opt.what}清單：新增「${name}」（${opt.scope}）`); }
      catch (e) { alert(`清單沒存進 repo：${e.message}\n（這次還是可以先選它）`); }
    }
    return name;
  }
  const cdlg = document.getElementById('dlg-cats');
  function openCatDialog(opt, after) {
    let work = opt.getList().slice();
    const st = document.getElementById('cats-status');
    const draw = () => {
      document.getElementById('cats-title').textContent = `管理${opt.what}清單`;
      document.getElementById('cats-scope').textContent = opt.scope;
      const ul = document.getElementById('cats-list');
      ul.replaceChildren(...work.map((c, i) => el('li', null,
        (() => { const inp = el('input', { value: c, 'aria-label': `${opt.what} ${i + 1}` }); inp.addEventListener('input', () => { work[i] = inp.value; }); return inp; })(),
        el('button', { type: 'button', title: '往上', 'aria-label': '往上', disabled: i === 0, onclick: () => { [work[i - 1], work[i]] = [work[i], work[i - 1]]; draw(); } }, '↑'),
        el('button', { type: 'button', title: '往下', 'aria-label': '往下', disabled: i === work.length - 1, onclick: () => { [work[i + 1], work[i]] = [work[i], work[i + 1]]; draw(); } }, '↓'),
        el('button', { type: 'button', title: '刪除', 'aria-label': `刪除 ${c}`, onclick: () => { work.splice(i, 1); draw(); } }, '×'))));
    };
    document.getElementById('cats-add').onclick = () => { work.push(''); draw(); const ins = document.querySelectorAll('#cats-list input'); ins[ins.length - 1].focus(); };
    document.getElementById('cats-save').onclick = async () => {
      const clean = [...new Set(work.map(text).filter(Boolean))];
      st.textContent = '保存中…'; st.className = 'dlg-status';
      const before = opt.getList().slice();
      opt.setList(clean);
      try {
        await saveCats(`${opt.what}清單更新（${opt.scope}）`);
        work = clean.slice(); draw();
        st.textContent = '已保存。'; st.className = 'dlg-status ok';
        after && after();
      } catch (e) {
        opt.setList(before);
        st.textContent = `保存失敗：${e.message}`; st.className = 'dlg-status err';
        if (e.status === 0 || e.status === 401 || e.status === 403) openSettings();
      }
    };
    st.textContent = ''; st.className = 'dlg-status';
    draw();
    if (!cdlg.open) cdlg.showModal();
  }
  document.getElementById('cats-close').addEventListener('click', () => cdlg.close());
  // 單位卡片上方的「類別」
  const unitCatOpt = () => ({
    what: '類別', scope: '所有系列共用', cur: state.category,
    getCur: () => state.category,
    getList: unitCats, setList: (l) => { cats.units = l; },
    onSet: (v) => { state.category = v; saveDraft(); },
  });
  // 武器的「武器種類」：跟著系列／陣營／子陣營
  function weaponCatOpt(s, f, sf, cur, onSet, getCur) {
    const ok = text(s) && text(f) && text(sf);
    return {
      what: '武器種類', scope: `只用在 ${[s, f, sf].map(text).join(' › ')}`, cur,
      getCur, onSet,
      disabledMsg: ok ? '' : '（先填系列、陣營、子陣營）',
      getList: () => weaponCats(s, f, sf),
      setList: (l) => { cats.weapons[subKey(s, f, sf)] = l; },
    };
  }

  // ---------- 畫面切換 ----------
  const views = ['edit', 'result', 'list', 'weapons'];
  function show(v) { views.forEach((x) => { document.getElementById('view-' + x).hidden = x !== v; }); window.scrollTo(0, 0); }

  function rerender() {
    const host = document.getElementById('card-edit');
    host.replaceChildren(renderCard(state, 'edit'));
    document.getElementById('in-series').value = state.series || '';
    document.getElementById('in-faction').value = state.faction || '';
    document.getElementById('in-subfaction').value = state.subfaction || '';
    fillCatSelect(document.getElementById('in-category'), unitCatOpt());
    saveDraft();
  }

  function confirmScore() {
    const kw = C.splitList(state.profiles[0] && state.profiles[0].keywords);
    if (!text(state.faction) && kw[0]) state.faction = kw[0];
    if (!text(state.subfaction) && kw[1]) state.subfaction = kw[1];
    lastResult = C.scoreUnit(state);
    document.getElementById('card-result').replaceChildren(window.TaktikCard.render(state, lastResult));
    renderBreakdown(lastResult);
    const msg = document.getElementById('save-msg'); msg.textContent = ''; msg.className = 'save-msg';
    show('result');
  }

  async function save() {
    const msg = document.getElementById('save-msg');
    if (!text(state.name)) { msg.textContent = '單位名稱是空的，回上頁填好再保存。'; msg.className = 'save-msg err'; return; }
    // 一定要照分類存：units/<系列>/<陣營>/<子陣營>/<類別>/
    if (!text(state.series) || !text(state.faction) || !text(state.subfaction) || !text(state.category)) {
      msg.textContent = '系列、陣營、子陣營、類別都要填，才能照分類保存。請回上頁填卡片上方的四個欄位。'; msg.className = 'save-msg err'; return;
    }
    if (!(await pageIsCurrent())) { saveDraft(); msg.textContent = STALE_MSG; msg.className = 'save-msg err'; return; }
    const payload = { ...state, result: { total: lastResult.total, steps: lastResult.steps, warnings: lastResult.warnings }, savedAt: new Date().toISOString() };
    delete payload.savedPath;
    const path = R.unitPath(state);
    const btn = document.getElementById('btn-save');
    btn.disabled = true;
    msg.textContent = '保存中…'; msg.className = 'save-msg';
    try {
      const res = await R.saveUnit(path, payload, `${res0(state)}：${text(state.name)} ${lastResult.total}pts`);
      // 改了分類或名稱 → 新路徑存好後把舊檔刪掉（等於搬家；舊檔還留在 git 歷史）
      const oldPath = state.savedPath;
      let moved = '';
      if (oldPath && oldPath !== path) {
        try { if (await R.deleteFile(oldPath, `搬移單位：${oldPath} → ${path}`)) moved = `（舊位置 ${oldPath} 已移除）`; }
        catch (e) { moved = `（舊位置 ${oldPath} 沒刪掉：${e.message}，請手動處理）`; }
      }
      state.savedPath = path;
      rememberSeries(state.series);
      knownKeys = null;
      saveDraft();
      msg.replaceChildren(`已${res.created ? '新增' : '更新'}到 repo：${path}${moved} `,
        res.commitUrl ? el('a', { href: res.commitUrl, target: '_blank', rel: 'noopener' }, '看這次 commit') : '');
      msg.className = 'save-msg ok';
    } catch (e) {
      msg.textContent = `保存失敗：${e.message}`; msg.className = 'save-msg err';
      if (e.status === 0 || e.status === 401 || e.status === 403) openSettings();
    } finally { btn.disabled = false; }
  }
  const res0 = (s) => (s.savedPath ? '更新單位' : '新增單位');

  // 已存單位：可搜尋（名稱、系列、陣營、子陣營），點名稱就打開重新編輯
  let unitFilesCache = [];
  let unitTreeRoot = null;
  function renderUnitTree() {
    const host = document.getElementById('unit-tree-inner');
    if (!host) return;
    const q = document.getElementById('unit-q').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const root = { dirs: {}, units: [] };
    unitFilesCache.forEach((f) => {
      const segs = f.path.replace(/^units\//, '').replace(/\.json$/, '').split('/');
      const hay = segs.join(' ').toLowerCase();
      if (!q.every((t) => hay.includes(t))) return;
      const name = segs.pop();
      let node = root;
      segs.forEach((g) => { node = node.dirs[g] = node.dirs[g] || { dirs: {}, units: [] }; });
      node.units.push({ name, path: f.path });
    });
    const build = (node) => {
      const out = [];
      Object.keys(node.dirs).sort(catOrder(unitCats())).forEach((g) => {
        out.push(el('details', { open: true }, el('summary', null, g), build(node.dirs[g])));
      });
      node.units.sort((x, y) => x.name.localeCompare(y.name, 'zh-Hant')).forEach((u) =>
        out.push(el('div', { class: 'unit-line' },
          el('button', { type: 'button', class: 'unit', onclick: () => loadUnit(u.path) }, u.name),
          el('button', { type: 'button', class: 'mini', onclick: () => loadUnit(u.path) }, '編輯'))));
      return out;
    };
    const kids = build(root);
    host.replaceChildren(...(kids.length ? kids : [el('p', { class: 'empty' }, '找不到符合的單位。')]));
  }
  document.getElementById('unit-q').addEventListener('input', renderUnitTree);

  async function showList() {
    show('list');
    const box = document.getElementById('unit-tree');
    box.replaceChildren(el('p', { class: 'empty' }, '讀取中…'));
    try {
      const files = unitFilesCache = await R.listUnitFiles();
      unitTreeRoot = null;
      box.replaceChildren();
      const { owner, repo, branch } = R.getConfig();
      box.append(el('p', { class: 'empty' }, `來源：github.com/${owner}/${repo}（${branch}）的 units/`));
      if (!files.length) { box.append(el('p', { class: 'empty' }, '還沒有保存的單位。')); return; }
      box.append(el('div', { class: 'tree', id: 'unit-tree-inner' }));
      renderUnitTree();
    } catch (e) {
      box.replaceChildren(el('p', { class: 'empty' }, `讀不到 repo 的單位：${e.message}`));
    }
  }
  async function loadUnit(path) {
    let data;
    try { data = await R.loadUnit(path); } catch (e) { alert(`讀取失敗：${e.message}`); return; }
    delete data.result; delete data.savedAt;
    state = normalize(Object.assign(data, { savedPath: path }));
    rerender(); show('edit');
  }

  // ---------- 草稿（只是本機方便，正式資料以保存為準） ----------
  function saveDraft() { if (!booted) return; try { localStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch (e) { /* 無痕或封鎖時略過 */ } }
  function loadDraft() { try { const s = localStorage.getItem(DRAFT_KEY); return s ? normalize(JSON.parse(s)) : null; } catch (e) { return null; } }

  // ---------- 共用武器庫 ----------
  // weapons/<系列>/<陣營>/<武器名稱>.json；近戰 STR 一律存成 +X，放到單位上會自動顯示成 合計(+X)
  const WEAPON_FIELDS = ['type', 'name', 'rules', 'RNG', 'STR', 'D', 'AS', 'RL'];
  // 複製武器資料（含複合武器的各模式）；forSave=true 時近戰 STR 統一存成 +X
  function copyWeapon(src, forSave) {
    const w = {};
    WEAPON_FIELDS.forEach((k) => { w[k] = src[k] == null ? '' : String(src[k]); });
    if (!WTYPES[w.type]) w.type = 'ranged';
    const plusX = (o, melee) => { if (forSave && melee) { const x = C.meleeX(o.STR); if (!isNaN(x)) o.STR = `+${x}`; } };
    if (isComposite(src)) {
      w.modes = (src.modes || []).map((m) => {
        const o = {};
        ['icon', 'name', 'rules', 'RNG', 'STR', 'D', 'AS', 'RL'].forEach((k) => { o[k] = m[k] == null ? '' : String(m[k]); });
        if (!o.icon) o.icon = 'mode';
        plusX(o, C.modeType(o) === 'melee');
        return o;
      });
    } else plusX(w, !isShootType(w.type));
    return w;
  }
  // 武器庫清單上的數值摘要
  function weaponSummary(w) {
    if (isComposite(w)) return `複合武器・${w.modes.length} 種功能：${(w.modes || []).map((m) => text(m.name) || '（未命名）').join('、')}`;
    return `RNG ${text(w.RNG) || '-'}　STR ${text(w.STR) || '-'}　D ${text(w.D) || '-'}　AS ${text(w.AS) || '-'}　RL ${text(w.RL) || '-'}`;
  }
  const libMsg = (t, cls) => { const m = document.getElementById('wlib-msg'); if (m) { m.textContent = t; m.className = 'wlib-msg ' + (cls || ''); } };
  async function saveWeaponToLib(w) {
    if (!text(w.name)) { libMsg('武器名稱是空的，不能存入武器庫', 'err'); return; }
    if (!text(state.series) || !text(state.faction) || !text(state.subfaction)) { libMsg('要先填卡片上方的「系列」「陣營」「子陣營」，武器才知道存在哪個分類', 'err'); return; }
    if (!(await pageIsCurrent())) { saveDraft(); libMsg(STALE_MSG, 'err'); return; }
    if (!cats) await loadCats();
    const category = await pickWeaponCat(state.series, state.faction, state.subfaction);
    if (!category) return;
    const path = R.weaponPath(state.series, state.faction, state.subfaction, category, w.name);
    if (!confirm(`存入共用武器庫：\n${path}\n\n同名的武器會被覆蓋。`)) return;
    const item = copyWeapon(w, true);
    Object.assign(item, { series: text(state.series), faction: text(state.faction), subfaction: text(state.subfaction), category, savedAt: new Date().toISOString() });
    libMsg('存入中…');
    try {
      const res = await R.saveFile(path, item, `武器庫：${text(w.name)}（${item.series}／${item.faction}／${item.subfaction}）`);
      libItems = null; // 下次開啟重新讀
      knownKeys = null;
      libMsg(`已${res.created ? '存入' : '更新'}武器庫：${item.series} › ${item.faction} › ${item.subfaction} › ${category} › ${text(w.name)}`, 'ok');
    } catch (e) {
      libMsg(`存入失敗：${e.message}`, 'err');
      if (e.status === 0 || e.status === 401 || e.status === 403) openSettings();
    }
  }

  // 存入武器庫時選武器種類（這個子陣營自己的清單）；直接打新名稱會加進清單
  async function pickWeaponCat(s, f, sf) {
    const list = weaponCats(s, f, sf);
    const ans = prompt(`這把武器放在哪個武器種類？（${[s, f, sf].map(text).join(' › ')}）\n`
      + (list.length ? list.map((c, i) => `${i + 1}. ${c}`).join('\n') : '（這個子陣營還沒有武器種類）')
      + '\n\n填編號；或直接打新的種類名稱（會加進這個子陣營的清單）', '');
    const t = text(ans);
    if (!t) return null;
    if (/^\d+$/.test(t)) { const c = list[parseInt(t, 10) - 1]; if (!c) alert('沒有這個編號'); return c || null; }
    return addCat(weaponCatOpt(s, f, sf), t);
  }

  const wdlg = document.getElementById('dlg-weapons');
  let libItems = null; // [{ path, series, faction, subfaction, w }]
  async function loadLib(includeRepo, statusId) {
    const st = document.getElementById(statusId || 'wlib-status');
    st.textContent = '讀取武器庫…'; st.className = 'dlg-status';
    try {
      const raw = await R.loadBundle('weapons', 'weapons.json', includeRepo);
      libItems = raw.filter((x) => x && x.path && x.data).map((x) => {
        const segs = x.path.replace(/^weapons\//, '').replace(/\.json$/, '').split('/');
        segs.pop(); // 檔名
        return { path: x.path, series: x.data.series || segs[0] || '', faction: x.data.faction || segs[1] || '', subfaction: x.data.subfaction || segs[2] || '', category: x.data.category || (segs.length > 3 ? segs[3] : ''), w: x.data };
      });
      st.textContent = libItems.length ? '' : '武器庫是空的。在武器那一列按「存入武器庫」就會加進來。';
    } catch (e) {
      libItems = [];
      st.textContent = `讀不到武器庫：${e.message}`; st.className = 'dlg-status err';
    }
  }
  // 篩選條件：開啟時預設是卡片的系列、陣營，之後由使用者自己選
  let libSeries = '', libFaction = '', libSub = '', libCat = '';
  // 武器排序：同一個子陣營照武器種類清單順序，再照名稱
  const sortWeapons = (a, b) => [a.series, a.faction, a.subfaction].join('/').localeCompare([b.series, b.faction, b.subfaction].join('/'), 'zh-Hant')
    || catOrder(weaponCats(a.series, a.faction, a.subfaction))(a.category, b.category)
    || text(a.w.name).localeCompare(text(b.w.name), 'zh-Hant');
  const catsIn = (xs) => { const l = [...new Set(xs.map((x) => x.category).filter(Boolean))]; const k = xs[0]; return k ? l.sort(catOrder(weaponCats(k.series, k.faction, k.subfaction))) : l; };
  function fillSelect(sel, values, cur) {
    sel.replaceChildren(el('option', { value: '' }, '全部'), ...values.map((v) => el('option', { value: v }, v)));
    sel.value = values.includes(cur) ? cur : '';
    return sel.value;
  }
  function renderLib() {
    const sSel = document.getElementById('wlib-series');
    const fSel = document.getElementById('wlib-faction');
    const q = document.getElementById('wlib-q').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const items = libItems || [];
    const uniq = (a) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'zh-Hant'));
    libSeries = fillSelect(sSel, uniq(items.map((x) => x.series).filter(Boolean)), libSeries);
    const inSeries = items.filter((x) => !libSeries || x.series === libSeries);
    libFaction = fillSelect(fSel, uniq(inSeries.map((x) => x.faction).filter(Boolean)), libFaction);
    const inFaction = inSeries.filter((x) => !libFaction || x.faction === libFaction);
    libSub = fillSelect(document.getElementById('wlib-sub'), uniq(inFaction.map((x) => x.subfaction).filter(Boolean)), libSub);
    const inSub = inFaction.filter((x) => !libSub || x.subfaction === libSub);
    libCat = fillSelect(document.getElementById('wlib-cat'), libSub ? catsIn(inSub) : [], libCat);
    const hits = inSub.filter((x) => !libCat || x.category === libCat)
      .filter((x) => q.every((t) => `${x.w.name} ${x.w.rules}`.toLowerCase().includes(t)))
      .sort(sortWeapons);
    const list = document.getElementById('wlib-list');
    list.replaceChildren();
    if (items.length && !hits.length) list.append(el('li', { class: 'empty' }, '沒有符合的武器'));
    hits.forEach((x) => {
      const t = WTYPES[x.w.type] ? x.w.type : 'ranged';
      list.append(el('li', null,
        el('img', { class: 'icon', src: WTYPES[t].icon, alt: WTYPES[t].label }),
        el('div', { class: 'wl-main' },
          el('div', { class: 'wl-name' }, text(x.w.name), ' ', el('span', { class: 'wl-rules' }, C.clean(x.w.rules))),
          el('div', { class: 'wl-stats' }, weaponSummary(x.w)),
          el('div', { class: 'wl-where' }, [x.series, x.faction, x.subfaction, x.category].filter(Boolean).join(' › '))),
        el('div', { class: 'wl-btns' },
          el('button', { type: 'button', onclick: () => { wdlg.close(); openWeaponEditor(x); } }, '編輯'),
          el('button', { type: 'button', class: 'primary', onclick: () => addFromLib(x) }, '加入'))));
    });
  }
  function addFromLib(x) {
    const w = copyWeapon(x.w, false);
    // 空白的那一列（剛開的新卡片）直接換掉
    const blank = state.weapons.findIndex((v) => !text(v.name) && !text(v.STR) && !text(v.RNG));
    if (blank >= 0) state.weapons.splice(blank, 1, w); else state.weapons.push(w);
    rerender();
    const st = document.getElementById('wlib-status');
    st.textContent = `已加入「${text(w.name)}」，可以繼續選，或按關閉。`; st.className = 'dlg-status ok';
  }
  async function openWeaponLib() {
    if (!wdlg.open) wdlg.showModal();
    libSeries = text(state.series); libFaction = text(state.faction); libSub = ''; libCat = '';
    if (!cats) await loadCats();
    if (!libItems) await loadLib(false);
    renderLib();
  }
  document.getElementById('wlib-series').addEventListener('change', (e) => { libSeries = e.target.value; libFaction = ''; libSub = ''; libCat = ''; renderLib(); });
  document.getElementById('wlib-faction').addEventListener('change', (e) => { libFaction = e.target.value; libSub = ''; libCat = ''; renderLib(); });
  document.getElementById('wlib-sub').addEventListener('change', (e) => { libSub = e.target.value; libCat = ''; renderLib(); });
  document.getElementById('wlib-cat').addEventListener('change', (e) => { libCat = e.target.value; renderLib(); });
  document.getElementById('wlib-q').addEventListener('input', renderLib);
  document.getElementById('wlib-close').addEventListener('click', () => wdlg.close());
  document.getElementById('wlib-reload').addEventListener('click', async () => { await loadLib(true); renderLib(); });

  // ---------- 共用武器庫：編輯頁 ----------
  // 格式和資料卡的武器列一樣；保存到 weapons/<系列>/<陣營>/<武器名稱>.json
  let wstate = null; // { series, faction, subfaction, category, w, editingPath }
  const blankWState = () => ({ series: text(state.series) || lastSeries(), faction: '', subfaction: '', category: '', w: blankWeapon('ranged'), editingPath: null });
  // 系列／陣營／子陣營輸入框的候選名稱（已存武器＋清單裡有的），避免打錯字（例：錘／鎚）就對不上
  function fillWDatalists() {
    const keys = [...(libItems || []).map((x) => [x.series, x.faction, x.subfaction]),
      ...Object.keys((cats && cats.weapons) || {}).map((k) => k.split('/'))].map((a) => a.map(text));
    const put = (id, vals) => { const dl = document.getElementById(id); if (dl) dl.replaceChildren(...[...new Set(vals.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map((v) => el('option', { value: v }))); };
    put('dl-w-series', keys.map((k) => k[0]));
    put('dl-w-faction', keys.filter((k) => !text(wstate.series) || k[0] === text(wstate.series)).map((k) => k[1]));
    put('dl-w-sub', keys.filter((k) => (!text(wstate.series) || k[0] === text(wstate.series)) && (!text(wstate.faction) || k[1] === text(wstate.faction))).map((k) => k[2]));
  }
  function renderWCat() {
    if (!wstate) return;
    fillWDatalists();
    fillCatSelect(document.getElementById('w-cat'), weaponCatOpt(wstate.series, wstate.faction, wstate.subfaction, wstate.category,
      (v) => { wstate.category = v; }, () => wstate.category));
  }
  function renderWeaponEditor() {
    const w = wstate.w;
    document.getElementById('w-series').value = wstate.series || '';
    document.getElementById('w-faction').value = wstate.faction || '';
    document.getElementById('w-sub').value = wstate.subfaction || '';
    renderWCat();
    document.getElementById('w-title').textContent = wstate.editingPath ? `共用武器庫：編輯 ${wstate.editingPath}` : '共用武器庫：新增武器';
    const card = el('div', { class: 'card' }, el('table', { class: 'wg' },
      el('colgroup', null, ['name', 'rng', 'str', 'd', 'as', 'rl'].map((c) => el('col', { class: 'c-' + c }))),
      el('tr', { class: 'h' }, el('td', null, 'WARGEARS'), ['RNG(”)', 'STR', 'D', 'AS', 'RL'].map((h) => el('td', { class: 'n' }, h))),
      ...weaponRows(w, { rerender: renderWeaponEditor })));
    document.getElementById('w-edit').replaceChildren(card);
  }
  function openWeaponEditor(item) {
    if (item) {
      wstate = { series: item.series, faction: item.faction, subfaction: item.subfaction, category: item.category || '', w: copyWeapon(item.w, false), editingPath: item.path };
    } else if (!wstate) wstate = blankWState();
    const msg = document.getElementById('w-msg'); msg.textContent = ''; msg.className = 'save-msg';
    renderWeaponEditor();
    show('weapons');
    if (!cats) loadCats().then(renderWCat);
    if (!libItems) loadLib(false, 'wl-status').then(renderWList); else renderWList();
  }
  async function saveWeaponEditor() {
    const msg = document.getElementById('w-msg');
    const w = wstate.w;
    const fail = (t) => { msg.textContent = t; msg.className = 'save-msg err'; };
    if (!text(w.name)) return fail('武器名稱是空的。');
    if (!text(wstate.series) || !text(wstate.faction) || !text(wstate.subfaction) || !text(wstate.category)) return fail('系列、陣營、子陣營、武器種類都要填。');
    if (!(await pageIsCurrent())) return fail(STALE_MSG.replace('；你填的內容已存成草稿，重新整理後按上方「繼續上次草稿」就會回來', '（武器欄位要重新填）'));
    const path = R.weaponPath(wstate.series, wstate.faction, wstate.subfaction, wstate.category, w.name);
    const item = copyWeapon(w, true);
    Object.assign(item, { series: text(wstate.series), faction: text(wstate.faction), subfaction: text(wstate.subfaction), category: text(wstate.category), savedAt: new Date().toISOString() });
    const btn = document.getElementById('w-save');
    btn.disabled = true; msg.textContent = '保存中…'; msg.className = 'save-msg';
    try {
      const res = await R.saveFile(path, item, `武器庫${wstate.editingPath ? '更新' : '新增'}：${text(w.name)}（${item.series}／${item.faction}／${item.subfaction}）`);
      let moved = '';
      if (wstate.editingPath && wstate.editingPath !== path) {
        try { if (await R.deleteFile(wstate.editingPath, `搬移武器：${wstate.editingPath} → ${path}`)) moved = '（舊位置已移除）'; }
        catch (e) { moved = `（舊位置 ${wstate.editingPath} 沒刪掉：${e.message}）`; }
      }
      wstate.editingPath = path;
      wstate.w = copyWeapon(item, false);
      rememberSeries(item.series);
      knownKeys = null;
      msg.replaceChildren(`已${res.created ? '新增' : '更新'}：${path}${moved} `,
        res.commitUrl ? el('a', { href: res.commitUrl, target: '_blank', rel: 'noopener' }, '看這次 commit') : '');
      msg.className = 'save-msg ok';
      renderWeaponEditor();
      await loadLib(true, 'wl-status'); // 直接讀 repo，剛存的馬上看得到
      renderWList();
    } catch (e) {
      fail(`保存失敗：${e.message}`);
      if (e.status === 0 || e.status === 401 || e.status === 403) openSettings();
    } finally { btn.disabled = false; }
  }
  // 已存的武器：系列／陣營篩選＋搜尋，每把都能「編輯」
  let wlSeries = '', wlFaction = '', wlSub = '', wlCat = '';
  function renderWList() {
    renderWCat(); // 武器庫讀進來後，上面的武器種類也要更新
    const items = libItems || [];
    const uniq = (a) => [...new Set(a)].sort((x, y) => x.localeCompare(y, 'zh-Hant'));
    wlSeries = fillSelect(document.getElementById('wl-series'), uniq(items.map((x) => x.series).filter(Boolean)), wlSeries);
    const inSeries = items.filter((x) => !wlSeries || x.series === wlSeries);
    wlFaction = fillSelect(document.getElementById('wl-faction'), uniq(inSeries.map((x) => x.faction).filter(Boolean)), wlFaction);
    const inFaction = inSeries.filter((x) => !wlFaction || x.faction === wlFaction);
    wlSub = fillSelect(document.getElementById('wl-sub'), uniq(inFaction.map((x) => x.subfaction).filter(Boolean)), wlSub);
    const q = document.getElementById('wl-q').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const inSub = inFaction.filter((x) => !wlSub || x.subfaction === wlSub);
    wlCat = fillSelect(document.getElementById('wl-cat'), wlSub ? catsIn(inSub) : [], wlCat);
    const hits = inSub.filter((x) => !wlCat || x.category === wlCat)
      .filter((x) => q.every((t) => `${x.w.name} ${x.w.rules}`.toLowerCase().includes(t)))
      .sort(sortWeapons);
    const list = document.getElementById('wl-list');
    list.replaceChildren();
    if (items.length && !hits.length) list.append(el('li', { class: 'empty' }, '沒有符合的武器'));
    hits.forEach((x) => {
      const t = WTYPES[x.w.type] ? x.w.type : 'ranged';
      list.append(el('li', { class: wstate && wstate.editingPath === x.path ? 'current' : null },
        el('img', { class: 'icon', src: WTYPES[t].icon, alt: WTYPES[t].label }),
        el('div', { class: 'wl-main' },
          el('div', { class: 'wl-name' }, text(x.w.name), ' ', el('span', { class: 'wl-rules' }, C.clean(x.w.rules))),
          el('div', { class: 'wl-stats' }, weaponSummary(x.w)),
          el('div', { class: 'wl-where' }, [x.series, x.faction, x.subfaction, x.category].filter(Boolean).join(' › '))),
        el('button', { type: 'button', onclick: () => { openWeaponEditor(x); window.scrollTo(0, 0); } }, '編輯')));
    });
  }
  document.getElementById('btn-weapons').addEventListener('click', () => openWeaponEditor(null));
  document.getElementById('w-new').addEventListener('click', () => {
    wstate = blankWState();
    wstate.faction = document.getElementById('w-faction').value;
    wstate.subfaction = document.getElementById('w-sub').value;
    openWeaponEditor(null);
  });
  document.getElementById('w-sub').addEventListener('input', (e) => { wstate.subfaction = e.target.value; renderWCat(); });
  document.getElementById('w-save').addEventListener('click', saveWeaponEditor);
  document.getElementById('w-series').addEventListener('input', (e) => { wstate.series = e.target.value; renderWCat(); });
  document.getElementById('w-faction').addEventListener('input', (e) => { wstate.faction = e.target.value; renderWCat(); });
  document.getElementById('wl-series').addEventListener('change', (e) => { wlSeries = e.target.value; wlFaction = ''; wlSub = ''; wlCat = ''; renderWList(); });
  document.getElementById('wl-faction').addEventListener('change', (e) => { wlFaction = e.target.value; wlSub = ''; wlCat = ''; renderWList(); });
  document.getElementById('wl-sub').addEventListener('change', (e) => { wlSub = e.target.value; wlCat = ''; renderWList(); });
  document.getElementById('wl-cat').addEventListener('change', (e) => { wlCat = e.target.value; renderWList(); });
  document.getElementById('wl-q').addEventListener('input', renderWList);
  document.getElementById('wl-reload').addEventListener('click', async () => { await loadLib(true, 'wl-status'); renderWList(); });


  // ---------- 系列／陣營／子陣營：可以打字，也可以按 ▾ 從已有的選（避免錯字）----------
  let knownKeys = null; // [[系列, 陣營, 子陣營]]：已存單位＋已存武器＋武器種類清單
  async function loadKnownKeys() {
    if (!cats) await loadCats();
    if (!libItems) await loadLib(false);
    let us = [];
    try { us = await R.loadBundle('units', 'units.json', false); } catch (e) { /* 讀不到就只用武器的 */ }
    const fromUnits = (us || []).filter((u) => u && u.path).map((u) => {
      const segs = u.path.replace(/^units\//, '').split('/'); const d = u.data || {};
      return [d.series || segs[0], d.faction || segs[1], d.subfaction || segs[2]];
    });
    knownKeys = [...fromUnits, ...(libItems || []).map((x) => [x.series, x.faction, x.subfaction]),
      ...Object.keys((cats && cats.weapons) || {}).map((k) => k.split('/'))].map((a) => a.map(text));
  }
  function comboValues(level, parents) {
    const vals = (knownKeys || []).filter((k) => parents.every((p, i) => !text(p) || k[i] === text(p))).map((k) => k[level]).filter(Boolean);
    return [...new Set(vals)].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }
  function attachCombo(id, level, getParents) {
    const input = document.getElementById(id);
    const box = el('span', { class: 'combo' });
    input.replaceWith(box);
    const btn = el('button', { type: 'button', class: 'combo-btn', title: '從已有的選', 'aria-label': '從已有的選', 'aria-haspopup': 'listbox' }, '▾');
    box.append(input, btn);
    let menu = null;
    const close = () => { if (menu) { menu.remove(); menu = null; document.removeEventListener('mousedown', outside); } };
    const outside = (e) => { if (!box.contains(e.target)) close(); };
    btn.addEventListener('click', async () => {
      if (menu) return close();
      if (!knownKeys) { btn.disabled = true; try { await loadKnownKeys(); } finally { btn.disabled = false; } }
      const vals = comboValues(level, getParents());
      const cur = text(input.value);
      menu = el('div', { class: 'icon-menu combo-menu', role: 'listbox' },
        vals.length ? vals.map((v) => el('button', { type: 'button', role: 'option', 'aria-selected': String(v === cur),
          onclick: () => { input.value = v; input.dispatchEvent(new Event('input')); close(); input.focus(); } }, v))
          : el('div', { class: 'combo-empty' }, '還沒有已存的，直接輸入'));
      box.append(menu);
      document.addEventListener('mousedown', outside);
    });
  }
  attachCombo('in-series', 0, () => []);
  attachCombo('in-faction', 1, () => [state.series]);
  attachCombo('in-subfaction', 2, () => [state.series, state.faction]);
  attachCombo('w-series', 0, () => []);
  attachCombo('w-faction', 1, () => [wstate && wstate.series]);
  attachCombo('w-sub', 2, () => [wstate && wstate.series, wstate && wstate.faction]);

  // ---------- GitHub 設定 ----------
  const dlg = document.getElementById('dlg-settings');
  const cfgIn = (k) => document.getElementById('cfg-' + k);
  const cfgStatus = (t, cls) => { const s = document.getElementById('cfg-status'); s.textContent = t; s.className = 'dlg-status ' + (cls || ''); };
  function openSettings() {
    const c = R.getConfig();
    cfgIn('token').value = c.token || '';
    cfgStatus(c.token ? '已有權杖（可保存）' : '尚未填權杖：可以讀取、不能保存');
    if (!dlg.open) dlg.showModal();
  }
  const readCfgForm = () => ({ token: cfgIn('token').value.trim() });
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('cfg-test').addEventListener('click', async () => {
    const prev = R.getConfig();
    R.setConfig(readCfgForm());
    cfgStatus('測試中…');
    try {
      const t = await R.test();
      if (t.hasToken && t.canPush) cfgStatus(`連線成功：${t.fullName}，這個權杖可以保存。`, 'ok');
      else if (t.hasToken) cfgStatus(`讀得到 ${t.fullName}，但不能保存：${t.pushError}`, 'err');
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
  document.getElementById('in-series').addEventListener('input', (e) => { state.series = e.target.value; saveDraft(); });
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
  if (draft && (text(draft.name) || draft.profiles.some((p) => text(p.keywords)))) {
    const b = el('button', { type: 'button', onclick: () => { state = draft; b.remove(); rerender(); show('edit'); } }, `繼續上次草稿：${text(draft.name) || '未命名'}`);
    document.querySelector('.topbar nav').prepend(b);
  }
  rerender();
  show('edit');
  booted = true;
  loadCats().then(() => fillCatSelect(document.getElementById('in-category'), unitCatOpt()));

  // 網址 ?load=units/…json 直接打開已存單位；加 &view=result 直接顯示計分結果
  const qs = new URLSearchParams(location.search);
  if (qs.get('load')) {
    loadUnit(qs.get('load')).then(() => { if (qs.get('view') === 'result') confirmScore(); });
  }

  window.__taktik = { get state() { return state; }, set state(v) { state = normalize(v); rerender(); }, confirmScore, get cats() { return cats; }, loadCats, openWeaponEditor, save };
})();
