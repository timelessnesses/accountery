export const load = async ({ platform }) => {
	console.log('hit');
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
            u.session_token,

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
        LEFT JOIN transactions t
            ON t.email = u.email

        CROSS JOIN obligation_total

        GROUP BY u.email;
    `
	).all<TransformedUser>()) as unknown as D1Result<TransformedUser>;
	console.log('done');

	return { transactionsFromUser };
};

type TransformedUser = {
	email: string;
	name: string;
	nickname: string;
	paid: number;
	owed: number;
	net: number;
	session_expiry: string;
	session_token: string;
};
