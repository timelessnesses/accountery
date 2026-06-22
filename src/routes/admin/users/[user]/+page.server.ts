import type { Transaction } from '$lib/auth';
import type { User } from '$lib/types/AccountingDatabaseTypes';


type TransformedUser = {
    email: string;
    name: string;
    nickname: string;
    paid: number;
    owed: number;
    net: number;
    session_expiry: string;
    session_token: string;
}

export const load = async ({ params, platform }) => {
    const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
    const user = await accountingDatabase.prepare(`
        SELECT *
        FROM users
        WHERE email = ?
    `).bind(params.user).first<User>();
    const netUser = await accountingDatabase.prepare(`
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

        GROUP BY u.email
        WHERE u.email = ?;
    `).bind(params.user).first<TransformedUser>();

    const allTransactionsFromUser = (await (accountingDatabase.prepare(
        "SELECT * FROM transactions WHERE email = ?"
    ).bind(params.user)).all<Transaction>()).results;

    const allObligations = (await (accountingDatabase.prepare(
        "SELECT * FROM obligations"
    )).all()).results;

    if (!user || !netUser) {
        return new Response(null, { status: 404 });
    }
    return { user, netUser, allTransactionsFromUser, allObligations };
}