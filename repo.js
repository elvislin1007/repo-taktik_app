// 保存／讀取單位：直接用 GitHub API 讀寫使用者的 repo（不需要伺服器）。
// 單位資料和網頁放在同一個公開 repo（repo-taktik_app）的 units/：讀取不用權杖；
// 保存（編輯器）要在「GitHub 設定」填權杖，只存在這台電腦的瀏覽器裡。規則文件另外放在私人 repo taktik_rules。
(function (global) {
  'use strict';
  const CFG_KEY = 'taktik-github-v1';
  // 單位、武器一律存在這裡，不能改（避免存錯 repo）。這台電腦只記權杖。
  const DATA_REPO = Object.freeze({ owner: 'elvislin1007', repo: 'repo-taktik_app', branch: 'main' });
  const API = 'https://api.github.com';

  function getConfig() {
    let token = '';
    try { token = (JSON.parse(localStorage.getItem(CFG_KEY) || '{}').token || '').trim(); } catch (e) { /* 讀不到就當沒填 */ }
    return Object.assign({}, DATA_REPO, { token });
  }
  function setConfig(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify({ token: (cfg && cfg.token) || '' })); return true; } catch (e) { return false; }
  }

  // 與資料夾分類相同的檔名規則
  const BAD = /[\\/:*?"<>|\x00-\x1f]/g;
  function safePart(s, fallback) {
    s = String(s || '').trim().replace(BAD, '_').replace(/^[ .]+|[ .]+$/g, '');
    return s.slice(0, 80) || fallback;
  }
  // 單位：units/<系列>/<陣營>/<子陣營>/<單位名稱>.json
  function unitPath(card) {
    return `units/${safePart(card.series, '未分類')}/${safePart(card.faction, '未分類')}/${safePart(card.subfaction, '未分類')}/${safePart(card.name, '未命名')}.json`;
  }
  // 共用武器庫：weapons/<系列>/<陣營>/<子陣營>/<武器名稱>.json
  function weaponPath(series, faction, subfaction, name) {
    return `weapons/${safePart(series, '未分類')}/${safePart(faction, '未分類')}/${safePart(subfaction, '未分類')}/${safePart(name, '未命名')}.json`;
  }
  const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');

  async function gh(path, opts = {}) {
    const cfg = getConfig();
    const headers = Object.assign({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, opts.headers || {});
    if (cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    const r = await fetch(API + path, Object.assign({}, opts, { headers, cache: 'no-store' }));
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).message || msg; } catch (e) { /* 非 JSON */ }
      const err = new Error(explain(r.status, msg, (opts.method || 'GET') !== 'GET'));
      err.status = r.status;
      throw err;
    }
    return r;
  }
  function explain(status, msg, writing) {
    const { owner, repo } = getConfig();
    const where = `${owner}/${repo}`;
    if (status === 401) return '權杖無效或過期，請到「GitHub 設定」重新填';
    if (status === 403 && /rate limit/i.test(msg)) return 'GitHub 讀取次數用完了（未填權杖時每小時 60 次），稍後再試或填權杖';
    if (status === 403 || (status === 404 && writing)) {
      return `這個權杖不能寫入 ${where}。請確認權杖有勾 ${repo}、Contents 是 Read and write` +
        '（協作者要用 classic 權杖勾 public_repo，並先接受協作邀請）';
    }
    if (status === 404) return `在 ${where} 找不到這個檔案`;
    if (status === 409) return '有人剛改過這個檔案，請重新開啟後再保存';
    if (status === 422) return `GitHub 拒絕：${msg}`;
    return `${status} ${msg}`;
  }

  // 列出某個資料夾（units、weapons）底下所有 .json（任意層），附 sha 以便快取
  async function listFiles(root) {
    const { owner, repo, branch } = getConfig();
    const r = await gh(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const data = await r.json();
    const re = new RegExp('^' + root + '/.+\\.json$');
    return (data.tree || [])
      .filter((n) => n.type === 'blob' && re.test(n.path))
      .map((n) => ({ path: n.path, sha: n.sha }));
  }
  const listUnitFiles = () => listFiles('units');

  // 讀整包資料：網站上有發布好的 units.json／weapons.json 就用它（一個檔、不用權杖），
  // 沒有（例如在自己電腦測試）才逐檔讀 repo。includeRepo=true 時一律讀 repo（剛保存、還沒發布的也看得到）
  async function loadBundle(root, bundleUrl, includeRepo) {
    if (!includeRepo) {
      try {
        const r = await fetch(bundleUrl, { cache: 'no-cache' });
        if (r.ok) { const j = await r.json(); return j.units || j.items || []; }
      } catch (e) { /* 改讀 repo */ }
    }
    const files = await listFiles(root);
    const out = [];
    const queue = files.slice();
    async function worker() {
      while (queue.length) {
        const f = queue.shift();
        try { out.push({ path: f.path, data: await loadBlob(f.sha) }); } catch (e) { console.warn('讀不到', f.path, e); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(6, files.length) }, worker));
    return out;
  }
  // 用 sha 讀檔（內容不會變，可以永久快取）
  async function loadBlob(sha) {
    const { owner, repo } = getConfig();
    const r = await gh(`/repos/${owner}/${repo}/git/blobs/${sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } });
    return JSON.parse(await r.text());
  }

  async function loadUnit(path) {
    const { owner, repo, branch } = getConfig();
    const r = await gh(`/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`,
      { headers: { Accept: 'application/vnd.github.raw+json' } });
    return JSON.parse(await r.text());
  }

  function b64utf8(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // 新增或覆蓋一個檔案（一次 commit）
  async function saveFile(path, obj, message) { return saveUnit(path, obj, message); }
  // 刪除一個檔案（一次 commit；歷史裡還找得到）。用在單位改了分類或名稱、搬到新路徑後清掉舊檔
  async function deleteFile(path, message) {
    const cfg = getConfig();
    if (!cfg.token) { const e = new Error('還沒填 GitHub 權杖'); e.status = 0; throw e; }
    const { owner, repo, branch } = cfg;
    let sha;
    try {
      const r = await gh(`/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`);
      sha = (await r.json()).sha;
    } catch (e) { if (e.status === 404) return false; throw e; }
    await gh(`/repos/${owner}/${repo}/contents/${encPath(path)}`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, branch, sha }),
    });
    return true;
  }
  async function saveUnit(path, obj, message) {
    const cfg = getConfig();
    if (!cfg.token) { const e = new Error('還沒填 GitHub 權杖，請先到「GitHub 設定」'); e.status = 0; throw e; }
    const { owner, repo, branch } = cfg;
    let sha;
    try {
      const r = await gh(`/repos/${owner}/${repo}/contents/${encPath(path)}?ref=${encodeURIComponent(branch)}`);
      sha = (await r.json()).sha;
    } catch (e) { if (e.status !== 404) throw e; }
    const body = { message, branch, content: b64utf8(JSON.stringify(obj, null, 2) + '\n') };
    if (sha) body.sha = sha;
    const r = await gh(`/repos/${owner}/${repo}/contents/${encPath(path)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    return { path, created: !sha, commitUrl: j.commit && j.commit.html_url };
  }

  // 測試：讀得到 repo、權杖有沒有寫入權限
  // 測試：讀得到 repo 嗎？權杖真的能寫入嗎？
  // 寫入用「建立一個沒被引用的 blob」來試：需要 Contents 寫入權限，但不會產生 commit、repo 內容不變
  async function test() {
    const { owner, repo, token } = getConfig();
    const r = await gh(`/repos/${owner}/${repo}`);
    const j = await r.json();
    let canPush = false, pushError = '';
    if (token) {
      try {
        await gh(`/repos/${owner}/${repo}/git/blobs`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: 'taktik 權限測試', encoding: 'utf-8' }),
        });
        canPush = true;
      } catch (e) { pushError = e.message; }
    }
    return { fullName: j.full_name, canPush, pushError, hasToken: !!token };
  }

  global.TaktikRepo = { getConfig, setConfig, unitPath, weaponPath, listFiles, listUnitFiles, loadBundle, loadBlob, loadUnit, saveUnit, saveFile, deleteFile, test };
})(window);
