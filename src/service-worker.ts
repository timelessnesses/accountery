/// <reference lib="webworker" />

const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

serviceWorker.addEventListener('install', (event) => {
	event.waitUntil(serviceWorker.skipWaiting());
});

serviceWorker.addEventListener('activate', (event) => {
	event.waitUntil(serviceWorker.clients.claim());
});

serviceWorker.addEventListener('push', (event) => {
	const payload = event.data?.json() ?? {};
	const data = payload.data ?? {};
	const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';

	event.waitUntil(
		serviceWorker.registration.showNotification(payload.title ?? 'Accountery', {
			body: payload.body ?? '',
			icon: '/favicon.ico',
			badge: '/favicon.ico',
			data: { url }
		})
	);
});

serviceWorker.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = new URL(event.notification.data?.url ?? '/', serviceWorker.location.origin).href;
	event.waitUntil(
		(async () => {
			const clients = await serviceWorker.clients.matchAll({ type: 'window', includeUncontrolled: true });
			const current = clients.find((client) => new URL(client.url).origin === serviceWorker.location.origin);
			if (current) {
				await current.navigate(url);
				return current.focus();
			}
			return serviceWorker.clients.openWindow(url);
		})()
	);
});