import { error, json } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { parseProcessingRequest, processTransactions } from '$lib/server/transactionProcessing';

export const POST = async ({ locals, platform, request }) => {
	const admin = requireAdmin(locals.user);
	const body = await request.json();
	const { approved, reason } = parseProcessingRequest(body);
	const transactionIds = (body as { transactionIds?: unknown }).transactionIds;
	if (
		!Array.isArray(transactionIds) ||
		!transactionIds.length ||
		transactionIds.some(
			(id: unknown) => typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0
		)
	)
		error(400, 'Invalid transaction ids');
	const ids = [...new Set<number>(transactionIds)];

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const changed = await processTransactions(
		accountingDatabase,
		ids,
		approved,
		reason,
		admin.email,
		platform!.env
	);
	return json({ ok: true, changed });
};
