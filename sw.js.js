const V = "universe-v4";
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

/* Alarm copy kept by the app so a push can be turned into an alarm even when the app is closed */
function swDb() { return new Promise((res, rej) => { const r = indexedDB.open("uv_sw", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function swGet(k) {
  try { const db = await swDb(); return await new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; }
}
/* the alarm that is due right now (this minute or the 3 before it), or null */
function swDue(cfg, now) {
  if (!cfg || !Array.isArray(cfg.list)) return null;
  const local = new Date(now - (cfg.tz || 0) * 60000), mins = local.getUTCHours() * 60 + local.getUTCMinutes(), day = local.getUTCDay();
  for (const a of cfg.list) {
    if (!a || !a.on || !/^\d{2}:\d{2}$/.test(a.t)) continue;
    const am = +a.t.slice(0, 2) * 60 + +a.t.slice(3);
    let diff = mins - am; if (diff < 0) diff += 1440;
    if (diff > 3) continue;
    if (a.d && a.d.length && a.d.indexOf(day) < 0) continue;
    return a;
  }
  return null;
}
function swClock(t) { const h = +t.slice(0, 2), m = t.slice(3); return ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM"); }

/* Push notifications (from Firebase Cloud Messaging, the app, or the alarm scheduler) */
self.addEventListener("push", e => {
  e.waitUntil((async () => {
    let d = {}, hasData = false;
    try { if (e.data) { hasData = true; d = e.data.json(); } } catch (x) { try { d = { notification: { body: e.data.text() } }; } catch (y) {} }
    if (!hasData) {
      const a = swDue(await swGet("alarms"), Date.now());
      if (a) {
        const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (open.some(c => c.visibilityState === "visible")) { open.forEach(c => { try { c.postMessage({ uvAlarm: 1 }); } catch (x) {} }); return; }
        return self.registration.showNotification("⏰ " + (a.l || "Alarm"), {
          body: swClock(a.t) + ". Tap to open UNIVERSE and switch it off.", icon: "icon-192.png", badge: "icon-192.png",
          vibrate: [800, 250, 800, 250, 800, 250, 800, 250, 800, 250, 800], tag: "uv-alarm", renotify: true, requireInteraction: true, silent: false,
          data: { url: "./#alarm" }
        });
      }
    }
    const n = d.notification || d.data || d || {};
    const title = n.title || "UNIVERSE: you have a new notification";
    const body = n.body || "Open UNIVERSE to see what's new.";
    const url = (d.data && d.data.url) || (d.fcmOptions && d.fcmOptions.link) || "./#inbox";
    return self.registration.showNotification(title, {
      body: body, icon: "icon-192.png", badge: "icon-192.png", vibrate: [120, 60, 120],
      tag: "uv-push", renotify: true, data: { url: url }
    });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ("focus" in c) {
        try { if (url.indexOf("#") >= 0 && "navigate" in c) c.navigate(new URL(url, self.registration.scope).href); } catch (x) {}
        try { c.postMessage({ uvAlarm: 1 }); } catch (x) {}
        return c.focus();
      }
    }
    return self.clients.openWindow ? self.clients.openWindow(url) : null;
  }));
});
