import { unixTimestampToDate } from '$lib/date';
import { buildAllocatedWeeks } from '$lib/paymentAlloc';
import type { Obligation, Transaction, User } from '$lib/types/AccountingDatabaseTypes';
import { error } from '@sveltejs/kit';

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

export const load = async ({ params, platform, locals }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const user = await accountingDatabase
		.prepare(
			`
        SELECT *
        FROM users
        WHERE email = ?
    `
		)
		.bind(params.user)
		.first<User>();
	const netUser = await accountingDatabase
		.prepare(
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
        WHERE u.email = ?
        GROUP BY u.email;
    `
		)
		.bind(params.user)
		.first<TransformedUser>();

	const allTransactionsFromUser = (
		await accountingDatabase
			.prepare('SELECT * FROM transactions WHERE email = ?')
			.bind(params.user)
			.all<Transaction>()
	).results.map((t) => ({ ...t, date: unixTimestampToDate(t.date) }));

	const allObligations = (
		await accountingDatabase.prepare('SELECT * FROM obligations').all<Obligation>()
	).results // o.start_date is a number
		.map((o) => ({
			...o,
			start_date: new Date(parseInt(o.start_date as unknown as string) * 1000)
		}));

	if (!user || !netUser) {
		throw error(404, 'User not found');
	}
	const allocatedWeeks = buildAllocatedWeeks(allObligations, allTransactionsFromUser);

	const nextDue = allocatedWeeks.find((week) => week.status !== 'paid');
	return {
		user,
		netUser,
		allTransactionsFromUser,
		allObligations,
		nextDue,
		allocatedWeeks
	};
};
