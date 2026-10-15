// Service worker: recebe as notificações push, abre o app ao tocar nelas e
// dá baixa direto pelo botão "Já paguei / Já recebi" (sem abrir o app).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data && event.data.text() }; }
  const title = d.title || "Repasses de Cocorretagem";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "icons/icon-192.png",
    badge: "icons/favicon.png",
    actions: Array.isArray(d.actions) ? d.actions.slice(0, 2) : [],
    requireInteraction: !!d.baixa,
    data: { url: d.url || self.registration.scope, baixa: d.baixa || null, title, body: d.body || "", tag: d.tag || "" }
  }));
});

async function chamarBaixa(b, acao) {
  const r = await fetch(b.api, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: b.k, Authorization: "Bearer " + b.k },
    body: JSON.stringify({ t: b.t, acao })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.erro) throw new Error(j.erro || ("erro " + r.status));
  return j;
}
const brl = (n) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

async function abrir(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if (c.url.startsWith(self.registration.scope)) {
      if (url !== c.url && "navigate" in c) { try { await c.navigate(url); } catch (_) { /* ignora */ } }
      await c.focus(); return;
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  event.waitUntil((async () => {
    const b = data.baixa;
    if (b && (event.action === "baixa" || event.action === "desfazer")) {
      try {
        const j = await chamarBaixa(b, event.action === "baixa" ? "confirmar" : "desfazer");
        const rec = j.dir === "receber";
        if (event.action === "baixa") {
          await self.registration.showNotification(rec ? "Recebimento registrado" : "Pagamento registrado", {
            body: `${j.corretor} · ${brl(j.valor)} · apólice ${j.apolice}${j.ja ? " (já estava registrado)" : ""}`,
            tag: data.tag || undefined, icon: "icons/icon-192.png", badge: "icons/favicon.png",
            actions: j.ja ? [] : [{ action: "desfazer", title: "Desfazer" }],
            data: { ...data, url: self.registration.scope + "#repasses" }
          });
        } else {
          await self.registration.showNotification("Baixa desfeita", {
            body: `${j.corretor} · ${brl(j.valor)} voltou para em aberto.`,
            tag: data.tag || undefined, icon: "icons/icon-192.png", badge: "icons/favicon.png",
            actions: [{ action: "baixa", title: rec ? "Já recebi" : "Já paguei" }],
            data
          });
        }
        return;
      } catch (_) {
        // sem conexão ou link vencido: abre a confirmação no app
        await abrir(data.url || self.registration.scope);
        return;
      }
    }
    await abrir(data.url || self.registration.scope);
  })());
});
