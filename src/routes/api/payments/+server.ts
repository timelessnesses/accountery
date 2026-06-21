import { json } from '@sveltejs/kit';

export const POST = async ({ locals, platform, request }) => {
	const env = platform?.env as Env | undefined;
	const accountingDatabase = env?.AccountingDatabase;

	if (!locals.user || !accountingDatabase) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json()) as { amount?: number; note?: string; proof?: Base64URLString };
	console.log(body);
	const amount = Number(body.amount);

	if (!Number.isFinite(amount) || amount <= 0 || !body.note?.trim() || !body.proof) {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

	const imageBytes = dataUrlToBytes(body.proof);
	const res = buildPublicCDNUrl((await platform?.env.AccountingReceipts.put(`${Date.now()}-${locals.user.email}.png`, imageBytes))?.key as string);

	await accountingDatabase
		.prepare(
			'INSERT INTO transactions (email, amount, description, date, type, image) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(
			locals.user.email,
			Math.round(amount),
			body.note?.trim() || 'Payment',
			Date.now(),
			'payment',
			res
		)
		.run();

	return json({ ok: true });
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
    const bytes = Buffer.from(
		dataUrl.split(",")[1],
		"base64"
	);
	return new Uint8Array(bytes);
}

function buildPublicCDNUrl(key: string) { 
	return `https://receipts.timelessnesses.me/${key}`;
}