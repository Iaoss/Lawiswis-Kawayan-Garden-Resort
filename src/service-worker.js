/* eslint-disable no-restricted-globals */
// Offline support: keeps the website's own files (the app, styles, fonts,
// icons and photos already seen) on this computer, so the staff portal still
// opens when the internet is down. Bookings and payments themselves come
// from Firebase's offline copy and the staff outbox, not from here.
//
// Create React App builds this file into /service-worker.js.
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { firebaseConfig } from './firebase/firebaseConfig';

clientsClaim();
self.skipWaiting();

const firebaseApp = initializeApp(firebaseConfig);
const messaging = getMessaging(firebaseApp);
onBackgroundMessage(messaging, payload => {
  self.registration.showNotification(payload.notification?.title || 'Resort staff alert', {
    body: payload.notification?.body || '',
    icon: '/logo192.png',
    badge: '/favicon.ico',
    vibrate: [250, 120, 250],
    data: { url: payload.data?.url || '/' },
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    if (existing) {
      existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  }));
});

// The app's built files (JavaScript, CSS, index.html).
precacheAndRoute(self.__WB_MANIFEST);

// Every page address opens the app (index.html), except the API and real files.
const fileExtension = /\/[^/?]+\.[^/]+$/;
registerRoute(
  ({ request, url }) => request.mode === 'navigate'
    && url.origin === self.location.origin
    && !url.pathname.startsWith('/api/')
    && !fileExtension.test(url.pathname),
  createHandlerBoundToURL(`${process.env.PUBLIC_URL}/index.html`),
);

// Fonts and the icon font (Google Fonts, jsDelivr).
registerRoute(
  ({ url }) => ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname),
  new StaleWhileRevalidate({ cacheName: 'fonts-and-icons' }),
);

// Photos (rooms, logos): keep up to 300 for 30 days.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({ cacheName: 'images', plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 })] }),
);
