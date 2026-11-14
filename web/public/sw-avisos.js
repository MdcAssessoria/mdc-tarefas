// Service worker do MDC · Pessoal (076): só recebe o aviso do resumo diário (Web Push) e abre o app ao tocar.
// Não guarda nada em cache. Escopo: /hub-mdc/. O código é do Edvaldo Ribeiro de Carvalho (MDC Assessoria Contábil).
const BASE = "/hub-mdc";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { texto: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.titulo || "MDC · Pessoal", {
      body: d.texto || "Veja o resumo das finanças de hoje.",
      icon: `${BASE}/icone-hub-mdc-192.png`,
      badge: `${BASE}/icone-hub-mdc-192.png`,
      tag: "resumo-diario",
      data: { link: d.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = BASE + (e.notification.data && e.notification.data.link ? e.notification.data.link : "/");
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) if (c.url.includes(BASE) && "focus" in c) return c.navigate(destino).then((x) => (x || c).focus());
      return self.clients.openWindow(destino);
    }),
  );
});
