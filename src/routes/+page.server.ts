import { resolve } from '$app/paths';
import { buildAllocatedWeeks } from '$lib/paymentAlloc.js';
import { unixTimestampToDate } from '$lib/date.js';
import { getUserObligations } from '$lib/server/billing';
import { isPublicObligationsEnabled } from '$lib/server/publicObligations';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { redirect } from '@sveltejs/kit';
import { checkIfUserExists } from './api/auth/verify-user/checkUserExist.js';
import { isAutomaticSlipProcessingEnabled } from '$lib/server/slipProcessing.js';

export const load = async ({ locals, platform }) => {
	if (
		!locals.user ||
		!(await checkIfUserExists(locals.user.email, platform?.env.AccountingDatabase as D1Database))
	) {
		return redirect(302, resolve('/login'));
	}
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const allTransactionsFromUser = (
		await accountingDatabase
			.prepare('SELECT * FROM transactions WHERE email = ?')
			.bind(locals.user.email)
			.all<Transaction>()
	).results.map((transaction) => ({
		...transaction,
		date: unixTimestampToDate(transaction.date)
	})) as Transaction[];
	const allObligations = await getUserObligations(accountingDatabase, locals.user.email);
	const obligationsExempt = await accountingDatabase
		.prepare('SELECT * FROM exception_obligation WHERE email = ? AND voided_at IS NULL')
		.bind(locals.user.email)
		.all<{ obligation_id: number }>();
	const exemptObligationIds = new Set(
		obligationsExempt.results.map((exemption) => String(exemption.obligation_id))
	);
	const allocatedWeeks = buildAllocatedWeeks(
		allObligations,
		allTransactionsFromUser,
		exemptObligationIds
	);
	const isAutomaticSlipCheckOn = await isAutomaticSlipProcessingEnabled(accountingDatabase);
	const payableObligations = allObligations.filter(
		(obligation) => !exemptObligationIds.has(String(obligation.id))
	);
	const nextDue = allocatedWeeks.find((week) => week.status !== 'paid' && week.status !== 'exempt');

	return {
		publicObligationsEnabled: await isPublicObligationsEnabled(accountingDatabase),
		user: locals.user,
		transaction: allTransactionsFromUser,
		obligations: payableObligations,
		allocatedWeeks,
		nextDue,
		isAutomaticSlipCheckOn
	};
};
