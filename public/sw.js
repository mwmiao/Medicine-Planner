// Service worker simples: guarda a app em cache para funcionar sem internet.
// - Páginas: rede primeiro, cache se estiver offline.
// - Ficheiros estáticos (/_next/static, ícones) e dados do OCR: cache primeiro.
// Os dados do utilizador vivem no IndexedDB e não passam por aqui.

const VERSION = "v1";
const APP_CACHE = `mp-app-${VERSION}`;
const RUNTIME_CACHE = `mp-runtime-${VERSION}`;
const PAGES = ["/", "/history/", "/medications/", "/medications/new/", "/medications/view/", "/medications/edit/", "/settings/"];
const STATIC = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

// Ficheiros do Tesseract.js (worker, núcleo WASM e idiomas) vêm destes CDNs.
const OCR_HOSTS = ["cdn.jsdelivr.net", "unpkg.com", "tessdata.projectnaptha.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE);
      await cache.addAll(STATIC);
      // Guarda cada página e os scripts que ela usa, para todas funcionarem offline.
      for (const page of PAGES) {
        try {
          const res = await fetch(page, { cache: "no-cache" });
          if (!res.ok) continue;
          await cache.put(page, res.clone());
          const html = await res.text();
          const assets = [...html.matchAll(/["'](\/_next\/static\/[^"'?#\s]+)["']/g)].map((x) => x[1]);
          await Promise.all([...new Set(assets)].map((a) => cache.add(a).catch(() => undefined)));
        } catch {
          // offline durante a instalação: fica para a próxima
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => ![APP_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

async function networkFirstPage(request) {
  const url = new URL(request.url);
  try {
    const res = await fetch(request);
    if (res.ok) {
      const cache = await caches.open(APP_CACHE);
      cache.put(url.pathname, res.clone());
    }
    return res;
  } catch {
    const cached = (await caches.match(url.pathname, { ignoreSearch: true })) || (await caches.match("/"));
    return cached || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request));
    } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request));
    } else if (url.pathname.endsWith(".txt")) {
      // Dados de navegação do Next.js: rede primeiro, cache quando offline.
      event.respondWith(fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(async () => (await caches.match(request, { ignoreSearch: true })) || Response.error()));
    }
    return;
  }

  if (OCR_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (all.length) return all[0].focus();
      return self.clients.openWindow("/");
    })(),
  );
});

// Web Push não está ativo (ver src/lib/push.ts). Se for ativado no futuro,
// tratar aqui o evento "push" com self.registration.showNotification(...).
