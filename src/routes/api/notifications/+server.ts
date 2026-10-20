import { error, json } from '@sveltejs/kit';
import { isPushEndpoint, validPushKey } from '$lib/server/pushSubscription';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, platform, url }) => {
	if (!locals.user) error(401, 'Sign in to enable notifications.');
	const endpoint = url.searchParams.get('endpoint');
	const subscription = endpoint
		? await platform!.env.AccountingDatabase.prepare(
				'SELECT endpoint FROM notifications WHERE endpoint = ? AND email = ?'
			)
				.bind(endpoint, locals.user.email)
				.first()
		: null;
	return json(
		{ publicKey: platform!.env.VAPID_PUBLIC_KEY || null, subscribed: !!subscription },
		{
			headers: { 'cache-control': 'no-store' }
		}
	);
};

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) error(401, 'Sign in to enable notifications.');
	if (!platform!.env.VAPID_PUBLIC_KEY || !platform!.env.VAPID_PRIVATE_KEY)
		error(503, 'Push notifications have not been configured.');
	const body = (await request.json().catch(() => error(400, 'Invalid JSON.'))) as {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	} | null;
	if (!body || typeof body.endpoint !== 'string')
		error(400, 'A subscription endpoint is required.');
	if (!body.keys || typeof body.keys.p256dh !== 'string' || typeof body.keys.auth !== 'string')
		error(400, 'Subscription keys are required.');
	if (
		!isPushEndpoint(body.endpoint) ||
		!validPushKey(body.keys.p256dh, 65) ||
		!validPushKey(body.keys.auth, 16)
	)
		error(400, 'Invalid push subscription.');
	const db = platform!.env.AccountingDatabase;
	await db.batch([
		db.prepare('DELETE FROM notifications WHERE endpoint = ?').bind(body.endpoint),
		db
			.prepare('INSERT INTO notifications (endpoint, email, p256dh, auth) VALUES (?, ?, ?, ?)')
			.bind(body.endpoint, locals.user.email, body.keys.p256dh, body.keys.auth)
	]);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) error(401, 'Sign in to disable notifications.');
	const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
	if (!isPushEndpoint(body?.endpoint)) error(400, 'A subscription endpoint is required.');
	await platform!.env.AccountingDatabase.prepare(
		'DELETE FROM notifications WHERE email = ? AND endpoint = ?'
	)
		.bind(locals.user.email, body.endpoint)
		.run();
	return json({ ok: true });
};
