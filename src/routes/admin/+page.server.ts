import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

export const load = async ({ locals, platform, url }) => {
	const allPendingTransactions = await platform?.env.AccountingDatabase.prepare(
		"SELECT * FROM transactions WHERE approved = 'pending'"
	).all<Transaction>();
	return {
		focusedTransactionId: url.searchParams.get('highlightTransactionId'),
		allPendingTransactions
	};
};
