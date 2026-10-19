import { base, resolve } from '$app/paths';

const NOTIFICATIONS_OPT_OUT_KEY = 'notifications-opted-out';

export function notificationsOptedOut() {
	try {
		return localStorage.getItem(NOTIFICATIONS_OPT_OUT_KEY) === 'true';
	} catch {
		return false;
	}
}

function setNotificationsOptedOut(optedOut: boolean) {
	try {
		if (optedOut) localStorage.setItem(NOTIFICATIONS_OPT_OUT_KEY, 'true');
		else localStorage.removeItem(NOTIFICATIONS_OPT_OUT_KEY);
	} catch {
		// Storage can be unavailable in private browsing modes.
	}
}

// export async function requestForNotificationPermission() {
// 	console.log('push notifications permission request...');
// 	setNotificationsOptedOut(false);
// 	await PushNotifications.addListener('registration', (token) => {
// 		console.log('received FCM registration token');
// 		try {
// 			localStorage.setItem(FCM_TOKEN_KEY, token.value);
// 		} catch {
// 			// The server registration still works when local storage is unavailable.
// 		}
// 		fetch('/api/fcm', {
// 			method: 'POST',
// 			body: JSON.stringify({ token: token.value })
// 		});
// 	});

// 	if ((await PushNotifications.checkPermissions()).receive !== 'granted') {
// 		console.log('requesting push notifications permission...');
// 		await PushNotifications.requestPermissions();
// 	}
// 	console.log('registering for push notifications...');
// 	await PushNotifications.register();
// }

// export async function unregisterPushNotifications() {
// 	console.log('unregistering push notifications...');
// 	setNotificationsOptedOut(true);
// 	await PushNotifications.unregister();
// 	let token = '';
// 	try {
// 		token = localStorage.getItem(FCM_TOKEN_KEY) ?? '';
// 	} catch {
// 		// Fall back to deleting every token for this account.
// 	}
// 	const response = await fetch('/api/fcm', {
// 		method: 'DELETE',
// 		body: token ? JSON.stringify({ token }) : undefined
// 	});
// 	if (!response.ok) throw new Error(`Failed to remove FCM subscription (${response.status})`);
// 	try {
// 		localStorage.removeItem(FCM_TOKEN_KEY);
// 	} catch {
// 		// Ignore storage cleanup failures after the server token has been removed.
// 	}
// }

export async function unregisterServiceWorker() {
	console.log('unsubscribing from web push...');
	setNotificationsOptedOut(true);
	if ('serviceWorker' in navigator) {
		const registrations = await navigator.serviceWorker.getRegistrations();
		for (const registration of registrations) {
			const subscription = await registration.pushManager.getSubscription();
			await subscription?.unsubscribe();
			await registration.unregister();
		}
	}
	const response = await fetch(resolve('/api/notifications'), {
		method: 'DELETE'
	});
	if (!response.ok) throw new Error(`Failed to remove web push subscription (${response.status})`);
}

export async function registerServiceWorker(vapidPublicKey: string) {
	console.log('registering service worker...');
	setNotificationsOptedOut(false);
	if ('serviceWorker' in navigator) {
		const permission = await Notification.requestPermission();
		console.log('notification permission:', permission);
		console.log('service worker supported, registering...');
		if (!vapidPublicKey) return;
		const sw = await navigator.serviceWorker.register(`${base}/service-worker.js`, {
			scope: `${base}/`,
			updateViaCache: 'none'
		});
		await sw.update();
		await navigator.serviceWorker.ready;
		console.log('service worker registered:', sw);
		if (permission === 'granted') {
			console.log('notification permission granted, subscribing to push notifications...');
			const subscription = await sw.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
			});
			console.log('webpush subscription:', subscription);
			await fetch(resolve('/api/notifications'), {
				method: 'POST',
				body: JSON.stringify(subscription.toJSON())
			});
		}
	}
}

function urlBase64ToUint8Array(base64String: string) {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
