import { error } from '@sveltejs/kit';
import { calendarResponse } from '$lib/server/obligationCalendar';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, params, url }) => {
	if (!/^[a-f0-9]{64}$/.test(params.token)) error(404, 'Calendar not found');
	const database = platform!.env.AccountingDatabase;
	const token = await database
		.prepare(
			`
		SELECT calendar_tokens.id FROM calendar_tokens
		JOIN users ON users.email = calendar_tokens.by_user
		WHERE calendar_tokens.token = ? AND users.deleted_at IS NULL
	`
		)
		.bind(params.token)
		.first();
	if (!token) error(404, 'Calendar not found');
	return calendarResponse(database, url.origin);
};
