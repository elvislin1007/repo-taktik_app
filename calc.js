// Taktik 步兵算分引擎 — 依照資料庫 01–06、12。改規則時同步改這裡。
(function (global) {
  'use strict';

  // ---------- 02 本體基數 ----------
  const STR_BASE = {
    '-1': 0.1, 0: 0.2, 1: 0.4, 2: 0.8, 3: 1.6, 4: 2.8, 5: 4.4, 6: 6.4, 7: 8.8, 8: 11.6, 9: 14.8,
    10: 18.4, 11: 22.4, 12: 26.8, 13: 31.6, 14: 36.8, 15: 42.4, 16: 48.4, 17: 54.8, 18: 61.6,
    19: 68.8, 20: 76.4, 21: 84.4, 22: 92.8, 23: 101.6, 24: 110.8, 25: 120.4, 26: 130.4,
    27: 140.8, 28: 151.6, 29: 162.8, 30: 174.4, 31: 186.4, 32: 198.8, 33: 211.6, 34: 224.8, 35: 238.4,
  };
  const ATTR_BASE = { 1: 0, 2: 0.1, 3: 0.8, 4: 1.6, 5: 3.2, 6: 6.4, 7: 12.8, 8: 25.6, 9: 51.2 };
  const ATTRS = ['FS', 'BS', 'CON', 'AGI', 'PER', 'INT', 'WP'];

  // ---------- 03 本體特規（乘） ----------
  const BODY_FIXED = {
    '容易起火': -0.2, '開頂': -0.2, '無法移動': -0.2,
    '愚笨': -0.1, '好戰': -0.1, '緩慢砲塔': -0.1,
    '載具': 0, '無人機': 0, '重甲': 0, '重裝': 0,
    '先手衝鋒': 0.1, '迅捷': 0.1, '後撤射擊': 0.1, '決鬥士': 0.1, '反制衝鋒': 0.1, '不可阻擋': 0.1,
    '煙霧發射器': 0.1, 'ESS': 0.1, '懸浮': 0.1, '自動滅火': 0.1, '觀測': 0.1, '半履帶': 0.1,
    '快速砲塔': 0.1, '哨兵': 0.1, '穩定作戰': 0.1, '✶精準(近戰OR射擊)': 0.1,
    '英勇': 0.2, '堅韌': 0.2, '飛行': 0.2, '懸停': 0.2, '跳躍': 0.2, '傳送': 0.2, '巡路者': 0.2,
    '滲透': 0.2, '突擊載具': 0.2, '自動操作': 0.2, '奇襲': 0.2, '護衛': 0.2, '✶精準': 0.2,
    '精準(近戰OR射擊)': 0.2, '仇恨': 0.2,
    '飛行/懸停': 0.3, '夜視': 0.3, '躲藏': 0.3, '無懼': 0.3, '閃避專精': 0.3, '精準': 0.3,
    '永恆戰士': 0.5, '小目標': 0.5, '超重型': 0.5,
  };
  // 帶名詞 X、固定分數
  const BODY_NOUN = { '仇恨': 0.1, '護衛': 0.1 };
  // 階層：X 參與計算。kind 'n' = 直接是 X；'7-' = 填 5+ → X = 7-5
  const BODY_TIER = {
    '後攻': [-0.1, 'n'], '遲緩': [-0.1, 'n'],
    '恐懼': [0.1, 'n'], '先攻': [0.1, 'n'], '速攻': [0.1, 'n'], '偽裝': [0.1, 'n'], '反擊': [0.1, 'n'],
    '毒': [0.2, 'n'], '減傷': [0.2, 'n'],
    '法術保護': [0.2, '7-'], '免傷': [0.2, '7-'], '再生': [0.2, '7-'],
  };
  const SMALL_RES = ['火', '電', '冰', '精神', '毒'];
  const BIG_RES = ['法術', '能量'];

  // ---------- 04 額外加成（加） ----------
  const INDEPENDENT_KEYS = ['人物', '載具', '機甲', '巨獸'];
  // 12 單位類型：不計分
  const TYPE_KEYS = ['生物', '步兵', '戰線', '組員', '人物', '載具', '機甲', '巨獸'];
  // 12 複合關鍵字
  const COMPOUND = {
    '阿斯塔特': ['英勇', '先進視覺(24”)'],
    '風暴兵': ['先進視覺(24”)'],
    '機魂': ['自動操作', '自動滅火'],
  };

  // ---------- 05／06 武器 ----------
  const W_RULE = {
    '重型': -0.2, '不精準': -0.2,
    'APCR': -0.1, '速射': -0.1, '緩慢砲塔': -0.1, '雙手': -0.1,
    'AP': 0, 'HEAT': 0, 'APHE': 0, '發射物/飛彈': 0, '投擲': 0, '傾斜裝甲': 0,
    '突擊': 0.1, '✶精準近戰/射擊': 0.1, '爆彈': 0.1,
    '能量力場': 0.2, '能量劍刃': 0.2, '能量': 0.2, '能量彈': 0.2, '智能': 0.2, '盾牆': 0.2,
    '半自動': 0.2, '✶精準': 0.2, '✶沾黏': 0.2, '長槍': 0.2, '精準近戰/射擊': 0.2,
    '雙持': 0.3, '穿透': 0.3, '無視掩體': 0.3, '精準': 0.3, '撕碎': 0.3, '光學': 0.3, '爆燃': 0.3, '✶即死': 0.3,
    '破甲': 0.5, '束縛': 0.5, '熱熔': 0.5, '手槍': 0.5, '重力': 0.5, '即死': 0.5,
    '狙擊': 1.5, '噴射': 1.5, '重力偏轉': 1.5,
  };
  // 名稱同義（01 填法）
  const W_ALIAS = {
    '✶精準(近戰)': '✶精準近戰/射擊', '✶精準(射擊)': '✶精準近戰/射擊', '✶精準(近戰OR射擊)': '✶精準近戰/射擊',
    '精準(近戰)': '精準近戰/射擊', '精準(射擊)': '精準近戰/射擊', '精準(近戰OR射擊)': '精準近戰/射擊',
  };
  const BODY_ALIAS = {
    '✶精準(近戰)': '✶精準(近戰OR射擊)', '✶精準(射擊)': '✶精準(近戰OR射擊)',
    '精準(近戰)': '精準(近戰OR射擊)', '精準(射擊)': '精準(近戰OR射擊)',
  };
  const W_TIER = {
    '過熱': [-0.1, 'n'], '後攻': [-0.1, 'n'],
    '✶穿甲': [0.1, 'n'], '✶重擊': [0.1, 'n'], '先攻': [0.1, 'n'], '反擊': [0.1, 'n'],
    '鎖鏈': [0.2, 'n'], '毒': [0.2, 'n'], '燃燒': [0.2, 'n'], '擊暈': [0.2, 'n'], '制導': [0.2, 'n'],
    '曲射-': [0.2, '2-'],
  };
  const W_BASEADD = {
    '法術武器': [3, 'n'], '輔助動作': [5, 'n'], '至盲': [10, 'n'], '腐蝕': [10, '7-'], 'EMP': [10, '7-'],
    '✶冰凍': [10, 'n'], '冰凍': [20, 'n'],
  };
  const W_MOD = {
    '一次性': 0.2, '手榴彈': 0.2, '複選': 0.5, '同軸': 0.5, '完全固定': 0.6,
    '角度(180°)': 0.9, '角度(90°)': 0.8, '角度(30°)': 0.7, '固定': 0.6,
    '垂直穩定器': 1.1, '雙向穩定器': 1.2, '防空': 1.2, '額外': 1.2,
  };
  const DIRECT_ONLY = ['能量', 'HEAT', 'APHE'];

  // ---------- 工具 ----------
  const round5 = (x) => Math.floor(x / 5 + 0.5) * 5;
  const r2 = (x) => Math.round(x * 100) / 100;
  const clean = (s) => (s || '').replace(/[\[\]［］]/g, '').replace(/\s+/g, ' ').trim();
  const splitList = (s) => clean(s).split(/[、,，;；]/).map((t) => t.trim()).filter(Boolean);
  const num = (s) => {
    const m = String(s == null ? '' : s).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };
  const firstNum = (s) => num(String(s || '').split(/[\/(（]/)[0]);
  const secondNum = (s) => {
    const p = String(s || '').split('/');
    return p.length > 1 ? num(p[1]) : NaN;
  };
  // 解析 名稱(值) 或 名稱值（例：免傷(5+)、遲緩1、先進視覺(24”)）
  function parseRule(tok) {
    tok = tok.replace(/（/g, '(').replace(/）/g, ')').trim();
    let m = tok.match(/^(.+?)\((.*)\)$/);
    if (m) return { name: m[1].trim(), arg: m[2].trim(), raw: tok };
    m = tok.match(/^(.*?[^\d\s+\-])\s*(\d+\+?)[”"]?$/);
    if (m && m[1]) return { name: m[1].trim(), arg: m[2].trim(), raw: tok, bare: true };
    return { name: tok, arg: null, raw: tok };
  }
  function solveX(arg, kind) {
    const v = num(arg);
    if (isNaN(v)) return NaN;
    if (kind === '7-') return 7 - v;
    if (kind === '2-') return 2 - v;
    return v;
  }
  const dist = (arg) => num(String(arg).replace(/[”"″]/g, ''));

  // ---------- 本體 ----------
  function scoreBody(card, out) {
    const st = card.stats || {};
    const steps = out.steps;
    const warn = out.warnings;
    const get = (k) => firstNum(st[k]);

    // 基數
    const parts = [];
    let sum = 0;
    const strV = get('STR');
    if (!(strV in STR_BASE)) warn.push(`STR「${st.STR || ''}」查不到基數`);
    else { sum += STR_BASE[strV]; parts.push(`STR${strV}=${STR_BASE[strV]}`); }
    ATTRS.forEach((k) => {
      const v = get(k);
      if (!(v in ATTR_BASE)) { warn.push(`${k}「${st[k] || ''}」查不到基數（屬性 1–9）`); return; }
      sum += ATTR_BASE[v]; parts.push(`${k}${v}=${ATTR_BASE[v]}`);
    });
    const defV = get('DEF');
    if (!((defV - 3) in STR_BASE)) warn.push(`DEF「${st.DEF || ''}」查不到基數`);
    else { sum += STR_BASE[defV - 3]; parts.push(`DEF${defV}=${STR_BASE[defV - 3]}`); }
    steps.push({ label: '本體基數總和', calc: parts.join(' + '), value: r2(sum) });

    const hpV = get('HP');
    const hpM = 1 + (hpV - 1) * 0.3;
    const mV = get('M');
    const mM = 1 + mV * 0.05;
    if (isNaN(hpV)) warn.push('HP 沒有數字');
    if (isNaN(mV)) warn.push('M 沒有數字');
    steps.push({ label: '血量加乘', calc: `1 + (${hpV} − 1) × 0.3`, value: r2(hpM) });
    steps.push({ label: '速度加乘', calc: `1 + ${mV} × 0.05`, value: r2(mM) });

    // 關鍵字展開
    const tokens = splitList(card.keywords);
    const expanded = [];
    const seen = new Set();
    const independent = tokens.some((t) => INDEPENDENT_KEYS.some((k) => t === k || t.startsWith(k + '(')));
    tokens.forEach((t) => {
      const base = t.replace(/\(.*\)$/, '');
      if (COMPOUND[t] || COMPOUND[base]) {
        const inner = COMPOUND[t] || COMPOUND[base];
        out.notes.push(`複合關鍵字「${t}」→ ${inner.join('、')}`);
        inner.forEach((x) => { if (!seen.has(x)) { seen.add(x); expanded.push({ tok: x, from: t }); } });
        return;
      }
      if (!seen.has(t)) { seen.add(t); expanded.push({ tok: t }); }
    });

    let mult = 0;
    const multParts = [];
    const extras = [];
    const ignored = [];
    expanded.forEach(({ tok, from }) => {
      let r = parseRule(tok);
      const alias = BODY_ALIAS[tok];
      if (alias) r = { name: alias, arg: null, raw: tok };
      const tag = from ? `（${from}）` : '';
      // 類型
      if (TYPE_KEYS.includes(r.name) && (r.arg == null || r.name === '人物')) { ignored.push(tok + '（類型）'); return; }
      // 額外加成（04）
      if (['熱視線', '夜視', '先進視覺'].includes(r.name) && r.arg != null) {
        const n = dist(r.arg); const x = n - 6; const k = r.name === '先進視覺' ? 0.6 : 0.3;
        extras.push({ name: tok + tag, calc: `X = ${n} − 6 = ${x}；${k} × ${x}`, value: k * x });
        return;
      }
      if (['法術視覺', '盲視'].includes(r.name) && r.arg == null) { extras.push({ name: tok + tag, calc: '固定', value: 10 }); return; }
      if (r.name === '領導') {
        const lv = num(r.arg);
        const per = independent ? 30 : 6;
        extras.push({ name: tok, calc: `Lv1 不算，${per} × (${lv} − 1)`, value: Math.max(0, per * (lv - 1)) });
        return;
      }
      if (r.name === '戰術家') {
        const x = num(r.arg); const per = independent ? 30 : 6;
        extras.push({ name: tok, calc: `${per} × ${x}`, value: per * x });
        return;
      }
      if (['維修', '醫療', '法術'].includes(r.name) && r.arg != null) {
        const x = num(r.arg); const per = independent ? 15 : 3;
        extras.push({ name: tok, calc: `${per} × ${x}`, value: per * x });
        return;
      }
      if (r.name === '能量護盾' && r.arg == null) {
        const sDef = secondNum(st.DEF); const sHp = secondNum(st.HP);
        if (isNaN(sDef) || isNaN(sHp)) { warn.push('有「能量護盾」，但 DEF、HP 沒有寫斜線後的護盾值（例：14/14、7/4）'); return; }
        const a = STR_BASE[sDef - 3];
        extras.push({ name: tok, calc: `A = 護盾DEF${sDef} 基數 ${a}，B = 護盾HP ${sHp}；A × B`, value: a * sHp });
        return;
      }
      if (r.name === '運輸') { warn.push(`「${tok}」：加分 = X × 乘客每隻 WT，卡上沒有乘客 WT，這次沒算`); return; }
      // 本體特規（03）
      if (r.arg == null && r.name in BODY_FIXED) { mult += BODY_FIXED[r.name]; multParts.push(`${tok}${tag} ${fmtSigned(BODY_FIXED[r.name])}`); return; }
      if (r.arg != null && !r.bare && r.name in BODY_NOUN && isNaN(num(r.arg))) { mult += BODY_NOUN[r.name]; multParts.push(`${tok}${tag} ${fmtSigned(BODY_NOUN[r.name])}`); return; }
      if (r.arg != null && r.name in BODY_TIER) {
        const [k, kind] = BODY_TIER[r.name]; const x = solveX(r.arg, kind);
        if (isNaN(x)) { warn.push(`「${tok}」的數值看不懂`); return; }
        mult += k * x; multParts.push(`${tok}${tag} ${fmtSigned(k)}×${x}`); return;
      }
      const res = r.name.match(/^(.+)抗性$/);
      if (res && r.arg != null) {
        const x = num(r.arg);
        if (SMALL_RES.includes(res[1])) { mult += 0.1 * x; multParts.push(`${tok} 小抗性 +0.1×${x}`); return; }
        if (BIG_RES.includes(res[1])) { mult += 0.2 * x; multParts.push(`${tok} 大抗性 +0.2×${x}`); return; }
        warn.push(`「${tok}」：${res[1]} 不在小抗性／大抗性清單，要歸哪一類？這次沒算`); return;
      }
      ignored.push(tok);
    });

    if (ignored.length) out.notes.push(`不計分：${ignored.join('、')}（陣營／子陣營／類型。若其中有特規，表示資料庫查不到，請確認）`);

    const body = sum * hpM * mM * (1 + mult);
    steps.push({ label: '本體特規加成', calc: multParts.length ? `1 + (${multParts.join('、')})` : '無', value: r2(1 + mult) });
    steps.push({ label: '本體分數', calc: `${r2(sum)} × ${r2(hpM)} × ${r2(mM)} × ${r2(1 + mult)}`, value: r2(body) });

    let extraSum = 0;
    extras.forEach((e) => { extraSum += e.value; steps.push({ label: `額外加成：${e.name}`, calc: e.calc + (independent ? '（獨立）' : '（部隊）'), value: r2(e.value) }); });
    return { body, extra: extraSum, independent, strV };
  }

  const fmtSigned = (v) => (v >= 0 ? '+' : '−') + Math.abs(v);

  // ---------- 武器 ----------
  function asMult(asText, rules, type, warn, name) {
    const s = String(asText || '').trim();
    if (type !== 'ranged') {
      if (s === '' || /^\+?0$/.test(s)) return [1, '一般 ×1'];
      if (/^-1$/.test(s)) return [0.7, '慢 ×0.7'];
      if (/^\+1$/.test(s)) return [1.3, '快 ×1.3'];
      if (/^[×x*]2$/i.test(s)) return [2, '極快 ×2'];
      warn.push(`${name}：近戰 AS「${s}」看不懂（+0、−1、+1、×2）`); return [1, '?'];
    }
    let v;
    if (s.includes('/')) {
      const [a, b] = s.split('/').map(num);
      v = (a + b) / 2;
      if (!rules.includes('速射')) warn.push(`${name}：AS 有兩個值但沒有「速射」`);
    } else v = num(s);
    if (isNaN(v)) { warn.push(`${name}：AS 沒有數字`); return [1, '?']; }
    if (v >= 3) return [v * 0.8, `${v} × 0.8`];
    return [v, `×${v}`];
  }
  function rlMult(rl) {
    const s = String(rl || '').trim();
    if (s === '' || s === '-' || s === '－' || s === '—') return [1, '無須裝填 ×1'];
    if (s === '1') return [0.8, '正常裝填 ×0.8'];
    if (s === '2') return [0.6, '緩慢 ×0.6'];
    return [1, `RL「${s}」看不懂`];
  }

  function scoreWeapon(w, ctx, out) {
    const warn = out.warnings;
    const name = clean(w.name) || '（未命名武器）';
    const type = w.type || 'ranged';
    const rules = splitList(w.rules);
    // 規則分類
    let add = 0, baseAdd = 0, mod = 1;
    const addP = [], baseP = [], modP = [];
    let heRadius = null;
    const directAdd = { v: 0 };
    rules.forEach((tok) => {
      const t = W_ALIAS[tok] || tok;
      const he = t.match(/^HE\s*(\d+(?:\.\d+)?)\s*[”"]?$/i) || t.match(/^HE\((\d+)/i);
      if (he) { heRadius = parseFloat(he[1]); return; }
      const heat = t.match(/^HEAT\s*(\d+)/i);
      if (heat) { heRadius = parseFloat(heat[1]); return; }
      if (t in W_RULE) {
        add += W_RULE[t]; addP.push(`${tok} ${fmtSigned(W_RULE[t])}`);
        if (DIRECT_ONLY.includes(t)) directAdd.v += W_RULE[t];
        return;
      }
      if (t in W_MOD) { mod *= W_MOD[t]; modP.push(`${tok} ×${W_MOD[t]}`); return; }
      const r = parseRule(t);
      if (r.arg != null && r.name in W_TIER) {
        const [k, kind] = W_TIER[r.name]; const x = solveX(r.arg, kind);
        add += k * x; addP.push(`${tok} ${fmtSigned(k)}×${x}`); return;
      }
      if (r.arg != null && r.name in W_BASEADD) {
        const [k, kind] = W_BASEADD[r.name]; const x = solveX(r.arg, kind);
        baseAdd += k * x; baseP.push(`${tok} +${k}×${x}`); return;
      }
      const anti = r.name.match(/^反-/);
      if (anti && r.arg != null) { const x = solveX(r.arg, '7-'); baseAdd += 5 * x; baseP.push(`${tok} +5×${x}`); return; }
      warn.push(`${name}：武器特規「${tok}」資料庫查不到，這次沒算`);
    });
    if (type === 'shield') addP.push('盾牌（類型） +0');

    const [asM, asTxt] = asMult(w.AS, rules, type, warn, name);
    const dPair = String(w.D || '').split('/').map(num);
    const dmg = (d) => 1 + (d - 1) * 0.3;
    let lines = [];
    let total = 0;

    if (type === 'ranged') {
      const strPair = String(w.STR || '').split('/').map(num);
      const rngV = num(w.RNG);
      const rngM = rngV * 0.05;
      const [rlM, rlTxt] = rlMult(w.RL);
      const base = STR_BASE[strPair[0]];
      if (base == null) warn.push(`${name}：STR「${w.STR || ''}」查不到基數`);
      if (isNaN(rngV)) warn.push(`${name}：RNG 沒有數字`);
      const direct = ((base || 0) + baseAdd) * dmg(dPair[0]) * rngM * (1 + add) * asM * rlM * mod;
      lines.push(`(${base} + ${baseAdd}) × ${r2(dmg(dPair[0]))} × ${r2(rngM)} × ${r2(1 + add)} × ${r2(asM)} × ${rlM} × ${r2(mod)}`);
      total = direct;
      if (strPair.length > 1 && dPair.length > 1 && heRadius) {
        const bBase = STR_BASE[strPair[1]];
        const bAdd = add - directAdd.v;
        const blast = ((bBase || 0) + baseAdd) * dmg(dPair[1]) * rngM * (1 + bAdd) * heRadius * asM * rlM * mod;
        lines.push(`爆炸 (${bBase} + ${baseAdd}) × ${r2(dmg(dPair[1]))} × ${r2(rngM)} × ${r2(1 + bAdd)} × ${heRadius}" × ${r2(asM)} × ${rlM} × ${r2(mod)} = ${r2(blast)}，×0.5`);
        total = direct + blast * 0.5;
      } else if (strPair.length > 1) warn.push(`${name}：STR 有兩個值但沒有 HE／HEAT 半徑`);
      out.steps.push({ label: `武器：${name}`, calc: `RNG ${rngV}、STR ${w.STR}、D ${w.D}、AS ${asTxt}、${rlTxt}；規則 ${addP.join('、') || '無'}${baseP.length ? '；基數加值 ' + baseP.join('、') : ''}${modP.length ? '；修正 ' + modP.join('、') : ''}`, value: '' });
    } else {
      const x = num(w.STR);
      const strIdx = 2 * x - 1;
      const base = STR_BASE[strIdx];
      if (base == null) warn.push(`${name}：近戰 STR 要填 +X（例 +6），「${w.STR || ''}」查不到`);
      const rngTxt = String(w.RNG || '').trim().toUpperCase();
      let rngM = 1;
      if (rngTxt === 'CC2') rngM = 1.1;
      else if (rngTxt !== 'CC1' && rngTxt !== '') warn.push(`${name}：近戰 RNG 要填 CC1 或 CC2`);
      total = ((base || 0) + baseAdd) * 2 * dmg(dPair[0]) * rngM * (1 + add) * asM * mod;
      lines.push(`(${base} + ${baseAdd}) × 2 × ${r2(dmg(dPair[0]))} × ${rngM} × ${r2(1 + add)} × ${r2(asM)} × ${r2(mod)}`);
      out.steps.push({ label: `武器：${name}（${type === 'shield' ? '盾牌' : '近戰'}）`, calc: `${rngTxt || 'CC1'}、STR +${x}（查 STR ${strIdx}）、D ${w.D}、AS ${asTxt}；規則 ${addP.join('、') || '無'}${baseP.length ? '；基數加值 ' + baseP.join('、') : ''}${modP.length ? '；修正 ' + modP.join('、') : ''}`, value: '' });
    }
    const rounded = round5(total);
    out.steps.push({ label: '　算式', calc: lines.join('；') + ` = ${r2(total)} → 取整`, value: rounded });
    return rounded;
  }

  // ---------- 單位 ----------
  function modelCount(lines) {
    let n = 0;
    (lines || []).forEach((l) => { const m = clean(l).match(/^(\d+)\s*[個名台隻位]/); if (m) n += parseInt(m[1], 10); });
    return n || 1;
  }

  function scoreUnit(card) {
    const out = { steps: [], warnings: [], notes: [] };
    const b = scoreBody(card, out);
    let wSum = 0;
    (card.weapons || []).forEach((w) => {
      if (!clean(w.name) && !w.STR && !w.RNG) return;
      wSum += scoreWeapon(w, b, out);
    });
    const model = b.body + b.extra + wSum;
    const modelR = round5(model);
    out.steps.push({ label: '每個模型', calc: `本體 ${r2(b.body)} + 額外 ${r2(b.extra)} + 武器 ${wSum}`, value: `${r2(model)} → ${modelR}` });

    const count = modelCount(card.composition);
    let unit = round5(modelR * count);
    out.steps.push({ label: '模型數', calc: `依單位構成：${count} 個；${modelR} × ${count}`, value: unit });

    // 單位構成裡的指揮模型：Lv2 以上才算
    (card.composition || []).forEach((l) => {
      const m = clean(l).match(/領導\(Lv(\d+)\)/i);
      if (m) {
        const lv = parseInt(m[1], 10);
        const per = b.independent ? 30 : 6;
        if (lv > 1) { const v = per * (lv - 1); unit += v; out.steps.push({ label: '指揮模型 領導', calc: `${per} × (${lv} − 1)`, value: v }); }
        else out.notes.push('單位構成裡的 領導(Lv1) 不算分');
      }
    });

    let abil = 0;
    (card.abilities || []).forEach((a) => { const v = parseFloat(a.score); if (!isNaN(v) && v) { abil += v; out.steps.push({ label: `能力：${clean(a.text).split('：')[0].slice(0, 24)}`, calc: '手動輸入', value: v }); } });

    const total = round5(unit + abil);
    out.steps.push({ label: '總分', calc: `${unit}${abil ? ' + 能力 ' + abil : ''}`, value: total });
    out.total = total;
    out.modelCount = count;
    out.strValue = b.strV;
    return out;
  }

  global.TaktikCalc = { scoreUnit, round5, STR_BASE, ATTR_BASE, clean, splitList, parseRule, num, firstNum };
})(typeof window !== 'undefined' ? window : globalThis);
