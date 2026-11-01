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
	const exceptions = await database
		.prepare('SELECT obligation_id FROM exception_obligation WHERE email = ? AND voided_at IS NULL')
		.bind(params.user)
		.all<{ obligation_id: number }>();
	const exemptObligationIds = new Set(
		exceptions.results.map(({ obligation_id }) => String(obligation_id))
	);
	const allocatedWeeks = buildAllocatedWeeks(
		allObligations,
		allTransactionsFromUser,
		exemptObligationIds
	);
	const payableObligations = allObligations.filter(
		(obligation) => !exemptObligationIds.has(String(obligation.id))
	);

	return {
		user,
		netUser: user,
		allTransactionsFromUser,
		allObligations: payableObligations,
		nextDue: allocatedWeeks.find((week) => week.status !== 'paid' && week.status !== 'exempt'),
		allocatedWeeks
	};
};
