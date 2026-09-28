import { unixTimestampToDate } from '$lib/date';
import { buildAllocatedWeeks } from '$lib/paymentAlloc';
import { getUserBalances, getUserObligations } from '$lib/server/billing';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { error } from '@sveltejs/kit';

export const load = async ({ params, platform, locals }) => {
	if (!locals.user) error(401, 'Unauthorized');
	const database = platform!.env.AccountingDatabase;
	const { results } = await getUserBalances(database, params.user);
	const user = results[0];
	if (!user) error(404, 'User not found');

	const allTransactionsFromUser = (
		await database
			.prepare('SELECT * FROM transactions WHERE email = ?')
			.bind(params.user)
			.all<Transaction>()
	).results.map((transaction) => ({ ...transaction, date: unixTimestampToDate(transaction.date) }));
	const allObligations = await getUserObligations(database, params.user);
	const allocatedWeeks = buildAllocatedWeeks(allObligations, allTransactionsFromUser);

	return {
		user,
		netUser: user,
		allTransactionsFromUser,
		allObligations,
		nextDue: allocatedWeeks.find((week) => week.status !== 'paid'),
		allocatedWeeks
	};
};
