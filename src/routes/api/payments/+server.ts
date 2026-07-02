import { json } from '@sveltejs/kit';

export const POST = async ({ locals, platform, request }) => {
	const env = platform?.env as Env | undefined;
	const accountingDatabase = env?.AccountingDatabase;

	if (!locals.user || !accountingDatabase) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as {
		amount?: number;
		note?: string;
		proof?: Base64URLString;
	};
	const amount = Number(body.amount);

	env.AccountingDatabase.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			locals.user.email,
			`User ${locals.user.email} submitted a payment of amount ${amount} with note: ${body.note}`,
			Math.floor(Date.now() / 1000)
		)
		.run();

	if (!Number.isFinite(amount) || amount <= 0 || !body.note?.trim() || !body.proof) {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

	const imageBytes = dataUrlToBytes(body.proof);
	const res = (
		await platform?.env.AccountingReceipts.put(
			`${new Date().toISOString()}-${locals.user.email}.png`,
			imageBytes
		)
	)?.key;

	await accountingDatabase
		.prepare(
			'INSERT INTO transactions (email, amount, description, date, type, image) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(
			locals.user.email,
			Math.round(amount),
			body.note?.trim() || 'Payment',
			Math.floor(Date.now() / 1000),
			'payment',
			'/api/payments/' + res
		)
		.run();
	await accountingDatabase
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			locals.user.email,
			`Successful of action User ${locals.user.email} submitted a payment of amount ${amount} with note: ${body.note}`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	return json({ ok: true });
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
	return new Uint8Array(bytes);
}
