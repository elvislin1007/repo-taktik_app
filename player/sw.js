// 圖鑑 App 的 service worker：有網路時一律拿最新檔案（改版刷新就生效），沒網路時用上次的檔案。
// 不快取 GitHub API（單位資料由頁面自己存在這台裝置）。
const CACHE = 'taktik-player-v6';
const SHELL = [
  './', './index.html', './player.css', './player.js', './manifest.webmanifest',
  './icons/app-192.png', './icons/app-512.png',
  '../card.css', '../calc.js', '../repo.js', '../cardview.js', '../keywords.js',
  '../icons/ranged.png', '../icons/melee.png', '../icons/shield.png', '../icons/grenade.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    // cache: 'no-cache' = 每次都跟伺服器確認有沒有新版（沒改過就很快），改版後刷新馬上生效
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
