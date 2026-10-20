export function isPushEndpoint(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2048) return false;
	try {
		const url = new URL(value);
		return (
			url.protocol === 'https:' &&
			!url.username &&
			!url.password &&
			!url.port &&
			!url.hash &&
			(url.hostname === 'fcm.googleapis.com' ||
				url.hostname === 'web.push.apple.com' ||
				url.hostname.endsWith('.push.apple.com') ||
				url.hostname === 'updates.push.services.mozilla.com' ||
				url.hostname.endsWith('.notify.windows.com'))
		);
	} catch {
		return false;
	}
}

export function validPushKey(value: unknown, bytes: number): value is string {
	if (typeof value !== 'string' || !/^[\w-]+={0,2}$/.test(value)) return false;
	try {
		const decoded = Buffer.from(value, 'base64url');
		return decoded.length === bytes && (bytes !== 65 || decoded[0] === 4);
	} catch {
		return false;
	}
}
