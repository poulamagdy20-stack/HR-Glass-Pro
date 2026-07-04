const CACHE='hr-glass-pro-v14';
const ASSETS=['./','./index.html','./styles.css','./manifest.json','./firebase.js','./js/main.js','./js/utils.js','./js/i18n.js','./js/state.js','./js/db.js','./js/payroll.js','./assets/icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{ if(e.request.method!=='GET') return; e.respondWith(fetch(e.request).then(r=>{ const copy=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,copy)); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))); });
