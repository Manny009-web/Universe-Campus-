const V = "universe-v3";
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    e.respondWith(
      fetch(r).then(res => {
        const cp = res.clone();
        caches.open(V).then(c => c.put(r, cp));
        return res;
      }).catch(() => caches.match(r).then(m => m || caches.match("index.html")))
    );
  } else if (u.hostname === "www.gstatic.com" && u.pathname.indexOf("/firebasejs/") === 0) {
    e.respondWith(
      caches.match(r).then(m => m || fetch(r).then(res => {
        const cp = res.clone();
        caches.open(V).then(c => c.put(r, cp));
        return res;
      }))
    );
  }
});

/* Push notifications (from Firebase Cloud Messaging or the app) */
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { try { d = { notification: { body: e.data.text() } }; } catch (y) {} }
  const n = d.notification || d.data || d || {};
  const title = n.title || "UNIVERSE: you have a new notification";
  const body = n.body || "Open UNIVERSE to see what's new.";
  const url = (d.data && d.data.url) || (d.fcmOptions && d.fcmOptions.link) || "./#inbox";
  e.waitUntil(self.registration.showNotification(title, {
    body: body, icon: "icon-192.png", badge: "icon-192.png", vibrate: [120, 60, 120],
    tag: "uv-push", renotify: true, data: { url: url }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) {
        try { if (url.indexOf("#") >= 0 && "navigate" in c) c.navigate(new URL(url, self.registration.scope).href); } catch (x) {}
        return c.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
