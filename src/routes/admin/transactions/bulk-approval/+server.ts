import { administrators } from '$lib/whitelisted.js';
import { error, json } from '@sveltejs/kit';

export const POST = async ({ locals, platform, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	if (!Object.keys(administrators).includes(locals.user.email.split('@')[0])) {
		throw error(403, 'Forbidden');
	}

	const { approved, transactionIds } = (await request.json()) as {
		approved?: 'approved' | 'rejected';
		transactionIds?: number[];
	};

	if (approved !== 'approved' && approved !== 'rejected') {
		throw error(400, 'Invalid approval status');
	}

	const ids = [...new Set(transactionIds ?? [])].filter((id) => Number.isInteger(id));

	if (ids.length === 0) {
		throw error(400, 'No transactions selected');
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const placeholders = ids.map(() => '?').join(', ');

	const result = await accountingDatabase
		.prepare(
			`
            UPDATE transactions
            SET approved = ?
            WHERE approved = 'pending'
                AND id IN (${placeholders})
        `
		)
		.bind(approved, ...ids)
		.run();

	await accountingDatabase
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			locals.user.email,
			`Admin ${locals.user.email} ${approved} transactions with ids: ${ids.join(', ')}`,
			Math.floor(Date.now() / 1000)
		)
		.run();

	return json({ ok: true, changed: result.meta.changes });
};
