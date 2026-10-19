/// <reference lib="webworker" />

const serviceWorker = globalThis as unknown as ServiceWorkerGlobalScope;

// $app/paths is unavailable in service workers; the registration scope contains the app base.
function resolveAppUrl(path: string) {
	const scope = new URL(serviceWorker.registration.scope);
	const url = new URL(path.replace(/^\//, ''), scope);
	return url.origin === scope.origin && url.pathname.startsWith(scope.pathname)
		? url.href
		: scope.href;
}

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
			icon: resolveAppUrl('/favicon.gif'),
			badge: resolveAppUrl('/favicon.gif'),
			data: { url }
		})
	);
});

serviceWorker.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = resolveAppUrl(event.notification.data?.url ?? '/');
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
