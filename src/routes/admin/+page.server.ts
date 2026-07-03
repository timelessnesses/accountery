import { unixTimestampToDate } from '$lib/date';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

export const load = async ({ platform, url }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const allPendingTransactions = (
		await accountingDatabase
			.prepare("SELECT * FROM transactions WHERE approved = 'pending' ORDER BY date DESC")
			.all<Transaction>()
	).results.map((transaction) => ({
		...transaction,
		date: unixTimestampToDate(transaction.date)
	})) as Transaction[];

	return {
		focusedTransactionId: url.searchParams.get('highlightTransactionId'),
		allPendingTransactions
	};
};
