import { json } from '@sveltejs/kit';

export const POST = async ({ locals, platform, request }) => {
	const env = platform?.env as Env | undefined;
	const accountingDatabase = env?.AccountingDatabase;

	if (!locals.user || !accountingDatabase) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as { amount?: number; note?: string; proof?: string };
	const amount = Number(body.amount);

	if (!Number.isFinite(amount) || amount <= 0 || !body.note?.trim() || !body.proof) {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

	await accountingDatabase
		.prepare(
			'INSERT INTO transactions (email, amount, description, date, type) VALUES (?, ?, ?, ?, ?)'
		)
		.bind(
			locals.user.email,
			Math.round(amount),
			body.note?.trim() || 'Payment',
			Date.now(),
			'payment'
		)
		.run();

	return json({ ok: true });
};