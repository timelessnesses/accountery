import { approveVerifiedSlip, checkAndCacheSlip } from '$lib/server/slipProcessing';
import type { Transaction } from '$lib/types/AccountingDatabaseTypes';
import { error, json } from '@sveltejs/kit';
import path from 'path';
import { getPromptPayTarget } from '$lib/server/promptpayQrCreator';
import { verifySlipRecipient } from '$lib/server/slipVerification';

export const POST = async ({ locals, params, platform }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!locals.user.admin) {
		throw error(403, 'Forbidden');
	}

	const transactionId = Number(params.transaction);

	if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
		throw error(400, 'Invalid transaction id');
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const recipient = await getPromptPayTarget(accountingDatabase);
	if (!recipient)
		error(409, 'Configure the receiving PromptPay QR in Admin → PromptPay before verifying slips.');
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

	const slipKey = path.basename(transaction.image);
	const slipObject = (await platform?.env.AccountingReceipts.get(slipKey)) as R2ObjectBody;
	if (!slipObject) error(404, 'Slip image not found.');

	let result;
	try {
		result = await checkAndCacheSlip(
			accountingDatabase,
			transaction.id,
			transaction.amount,
			() => slipObject.arrayBuffer(),
			locals.user.email
		);
	} catch (err) {
		error(502, `SlipOK API isn't setup correctly or unreachable: ${err}`);
	}
	const verification = await verifySlipRecipient(
		accountingDatabase,
		transaction.id,
		transaction.amount,
		result,
		recipient
	);
	const automaticallyApproved =
		verification.allChecksPassed &&
		(await approveVerifiedSlip(accountingDatabase, transaction.id, result));
	return json({ ...result, verification, automaticallyApproved });
};
