// Service worker dos avisos do HUB (Web Push): resumo diário do MDC · Pessoal (076) e lembretes de compromisso das
// Tarefas (089, 10 min antes e na hora). Só mostra o aviso e abre o HUB ao tocar.
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
      // uma marca por destino: quem está em duas famílias recebe os dois resumos (079); o "Agora" de uma tarefa
      // substitui o "Em 10 minutos" dela e toca de novo (renotify)
      tag: "resumo-" + (d.link || "/"),
      renotify: true,
      data: { link: d.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = BASE + (e.notification.data && e.notification.data.link ? e.notification.data.link : "/");
  // a aba que já está nesta família só ganha foco; senão abre uma janela nova (nunca troca uma aba com trabalho aberto)
  const alvo = new URL(destino, self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) if (c.url === alvo && "focus" in c) return c.focus();
      return self.clients.openWindow(destino);
    }),
  );
});
