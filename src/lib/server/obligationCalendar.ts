import { error } from '@sveltejs/kit';
import { createEvents, type DateArray } from 'ics';
import { obligationDates } from '$lib/date';
import type { Obligation } from '$lib/types/AccountingDatabaseTypes';
import { getUserObligations } from './billing';

function dateArray(date: Date): DateArray {
	return [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
}

export function buildObligationCalendar(obligations: Obligation[], origin: string) {
	const { error: calendarError, value } = createEvents(
		obligations.map((obligation) => {
			const { start_date, end_date } = obligationDates(obligation);
			const exclusiveEnd = new Date(end_date);
			exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
			return {
				uid: `obligation-${obligation.id}@${new URL(origin).host}`,
				start: dateArray(start_date),
				end: dateArray(exclusiveEnd),
				title: obligation.description,
				description: `Amount: THB ${obligation.amount}\n${obligation.description}`,
				url: origin,
				transp: 'TRANSPARENT' as const,
				classification: 'PRIVATE'
			};
		}),
		{ calName: 'Accountery obligations', productId: 'Accountery', method: 'PUBLISH' }
	);
	if (calendarError || !value) error(500, 'Unable to generate calendar');
	return value;
}

export async function calendarResponse(
	database: D1Database,
	origin: string,
	email: string,
	download = false
) {
	const obligations = await getUserObligations(database, email);
	return new Response(buildObligationCalendar(obligations, origin), {
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="obligations.ics"`,
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer'
		}
	});
}

export async function requireCalendarUser(database: D1Database, user: App.Locals['user']) {
	if (!user) error(401, 'Sign in to access your calendar');
	const active = await database
		.prepare('SELECT email FROM users WHERE email = ? AND deleted_at IS NULL AND left_at IS NULL')
		.bind(user.email)
		.first();
	if (!active) error(403, 'Account unavailable');
	return user.email;
}
