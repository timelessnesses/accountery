import { calendarResponse, requireCalendarUser } from '$lib/server/obligationCalendar';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ platform, locals, url }) => {
	const database = platform!.env.AccountingDatabase;
	const email = await requireCalendarUser(database, locals.user);
	return calendarResponse(database, url.origin, email, true);
};
