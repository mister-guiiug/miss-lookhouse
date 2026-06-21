/* global self */
// Handler Web Push — importé par le service worker Workbox (importScripts).
// Affiche la notification reçue et ouvre/focalise l'app au clic. Sans dépendance.

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = {
      title: 'Miss LookHouse',
      body: event.data ? event.data.text() : '',
    };
  }
  const title = data.title || 'Miss LookHouse';
  const options = {
    body: data.body || '',
    icon: 'favicon.svg',
    badge: 'favicon.svg',
    tag: data.tag || undefined,
    data: { url: data.url || './' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if ('focus' in client) return client.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
