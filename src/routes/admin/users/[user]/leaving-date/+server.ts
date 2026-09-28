import { error, json } from '@sveltejs/kit';
import { parseDateInput } from '$lib/date';
import { requireAdmin } from '$lib/server/admin';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, platform, params, request, url }) => {
	const admin = requireAdmin(locals.user);
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin');
	const body = (await request.json().catch(() => null)) as { leavingDate?: unknown } | null;
	const value = body?.leavingDate;
	if (typeof value !== 'string') error(400, 'A valid leaving date is required');
	const leftAt = parseDateInput(value);
	if (leftAt === null) error(400, 'A valid leaving date is required');

	const database = platform!.env.AccountingDatabase;
	const user = await database
		.prepare('SELECT email FROM users WHERE email = ? AND deleted_at IS NULL')
		.bind(params.user)
		.first();
	if (!user) error(404, 'User not found');

	await database.batch([
		database
			.prepare(
				'UPDATE users SET left_at = ?, session_token = NULL, session_expiry = NULL WHERE email = ? AND deleted_at IS NULL'
			)
			.bind(leftAt, params.user),
		database.prepare('DELETE FROM calendar_tokens WHERE by_user = ?').bind(params.user),
		database
			.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
			.bind(
				admin.email,
				`Set leaving date for ${params.user} to ${value}; sign-in disabled`,
				Math.floor(Date.now() / 1000)
			)
	]);
	return json({ ok: true });
};
