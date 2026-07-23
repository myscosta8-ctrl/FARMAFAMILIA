// ============================================================
//  Service worker do Farma Família.
//
//  Estratégia: REDE PRIMEIRO, cache como reserva.
//  Isso é importante: assim que você publica uma atualização no
//  GitHub, todo mundo recebe a versão nova ao abrir o app.
//  O cache serve só para o app continuar abrindo sem internet.
// ============================================================

const CACHE = "farmafamilia-v1";
const ARQUIVOS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icone-192.png",
  "./icone-512.png",
  "./logo.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        // guarda a versão mais recente no cache
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia)).catch(() => {});
        return resp;
      })
      .catch(() =>
        // sem internet: usa o que estiver guardado
        caches.match(e.request).then((r) => r || caches.match("./index.html"))
      )
  );
});
