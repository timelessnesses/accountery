import { unixTimestampToDate } from '$lib/date';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

type PendingTransactionRow = Omit<Transaction, 'date'> & {
	date: number;
	user_name: string | null;
};

export const load = async ({ platform, url }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const allPendingTransactions = (
		await accountingDatabase
			.prepare(`SELECT t.*, u.name AS user_name
			FROM transactions AS t
			LEFT JOIN users AS u ON u.email = t.email
			WHERE t.approved = 'pending'
			ORDER BY t.date DESC`)
			.all<PendingTransactionRow>()
	).results.map((transaction) => ({
		...transaction,
		date: unixTimestampToDate(transaction.date)
	}));

	return {
		focusedTransactionId: url.searchParams.get('highlightTransactionId'),
		allPendingTransactions
	};
};
