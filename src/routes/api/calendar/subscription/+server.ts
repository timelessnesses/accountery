import { error, json } from '@sveltejs/kit';
import { requireCalendarUser } from '$lib/server/obligationCalendar';
import type { RequestHandler } from './$types';

const headers = { 'Cache-Control': 'private, no-store' };

function checkOrigin(request: Request, url: URL) {
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin');
}

export const GET: RequestHandler = async ({ platform, locals, url }) => {
	const database = platform!.env.AccountingDatabase;
	const email = await requireCalendarUser(database, locals.user);
	const existing = await database
		.prepare('SELECT token FROM calendar_tokens WHERE by_user = ? ORDER BY id DESC LIMIT 1')
		.bind(email)
		.first<{ token: string }>();
	return json(
		{ url: existing ? `${url.origin}/api/calendar/${existing.token}` : null },
		{ headers }
	);
};

export const POST: RequestHandler = async ({ platform, locals, url, request }) => {
	checkOrigin(request, url);
	const database = platform!.env.AccountingDatabase;
	const email = await requireCalendarUser(database, locals.user);
	const existing = await database
		.prepare('SELECT token FROM calendar_tokens WHERE by_user = ? ORDER BY id DESC LIMIT 1')
		.bind(email)
		.first<{ token: string }>();
	let token = existing?.token;
	if (!token) {
		token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
			byte.toString(16).padStart(2, '0')
		).join('');
		await database
			.prepare('INSERT INTO calendar_tokens (token, created_at, by_user) VALUES (?, ?, ?)')
			.bind(token, Math.floor(Date.now() / 1000), email)
			.run();
	}
	return json({ url: `${url.origin}/api/calendar/${token}` }, { headers });
};

export const DELETE: RequestHandler = async ({ platform, locals, request, url }) => {
	checkOrigin(request, url);
	const database = platform!.env.AccountingDatabase;
	const email = await requireCalendarUser(database, locals.user);
	await database.prepare('DELETE FROM calendar_tokens WHERE by_user = ?').bind(email).run();
	return json({ ok: true }, { headers });
};
