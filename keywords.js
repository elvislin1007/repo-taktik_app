// 關鍵字資料庫（keywords.json）：查詢、把資料卡上的特規文字對應到關鍵字。編輯器、玩家端、資料卡共用。
// 對應方式：去掉 ✶、括號內容、後面的數字（例：「✶精準」「免傷(5+)」「HEAT 2”」）後比對名稱與別名；
// 別名「輔助」也對得到「輔助-射擊」這種寫法；別名「…抗性」對得到「火焰抗性」這種寫法。
(function (global) {
  'use strict';

  function norm(s) {
    return String(s || '')
      .replace(/[✶*]/g, '')
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/[\s\d.”″"'+\-–×]+$/, '')
      .trim();
  }

  function buildIndex(db) {
    const exact = new Map();
    const prefix = [];
    const suffix = [];
    const items = (db && Array.isArray(db.items)) ? db.items : [];
    items.forEach((it) => {
      const names = [it.name, it.en, ...(Array.isArray(it.aliases) ? it.aliases : [])];
      names.forEach((raw) => {
        const a = String(raw || '').trim();
        if (!a) return;
        if (a.startsWith('…')) { if (a.length > 1) suffix.push([a.slice(1), it]); return; }
        const k = norm(a).toLowerCase();
        if (k && !exact.has(k)) exact.set(k, it);
        if (k && /[㐀-鿿]/.test(k)) prefix.push([k + '-', it]);
      });
    });
    prefix.sort((a, b) => b[0].length - a[0].length);
    return { items, exact, prefix, suffix };
  }

  function lookup(index, term) {
    if (!index) return null;
    const t = norm(term).toLowerCase();
    if (!t) return null;
    if (index.exact.has(t)) return index.exact.get(t);
    for (const [p, it] of index.prefix) if (t.startsWith(p)) return it;
    for (const [s, it] of index.suffix) if (t.length > s.length && t.endsWith(s)) return it;
    return null;
  }

  // 「手槍、速射、爆彈」→ ['手槍','、','速射','、','爆彈']（分隔符號也留著）
  const SEP = /([、，,；;]\s*)/;
  const split = (s) => String(s || '').split(SEP).filter((x) => x !== '');
  const isSep = (s) => SEP.test(s) && !String(s).replace(SEP, '').trim();

  // 搜尋用：名稱、英文、別名、說明
  function matches(it, q) {
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return true;
    const hay = [it.name, it.en, ...(it.aliases || []), it.text, it.group].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  }
  // 名稱完全符合的排前面
  function rank(it, q) {
    const t = String(q || '').trim().toLowerCase();
    if (!t) return 2;
    if ([it.name, it.en, ...(it.aliases || [])].some((a) => String(a || '').toLowerCase() === t)) return 0;
    if (String(it.name || '').toLowerCase().includes(t) || String(it.en || '').toLowerCase().includes(t)) return 1;
    return 2;
  }
  const title = (it) => [it.name, it.en].filter(Boolean).join(' ');

  global.TaktikKW = { norm, buildIndex, lookup, split, isSep, matches, rank, title };
})(window);
