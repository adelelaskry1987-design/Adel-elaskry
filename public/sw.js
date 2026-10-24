/**
 * Service Worker — يجعل التطبيق قابلًا للتثبيت ويعمل عند انقطاع النت لحظيًا.
 * =====================================================================
 * قواعد صارمة لكي لا نكسر شيئًا:
 * - لا نلمس أي طلب لـ Firebase/Google (تسجيل الدخول وFirestore يعملان كما هما دائمًا).
 * - لا نخزّن أي استجابة غير ناجحة (ok) — حتى لا يظهر خطأ محفوظ.
 * - لا نتدخّل في POST/PUT، ولا في نطاق آخر.
 * - الصفحات: نحاول الشبكة أولًا (أحدث نسخة)، ونرجع للنسخة المحفوظة عند انقطاع النت.
 * - الملفات الثابتة (JS/CSS/أيقونات): من الكاش فورًا مع تحديث في الخلفية.
 */
const VERSION = 'ah2-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL = ['./', './index.html', './import.html', './manifest.webmanifest'];

const isCacheable = (url) => url.origin === self.location.origin;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL.map((u) =>
          cache.add(new Request(u, { cache: 'reload' })).catch(() => {
            /* ملف غير موجود لا يُفشل التثبيت */
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (!isCacheable(url)) return; // Firebase / Google / أي خدمة خارجية: شبكة فقط

  // طلبات التنقّل (فتح صفحة) — شبكة أولًا ثم الكاش
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(req)) ||
            (await cache.match('./index.html')) ||
            new Response('لا يوجد اتصال بالإنترنت', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // ملفات ثابتة — كاش مع تحديث خلفي
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});
