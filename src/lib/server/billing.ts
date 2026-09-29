import { obligationDates, unixTimestampToDate } from '$lib/date';
import type { Obligation, TransformedUser } from '$lib/types/AccountingDatabaseTypes';

// All billing queries use aliases o (obligations) and u (users).
// Older imports can contain milliseconds instead of Unix seconds.
export const applicableObligationSql = `o.deleted_at IS NULL AND (
	u.left_at IS NULL OR
	(CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END) < u.left_at
)`;

export async function getUserObligations(database: D1Database, email: string) {
	const { results } = await database
		.prepare(
			`SELECT o.* FROM obligations o
			JOIN users u ON u.email = ? AND u.deleted_at IS NULL
			WHERE ${applicableObligationSql} ORDER BY o.start_date, o.id`
		)
		.bind(email)
		.all<Obligation>();
	return results.map((obligation) => ({ ...obligation, ...obligationDates(obligation) }));
}

export async function getUserBalances(database: D1Database, email?: string) {
	const query = database.prepare(`
		WITH balances AS (
			SELECT u.email, u.name, u.nickname, u.role, u.session_expiry,
				u.logged_in_when, u.deleted_at, u.left_at, u.role,
				(SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
					WHERE t.email = u.email AND t.approved = 'approved') AS paid,
				(SELECT COALESCE(SUM(o.amount), 0) FROM obligations o
					WHERE ${applicableObligationSql}) AS owed
			FROM users u WHERE u.deleted_at IS NULL ${email === undefined ? '' : 'AND u.email = ?'}
		)
		SELECT *, paid - owed AS net FROM balances ORDER BY email
	`);
	const result = await (email === undefined ? query : query.bind(email)).all<TransformedUser>();
	console.log(result)
	return {
		...result,
		results: result.results.map((user) => ({
			...user,
			session_expiry: user.session_expiry == null ? null : unixTimestampToDate(user.session_expiry),
			logged_in_when: user.logged_in_when == null ? null : unixTimestampToDate(user.logged_in_when)
		}))
	};
}
