const TREX_CACHE_NAME = "trex-runtime-v1";

self.addEventListener("install", event => {
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil((async () => {
        const allClients = await clients.matchAll({ type: "window", includeUncontrolled: true });
        const openClient = allClients.find(client => "focus" in client);
        if (openClient) {
            await openClient.focus();
            return;
        }
        if (clients.openWindow) {
            await clients.openWindow("./");
        }
    })());
});
