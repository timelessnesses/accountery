import type { TransformedUser } from '$lib/types/AccountingDatabaseTypes';

export const load = async ({ platform }) => {
	const transactionsFromUser = (await platform?.env.AccountingDatabase.prepare(
		`
        WITH obligation_total AS (
            SELECT COALESCE(SUM(amount), 0) AS owed
            FROM obligations
        )
        SELECT
            u.email,
            u.name,
            u.nickname,
            u.session_expiry,
            u.logged_in_when,

            COALESCE(
                SUM(
                    CASE
                        WHEN t.approved = 'approved'
                        THEN t.amount
                        ELSE 0
                    END
                ),
                0
            ) AS paid,

            obligation_total.owed,

            COALESCE(
                SUM(
                    CASE
                        WHEN t.approved = 'approved'
                        THEN t.amount
                        ELSE 0
                    END
                ),
                0
            ) - obligation_total.owed AS net

        FROM users u
        WHERE u.deleted_at IS NULL
        LEFT JOIN transactions t
            ON t.email = u.email

        CROSS JOIN obligation_total

        GROUP BY u.email;
    `
    ).all<TransformedUser>()) as unknown as D1Result<TransformedUser>;
    console.log(transactionsFromUser.results)
    transactionsFromUser.results.forEach((u) => {
        if (u.session_expiry) u.session_expiry = new Date(parseInt(u.session_expiry as unknown as string) * 1000);
        if (u.logged_in_when) u.logged_in_when = new Date(parseInt(u.logged_in_when as unknown as string) * 1000);
    });

	return { transactionsFromUser };
};

