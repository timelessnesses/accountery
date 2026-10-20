import { enqueueNotification } from './notificationQueue';

/** Create the next Sunday's obligation unless its start date is paused or already exists. */
export async function newWeeklyObligations(
	database: D1Database,
	now = new Date(),
	notificationQueue?: Queue
) {
	const nextSunday = new Date(now);
	const daysUntilNextSunday = now.getUTCDay() === 0 ? 7 : 7 - now.getUTCDay();
	nextSunday.setUTCDate(nextSunday.getUTCDate() + daysUntilNextSunday);
	nextSunday.setUTCHours(0, 0, 0, 0);
	const startDate = Math.floor(nextSunday.getTime() / 1000);
	const endDate = startDate + 6 * 86400;

	// Check and insert in one write so pauses saved before this statement take effect
	// immediately, and concurrent invocations cannot create the same week twice.
	// Deleted obligations still count as existing so they are never recreated.
	const result = await database
		.prepare(
			`
		INSERT INTO obligations (start_date, end_date, amount, description)
		SELECT ?, ?, ?, ?
		WHERE NOT EXISTS (SELECT 1 FROM obligations WHERE start_date = ?)
		AND NOT EXISTS (
			SELECT 1 FROM obligation_creation_pauses WHERE start_date <= ? AND end_date >= ?
		)
	`
		)
		.bind(startDate, endDate, 30, 'New weekly obligation', startDate, startDate, startDate)
		.run();
	const created = result.meta.changes > 0;
	if (created && notificationQueue) {
		await enqueueNotification(
			{ NotificationQueue: notificationQueue },
			{
				type: 'notification',
				id: `obligation:${result.meta.last_row_id}`,
				data: {
					title: 'New obligation',
					body: 'New weekly obligation: ฿30.00.',
					url: '/',
					destination: 'students',
					output: 'push'
				}
			}
		);
	}
	console.log(
		created
			? `Created obligation for ${nextSunday.toISOString().slice(0, 10)}`
			: `Skipped obligation for ${nextSunday.toISOString().slice(0, 10)}: already exists or start date is paused`
	);
	return created;
}
