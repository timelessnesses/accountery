import { error, json } from '@sveltejs/kit';
import { parseDateInput } from '$lib/date';
import { requireAdmin } from '$lib/server/admin';
import { anonymizeDepartedUser } from '$lib/server/anonymizeUser';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, platform, params, request, url }) => {
	const admin = requireAdmin(locals.user);
	if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin');
	const body = (await request.json().catch(() => null)) as { leavingDate?: unknown } | null;
	const value = body?.leavingDate;
	if (typeof value !== 'string') error(400, 'A valid leaving date is required');
	const leftAt = parseDateInput(value);
	if (leftAt === null) error(400, 'A valid leaving date is required');

	return json({
		ok: true,
		...(await anonymizeDepartedUser(platform!.env, params.user, leftAt, admin.email))
	});
};
