import { checkSlip, type SlipOkResponse } from '$lib/slipOKAPI';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { administrators } from '$lib/whitelisted.js';
import { error, json } from '@sveltejs/kit';
import path from 'path';

export const POST = async ({ locals, params, platform }) => {
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

	console.log('Verifying slip for transaction:', transaction);
	const slipKey = path.basename(transaction.image);
	const slipObject = (await platform?.env.AccountingReceipts.get(slipKey)) as R2ObjectBody;
	console.log('Slip object retrieved from R2:', slipObject);

	const result = await checkSlipOkCacheBeforeCallingSlipOkApi(platform?.env.AccountingDatabase, transaction.id, slipObject, transaction.amount);

	return json(result);
};

type SlipOkCacheEntry = {
	transaction_id: number;
	slipok_response: string;
};

async function checkSlipOkCacheBeforeCallingSlipOkApi(
	db: D1Database,
	transactionId: number,
	slipObject: R2ObjectBody,
	amount: number
): Promise<SlipOkResponse> {
	const res = await db.prepare('SELECT * FROM slipok_cache WHERE transaction_id = ?').bind(transactionId).first<SlipOkCacheEntry>();
	if (!res) {
		const response = await checkSlip(await slipObject.arrayBuffer(), amount)
		await db.prepare('INSERT INTO slipok_cache (transaction_id, slipok_response) VALUES (?, ?)').bind(transactionId, JSON.stringify(response)).run();
		return response;
	}
	return JSON.parse(res.slipok_response) as SlipOkResponse;
}