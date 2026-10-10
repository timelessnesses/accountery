import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { parseProcessingRequest, processTransactions } from '$lib/server/transactionProcessing';

export const POST = async ({ locals, params, platform, request }) => {
	const admin = requireAdmin(locals.user);
	const { approved, reason } = parseProcessingRequest(await request.json());

	const transactionId = Number(params.transaction);

	if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
		throw error(400, 'Invalid transaction id');
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;

	const changed = await processTransactions(
		accountingDatabase,
		[transactionId],
		approved,
		reason,
		admin.email
	);
	if (!changed)
		error(
			409,
			approved === 'voided'
				? 'Only approved or rejected transactions can be voided'
				: 'Transaction is no longer pending'
		);
	return json({ ok: true, changed });
};
