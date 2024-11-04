import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import {
  NavigationRoute,
  registerRoute,
} from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope;

// @ts-ignore
self.__WB_DISABLE_DEV_LOGS = true;

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // delete old i18n cache
  event.waitUntil(caches.delete("i18n-cache"));
  if (
    "Notification" in self &&
    Notification.permission === "granted"
  ) {
    self.registration.showNotification("Weblink", {
      body: "Weblink is ready",
    });
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING")
    self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === "/share") {
    if (event.request.method === "POST") {
      event.respondWith(
        (async () => {
          const formData = await event.request.formData();
          let name = formData.get("name") as
            | string
            | undefined;
          let description = formData.get("description") as
            | string
            | undefined;
          let link = formData.get("link") as
            | string
            | undefined;
          let files =
            (formData.getAll("files") as File[]) ??
            undefined;

          name = name ? decodeURI(name) : undefined;

          description = description
            ? decodeURI(description)
            : undefined;
          link = link ? decodeURI(link) : undefined;

          const data: ShareData = {
            title: name,
            text: description,
            url: link,
            files,
          };

          const clients = await self.clients.matchAll({
            includeUncontrolled: true,
          });
          for (const client of clients) {
            client.postMessage({
              action: "share-target",
              data,
            });
          }

          const redirectUrl = new URL(
            "/close-window",
            location.origin,
          );

          return Response.redirect(redirectUrl, 303);
        })(),
      );
    }
  }
});

// Clean old assets
cleanupOutdatedCaches();

// Allow work offline
registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL("index.html"),
  ),
);

// Cache i18n JSON files
registerRoute(
  ({ request }) =>
    request.url.includes("/i18n/") &&
    request.url.endsWith(".json"),
  new CacheFirst({
    cacheName: "i18n-cache",
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
);
