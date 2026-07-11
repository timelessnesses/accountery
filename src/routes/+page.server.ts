import { buildAllocatedWeeks } from '$lib/paymentAlloc.js';
import { unixTimestampToDate } from '$lib/date.js';
import type { Obligation, Transaction } from '$lib/types/AccountingDatabaseTypes';
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
	const allObligations = (
		await accountingDatabase.prepare('SELECT * FROM obligations').all<Obligation>()
	).results.map((obligation) => ({
		...obligation,
		start_date: new Date((obligation.start_date as unknown as number) * 1000)
	})) as Obligation[];
	const allocatedWeeks = buildAllocatedWeeks(allObligations, allTransactionsFromUser);
	const nextDue = allocatedWeeks.find((week) => week.status !== 'paid');

	console.log(env, envPublic);

	return {
		user: locals.user,
		transaction: allTransactionsFromUser,
		obligations: allObligations,
		allocatedWeeks,
		nextDue
	};
};
