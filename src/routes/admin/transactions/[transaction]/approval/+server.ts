import { administrators } from '$lib/whitelisted.js';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!Object.keys(administrators).includes(locals.user.email.split('@')[0])) {
		throw error(403, 'Forbidden');
	}

	const { approved } = (await request.json()) as {
		approved?: 'approved' | 'rejected';
	};

	if (approved !== 'approved' && approved !== 'rejected') {
		throw error(400, 'Invalid approval status');
	}

	const transactionId = Number(params.transaction);

	if (!Number.isInteger(transactionId)) {
		throw error(400, 'Invalid transaction id');
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;

	const result = await accountingDatabase
		.prepare(
			`
            UPDATE transactions
            SET approved = ?
            WHERE id = ?
                AND approved = 'pending'
        `
		)
		.bind(approved, transactionId)
		.run();
	
	await accountingDatabase.prepare(
		'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
	)
		.bind(
			locals.user.email,
			`Admin ${locals.user.email} ${approved} transaction with id: ${transactionId}`,
			Math.floor(Date.now() / 1000)
		)
		.run();

	if (result.meta.changes === 0) {
		throw error(404, 'Pending transaction not found');
	}

	return json({ ok: true });
};
