import { base } from '$app/paths';

// Matches static/privacy-notice-markdown/v1.md (1.0.0).
export const PRIVACY_NOTICE_VERSION = 1;
export const PRIVACY_NOTICE_LABEL = '1.2';

export function safeNoticeReturnTo(value: unknown, appBase = base) {
	const fallback = `${appBase}/`;
	if (
		typeof value !== 'string' ||
		!value.startsWith('/') ||
		value.startsWith('//') ||
		value.includes('\\') ||
		[...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
	)
		return fallback;
	const url = new URL(value, 'https://internal.invalid');
	if (
		url.origin !== 'https://internal.invalid' ||
		(appBase && url.pathname !== appBase && !url.pathname.startsWith(`${appBase}/`))
	)
		return fallback;
	const path = url.pathname.slice(appBase.length).replace(/\/$/, '');
	if (['/login', '/privacy-notice', '/privacy-notice/__data.json'].includes(path)) return fallback;
	return url.pathname + url.search + url.hash;
}
