/** Bangkok calendar date; obligation dates themselves are stored at UTC midnight. */
export function bangkokDay(now: number) {
	return new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export const currentBalancesSql = `
    SELECT u.email, ROUND(
        (SELECT COALESCE(SUM(o.amount), 0) FROM obligations o
            WHERE o.deleted_at IS NULL
            AND (CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END) <= ?)
        - (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
            WHERE t.email = u.email AND t.approved IN ('approved', 'pending')), 2) AS remaining
    FROM users u WHERE u.deleted_at IS NULL AND u.left_at IS NULL`;

export const dailyReminderSql = `
INSERT OR IGNORE INTO notifications (email, event_key, kind, title, body, created_at)
SELECT email, 'reminder:' || ?, 'reminder', 'Daily payment reminder',
    'You have ฿' || printf('%.2f', remaining) ||
    ' still to submit for current or overdue obligations. Payments awaiting approval are already excluded.', ?
FROM (${currentBalancesSql}) WHERE remaining > 0`;

export async function retireSettledReminders(db: D1Database, now: number) {
	const day = bangkokDay(now * 1000);
	await db
		.prepare(
			`UPDATE notifications SET read_at = ? WHERE kind = 'reminder' AND read_at IS NULL
		AND (event_key != ? OR email IN (SELECT email FROM (${currentBalancesSql}) WHERE remaining <= 0))`
		)
		.bind(now, 'reminder:' + day, Math.floor(new Date(day + 'T00:00:00Z').getTime() / 1000))
		.run();
}

export async function createDailyReminders(db: D1Database, now = Date.now()) {
	const day = bangkokDay(now);
	return db
		.prepare(dailyReminderSql)
		.bind(day, Math.floor(now / 1000), Math.floor(new Date(day + 'T00:00:00Z').getTime() / 1000))
		.run();
}
