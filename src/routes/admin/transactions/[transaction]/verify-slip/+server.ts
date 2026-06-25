import { checkSlip } from '$lib/slipOKAPI';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { administrators } from '$lib/whitelisted.js';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ locals, params, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!Object.keys(administrators).includes(locals.user.email.split('@')[0])) {
		throw error(403, 'Forbidden');
	}

	const transactionId = Number(params.transaction);

	if (!Number.isInteger(transactionId)) {
		throw error(400, 'Invalid transaction id');
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const transaction = await accountingDatabase
		.prepare('SELECT * FROM transactions WHERE id = ?')
		.bind(transactionId)
		.first<Transaction>();

	if (!transaction) {
		throw error(404, 'Transaction not found');
	}

	if (!transaction.image) {
		throw error(400, 'Transaction has no slip image');
	}

	const slipUrl = transaction.image.startsWith('http')
		? transaction.image
		: new URL(transaction.image, url.origin).toString();

	const result = await checkSlip(slipUrl, transaction.amount);

	return json(result);
};
