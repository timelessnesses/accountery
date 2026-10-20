import { base, resolve } from '$app/paths';

export function supportsNotifications() {
	return (
		typeof window !== 'undefined' &&
		window.isSecureContext &&
		'Notification' in window &&
		'serviceWorker' in navigator &&
		'PushManager' in window
	);
}

export async function notificationStatus() {
	if (!supportsNotifications()) return { publicKey: null, subscribed: false };
	const registration = await navigator.serviceWorker.getRegistration(`${location.origin}${base}/`);
	const subscription = await registration?.pushManager.getSubscription();
	const query = subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : '';
	const response = await fetch(resolve('/api/notifications') + query);
	if (!response.ok) throw new Error('Unable to check notification settings.');
	return (await response.json()) as { publicKey: string | null; subscribed: boolean };
}

export async function registerServiceWorker(vapidPublicKey: string) {
	if (!supportsNotifications())
		throw new Error(
			'Notifications are unavailable. On iPhone or iPad, add this app to your Home Screen first.'
		);
	if (!vapidPublicKey) throw new Error('Push notifications have not been configured.');
	// Keep the permission request within the user's click, before any network work.
	const permission = await Notification.requestPermission();
	if (permission !== 'granted')
		throw new Error(
			permission === 'denied'
				? 'Notifications are blocked. Allow them in your browser settings, then try again.'
				: 'Notification permission was not granted.'
		);
	await navigator.serviceWorker.register(`${base}/service-worker.js`, {
		scope: `${base}/`,
		updateViaCache: 'none'
	});
	const registration = await navigator.serviceWorker.ready;
	let subscription = await registration.pushManager.getSubscription();
	const key = Uint8Array.from(atob(vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
		c.charCodeAt(0)
	);
	const existingKey = subscription?.options.applicationServerKey;
	if (existingKey && !new Uint8Array(existingKey).every((byte, i) => byte === key[i])) {
		await subscription!.unsubscribe();
		subscription = null;
	}
	subscription ??= await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: key
	});
	const response = await fetch(resolve('/api/notifications'), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(subscription.toJSON())
	});
	if (!response.ok) {
		const body = (await response.json().catch(() => null)) as { message?: string } | null;
		throw new Error(
			body?.message ?? 'Unable to save the notification subscription. Please try again.'
		);
	}
}

export async function unregisterServiceWorker() {
	if (!('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration(`${location.origin}${base}/`);
	const subscription = await registration?.pushManager.getSubscription();
	if (!subscription) return;
	try {
		const response = await fetch(resolve('/api/notifications'), {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ endpoint: subscription.endpoint })
		});
		if (!response.ok) throw new Error('Unable to remove this device’s notification subscription.');
	} finally {
		await subscription.unsubscribe();
	}
	// The app's worker remains registered for its PWA features.
}
