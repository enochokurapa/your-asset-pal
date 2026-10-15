// AssetFlow is an online application. Do not cache branding, pages, APIs or bundles.
const CACHE_NAME = "assetflow-pwa-v4";
self.addEventListener("install", (event) => { self.skipWaiting(); });
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("assetflow-pwa-")).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", () => {
  // Always use the browser network stack; no stale AssetFlow cached responses.
});
self.addEventListener("message", event => {
  if(event.data === "SKIP_WAITING") self.skipWaiting();
});
