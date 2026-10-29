// Loaded into the service worker (see workbox.importScripts in vite.config.ts).
// On Android, "Share → Shelf to Stacks" on an export file sends it here as a form POST.
// The file is parked in a cache and the app picks it up at /?shared=1.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.pathname !== "/share-target") return;
  event.respondWith(
    (async () => {
      try {
        const form = await event.request.formData();
        const file = form.getAll("file").find((f) => f && typeof f !== "string");
        if (file) {
          const cache = await caches.open("share-target");
          await cache.put(
            "/shared-file",
            new Response(file, { headers: { "x-file-name": encodeURIComponent(file.name || "export.csv") } }),
          );
        }
      } catch (e) {
        // Nothing to import; the app just opens normally.
      }
      return Response.redirect("/?shared=1", 303);
    })(),
  );
});
