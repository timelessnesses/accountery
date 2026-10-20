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

// Native share launches can have an opaque Origin. Forward from the installed
// worker as a same-origin request, keeping SvelteKit's CSRF protection enabled.
serviceWorker.addEventListener('fetch', (event) => {
	const target = new URL('api/share_target', serviceWorker.registration.scope);
	if (event.request.method !== 'POST' || event.request.url !== target.href) return;
	event.respondWith(
		(async () => {
			const form = await event.request.formData();
			const response = await fetch(target, { method: 'POST', body: form, credentials: 'include' });
			// Navigation requests use manual redirects. Returning an already-followed
			// response causes Chromium to reject the navigation after saving the slip.
			return response.redirected ? Response.redirect(response.url, 303) : response;
		})()
	);
});

serviceWorker.addEventListener('push', (event) => {
	let payload;
	try {
		payload = event.data?.json() ?? {};
	} catch {
		payload = { body: event.data?.text() ?? '' };
	}
	if (!payload || typeof payload !== 'object') payload = {};
	const data = payload.data ?? {};
	const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';

	event.waitUntil(
		serviceWorker.registration.showNotification(payload.title ?? 'Accountery', {
			body: payload.body ?? '',
			icon: resolveAppUrl('/app-icon.png'),
			badge: resolveAppUrl('/app-icon.png'),
			tag: typeof payload.tag === 'string' ? payload.tag : undefined,
			data: { url }
		})
	);
});

serviceWorker.addEventListener('notificationclick', (event) => {
	event.notification.close();
	const url = resolveAppUrl(event.notification.data?.url ?? '/');
	event.waitUntil(
		(async () => {
			const clients = await serviceWorker.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});
			const current = clients.find(
				(client) => new URL(client.url).origin === serviceWorker.location.origin
			);
			if (current) {
				await current.navigate(url);
				return current.focus();
			}
			return serviceWorker.clients.openWindow(url);
		})()
	);
});
