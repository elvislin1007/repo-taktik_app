// 單位資料卡（唯讀顯示）— 編輯器的結果頁和玩家端圖鑑共用，格式照 taktik_rules/11_資料卡格式.md。
// 需要先載入 calc.js（TaktikCalc）。
(function (global) {
  'use strict';
  const C = global.TaktikCalc;
  const STAT_KEYS = ['M', 'STR', 'FS', 'BS', 'CON', 'AGI', 'PER', 'INT', 'WP', 'DEF', 'HP', 'WT'];
  const WTYPES = {
    ranged: { label: '射擊', icon: 'ranged.png' },
    melee: { label: '近戰', icon: 'melee.png' },
    shield: { label: '盾牌', icon: 'shield.png' },
    grenade: { label: '手榴彈', icon: 'grenade.png' },
    multi: { label: '近戰＋射擊', icon: 'multi.png' },
    equipment: { label: '特殊裝備', icon: 'equipment.png' },
  };
  const isShootType = (t) => !t || t === 'ranged' || t === 'grenade';
  const text = (s) => String(s == null ? '' : s).trim();
  const strip = (s) => C.clean(s);

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  }

  const blankStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, '']));
  // 存檔格式整理（舊格式：單一 keywords／stats；能力分數在另一欄）
  function normalize(c) {
    c = c || {};
    const card = {
      series: c.series || '', faction: c.faction || '', subfaction: c.subfaction || '', name: c.name || '',
      composition: Array.isArray(c.composition) ? c.composition : [],
      weapons: Array.isArray(c.weapons) ? c.weapons : [],
      optionWeapons: Array.isArray(c.optionWeapons) ? c.optionWeapons : [],
      options: Array.isArray(c.options) ? c.options : [],
    };
    card.profiles = Array.isArray(c.profiles) && c.profiles.length
      ? c.profiles.map((p) => ({ name: p.name || '', keywords: p.keywords || '', stats: Object.assign(blankStats(), p.stats || {}) }))
      : [{ name: '', keywords: c.keywords || '', stats: Object.assign(blankStats(), c.stats || {}) }];
    card.abilities = (c.abilities || []).map((a) => {
      const t = String((a && a.text) || '');
      const sc = String(a && a.score != null ? a.score : '').trim();
      return { text: sc && isNaN(C.parseAbility({ text: t }).score) ? `${t} ${sc}` : t };
    });
    return card;
  }

  function statView(v, k, shieldOn) {
    const s = text(v);
    if ((k === 'DEF' || k === 'HP') && s.includes('/')) {
      const [a, b] = s.split('/');
      return el('span', null, a + '/', el('span', { class: shieldOn ? 'blue' : null }, b));
    }
    return s;
  }
  // 特規文字（「手槍、速射、爆彈」）：有傳關鍵字查詢（玩家端）時，查得到的變成可點的連結（藍字虛線）
  let KW = null; // render() 時設定：{ lookup(term) → 關鍵字 }
  function kwText(s) {
    s = strip(s);
    if (!KW || !global.TaktikKW) return s;
    const span = el('span');
    global.TaktikKW.split(s).forEach((part) => {
      const it = global.TaktikKW.isSep(part) ? null : KW.lookup(part);
      span.append(it ? el('button', { type: 'button', class: 'kwlink', 'data-kw': it.id, title: `看「${it.name}」的說明` }, part) : part);
    });
    return span;
  }
  // 單位構成：[ ] 裡的特規用 7.5pt 藍字、括號拿掉；多種模型時模型名稱粗體
  function blueTags(s, boldNames) {
    const span = el('span');
    const names = (boldNames || []).filter(Boolean).sort((a, b) => b.length - a.length);
    const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameRe = names.length ? new RegExp('(' + names.map(esc).join('|') + ')') : null;
    String(s).split(/(\[[^\]]*\])/).forEach((part) => {
      if (/^\[.*\]$/.test(part)) span.append(el('span', { class: 'kwtag' }, kwText(part.slice(1, -1))));
      else if (part && nameRe) part.split(nameRe).forEach((q) => { if (q) span.append(names.includes(q) ? el('b', null, q) : q); });
      else if (part) span.append(part);
    });
    return span;
  }
  // 「名稱 English：說明」→ 名稱到冒號粗體
  function abilityView(s) {
    s = strip(s);
    const i = s.indexOf('：');
    if (i < 0) return s;
    return el('span', null, el('b', null, s.slice(0, i + 1)), s.slice(i + 1));
  }
  // 近戰 STR 顯示成 合計(+X)；多種模型時只寫 +X
  function meleeStr(s, strValue) {
    const x = C.meleeX(s); // 「+6」或「13(+6)」都取 6，再用持有者的 STR 算合計
    if (isNaN(x) || isNaN(strValue)) return isNaN(x) ? text(s) : `+${x}`;
    return `${strValue + x}(+${x})`;
  }

  /**
   * @param card   存檔內容（會先 normalize）
   * @param result TaktikCalc.scoreUnit 的結果（可省略，省略時用存檔裡的 result.total）
   * @param opts   { iconBase: 'icons/' }
   */
  function render(card, result, opts = {}) {
    card = normalize(card);
    KW = opts.keywords || null;
    const iconBase = opts.iconBase || 'icons/';
    const total = result ? result.total : (opts.total != null ? opts.total : null);
    const strValue = result && !isNaN(result.strValue) ? result.strValue
      : (card.profiles.length === 1 ? C.firstNum(card.profiles[0].stats.STR) : NaN);
    const root = el('div', { class: 'card' });

    root.append(el('table', { class: 'bar-name' }, el('tr', null,
      el('td', null, card.name), el('td', { class: 'pts' }, total != null ? `${total}pts` : '—pts'))));

    const multi = card.profiles.length > 1;
    card.profiles.forEach((p) => {
      if (!multi) root.append(el('div', { class: 'kw' }, kwText(p.keywords)));
      else root.append(el('div', { class: 'prof-name' }, el('span', { class: 'pname' }, text(p.name)), ' ', el('span', { class: 'kwtag' }, kwText(p.keywords))));
      const shieldOn = /能量護盾/.test(p.keywords || '');
      root.append(el('table', { class: 'stats' },
        el('tr', { class: 'h' }, STAT_KEYS.map((k) => el('td', null, k))),
        el('tr', { class: 'v' }, STAT_KEYS.map((k) => el('td', null, statView(p.stats[k], k, shieldOn))))));
    });

    root.append(el('div', { class: 'gray' }, 'UNIT COMPOSITION'));
    const names = multi ? card.profiles.map((p) => text(p.name).split(' ')[0]).filter(Boolean) : [];
    root.append(el('ul', { class: 'bul' }, card.composition.filter((x) => text(x)).map((x) => el('li', null, blueTags(x, names)))));

    root.append(el('div', { class: 'gray' }, 'ABILITIES'));
    root.append(el('ul', { class: 'bul' }, card.abilities
      .map((a) => C.parseAbility(a).text) // 能力後面寫的分數輸出時隱藏
      .filter((t) => text(t)).map((t) => el('li', null, abilityView(t)))));

    const tbl = el('table', { class: 'wg' },
      el('colgroup', null, ['name', 'rng', 'str', 'd', 'as', 'rl'].map((c) => el('col', { class: 'c-' + c }))),
      el('tr', { class: 'h' }, el('td', null, 'WARGEARS'), ['RNG(”)', 'STR', 'D', 'AS', 'RL'].map((h) => el('td', { class: 'n' }, h))));
    const addW = (tbl, w) => {
      // 複合武器：名稱一列（數值空白）＋每個模式一列（▶ 開頭）
      if (Array.isArray(w.modes) && w.modes.length) {
        const ht = WTYPES[w.type] ? w.type : 'ranged';
        tbl.append(el('tr', null,
          el('td', null, el('img', { class: 'icon', src: iconBase + WTYPES[ht].icon, alt: WTYPES[ht].label }), el('span', { class: 'wname' }, text(w.name))),
          ...['RNG', 'STR', 'D', 'AS', 'RL'].map(() => el('td', { class: 'n' }))));
        (w.modes || []).forEach((m) => {
          const melee = C.modeType(m) === 'melee';
          const n = (k) => el('td', { class: 'n' }, el('span', null, k === 'STR' && melee ? meleeStr(m.STR, multi ? NaN : strValue) : text(m[k])));
          tbl.append(el('tr', { class: 'mode' },
            el('td', null, WTYPES[m.icon] ? el('img', { class: 'icon', src: iconBase + WTYPES[m.icon].icon, alt: WTYPES[m.icon].label })
                : el('img', { class: 'icon mode-icon', src: iconBase + 'mode.png', alt: '▶' }),
              el('span', { class: 'wname' }, text(m.name)), ' ', el('span', { class: 'wrules' }, kwText(m.rules))),
            n('RNG'), n('STR'), n('D'), n('AS'), n('RL')));
        });
        return;
      }
      // 特殊裝備：名稱列（數值都是 -）＋一整列說明（最後的分數不顯示）
      if (w.type === 'equipment') {
        if (!text(w.name)) return;
        tbl.append(el('tr', null,
          el('td', null, el('img', { class: 'icon', src: iconBase + WTYPES.equipment.icon, alt: WTYPES.equipment.label }),
            el('span', { class: 'wname' }, text(w.name)), ' ', el('span', { class: 'wrules' }, kwText(w.rules))),
          ...['RNG', 'STR', 'D', 'AS', 'RL'].map(() => el('td', { class: 'n' }, el('span', null, '-')))));
        const desc = C.parseAbility({ text: w.text }).text;
        if (text(desc)) tbl.append(el('tr', { class: 'eq-desc' }, el('td', { colspan: '6' }, abilityView(desc))));
        return;
      }
      if (!text(w.name) && !text(w.STR) && !text(w.RNG)) return;
      const type = WTYPES[w.type] ? w.type : 'ranged';
      const melee = type === 'multi' ? C.modeType(w) === 'melee' : !isShootType(type); // 近戰＋射擊圖示的單一武器看 RNG
      const n = (k) => el('td', { class: 'n' }, el('span', null, k === 'STR' && melee ? meleeStr(w.STR, multi ? NaN : strValue) : text(w[k])));
      tbl.append(el('tr', null,
        el('td', null, el('img', { class: 'icon', src: iconBase + WTYPES[type].icon, alt: WTYPES[type].label }),
          el('span', { class: 'wname' }, text(w.name)), ' ', el('span', { class: 'wrules' }, kwText(w.rules))),
        n('RNG'), n('STR'), n('D'), n('AS'), n('RL')));
      if (text(w.text)) tbl.append(el('tr', { class: 'eq-desc' }, el('td', { colspan: '6' }, abilityView(C.parseAbility({ text: w.text }).text))));
    };
    card.weapons.forEach((w) => addW(tbl, w));
    root.append(tbl);
    // 選項武器（替換用，玩家端顯示）
    if (opts.showOptionWeapons && card.optionWeapons.length) {
      const ot = el('table', { class: 'wg opt-wg' },
        el('colgroup', null, ['name', 'rng', 'str', 'd', 'as', 'rl'].map((c) => el('col', { class: 'c-' + c }))),
        el('tr', { class: 'h' }, el('td', null, 'WARGEAR OPTIONS 選項武器'), ['RNG(”)', 'STR', 'D', 'AS', 'RL'].map((h) => el('td', { class: 'n' }, h))));
      card.optionWeapons.forEach((w) => addW(ot, w));
      root.append(ot);
    }

    if (card.options.length) {
      root.append(el('div', { class: 'gray' }, 'OPTIONS'));
      root.append(el('ul', { class: 'bul opts' }, card.options.map((o) => {
        const li = el('li', { class: o.sub ? 'sub' : 'main' }, el('span', { class: 'otext' }, strip(o.text)));
        if (text(o.pts)) li.append(el('span', { class: 'leader' }), el('span', { class: 'opts-pts' }, o.pts));
        return li;
      })));
    }
    KW = null;
    return root;
  }

  global.TaktikCard = { render, normalize, STAT_KEYS, WTYPES };
})(window);
