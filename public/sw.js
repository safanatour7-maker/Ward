// Simple Service Worker for PWA installability and native Notification handling
const CACHE_NAME = "ward-app-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/manifest.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  // Let the browser handle network requests normally, fallback to cache if offline
  e.respondWith(
    fetch(e.request).catch(() => {
      return caches.match(e.request);
    })
  );
});

// Handle notification clicks - open app and navigate to specific route
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  
  const type = event.notification.data?.type || "quran";
  const customUrl = event.notification.data?.url;
  
  let path = customUrl || "/";
  if (!customUrl) {
    if (type === "quran" || type === "quran_daily") {
      path = "/quran";
    } else if (type === "athkar") {
      path = "/athkar";
    } else if (type === "habits_weekly" || type === "habits_daily") {
      path = "/habits";
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and notify navigation
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ("focus" in client) {
          client.postMessage({ action: "navigate", url: path });
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(path);
      }
    })
  );
});
