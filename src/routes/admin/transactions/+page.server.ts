import { unixTimestampToDate } from '$lib/date';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

export const load = async ({ platform }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const transactions = (
		await accountingDatabase
			.prepare('SELECT * FROM transactions ORDER BY date DESC')
			.all<Transaction>()
	).results.map((transaction) => ({
		...transaction,
		date: unixTimestampToDate(transaction.date)
	})) as Transaction[];

	return { transactions };
};
