import { buildAllocatedWeeks } from '$lib/paymentAlloc.js';
import { unixTimestampToDate } from '$lib/date.js';
import { getUserObligations } from '$lib/server/billing';
import { isPublicObligationsEnabled } from '$lib/server/publicObligations';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { env as envPublic } from '$env/dynamic/public';
import { checkIfUserExists } from './api/auth/verify-user/checkUserExist.js';

export const load = async ({ locals, platform }) => {
	if (
		!locals.user ||
		!(await checkIfUserExists(locals.user.email, platform?.env.AccountingDatabase as D1Database))
	) {
		return redirect(302, '/login');
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
	const allocatedWeeks = buildAllocatedWeeks(allObligations, allTransactionsFromUser);
	const nextDue = allocatedWeeks.find((week) => week.status !== 'paid');

	console.log(env, envPublic);

	return {
		publicObligationsEnabled: await isPublicObligationsEnabled(accountingDatabase),
		user: locals.user,
		transaction: allTransactionsFromUser,
		obligations: allObligations,
		allocatedWeeks,
		nextDue
	};
};
