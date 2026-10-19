import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './subscription/$types';

export const POST: RequestHandler = async ({ locals, platform, request }) => {
	if (!locals.user) error(401, 'Sign in to enable notifications.');
	if (!env.VAPID_PUBLIC_KEY) error(503, 'Push notifications have not been configured.');
	const body = (await request.json().catch(() => error(400, 'Invalid JSON.'))) as {
		endpoint?: unknown;
		keys?: { p256dh?: unknown; auth?: unknown };
	} | null;
	if (!body || typeof body.endpoint !== 'string')
		error(400, 'A subscription endpoint is required.');
	if (!body.keys || typeof body.keys.p256dh !== 'string' || typeof body.keys.auth !== 'string')
		error(400, 'Subscription keys are required.');
	const db = platform!.env.AccountingDatabase;
	await db.batch([
		db
			.prepare(
				`DELETE FROM push_deliveries WHERE endpoint = ? AND EXISTS
			(SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND email != ?)`
			)
			.bind(body.endpoint, body.endpoint, locals.user.email),
		db
			.prepare(
				`INSERT INTO push_subscriptions (endpoint, email, p256dh, auth)
			VALUES (?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET email = excluded.email,
			p256dh = excluded.p256dh, auth = excluded.auth,
			created_at = CASE WHEN email != excluded.email THEN unixepoch() ELSE created_at END`
			)
			.bind(body.endpoint, locals.user.email, body.keys.p256dh, body.keys.auth)
	]);
	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ locals, platform }) => {
	if (!locals.user) error(401, 'Sign in to disable notifications.');
	await platform!.env.AccountingDatabase.prepare(
		'DELETE FROM push_subscriptions WHERE email = ?'
	)
		.bind(locals.user.email)
		.run();
	return json({ ok: true });
};
