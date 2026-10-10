import { json } from '@sveltejs/kit';
import { validateAmount } from '$lib/promptpay';
import { automaticallyProcessSlip } from '$lib/server/slipProcessing';
import { auditLogStatement } from '$lib/server/auditLog';

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
	try {
		validateAmount(amount);
	} catch {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

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

	const inserted = await accountingDatabase
		.prepare(
			'INSERT INTO transactions (email, amount, description, date, type, image) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.bind(
			locals.user.email,
			Math.round(amount * 100) / 100,
			body.note?.trim() || 'Payment',
			Math.floor(Date.now() / 1000),
			'payment',
			'/api/payments/' + res
		)
		.run();
	await auditLogStatement(accountingDatabase, {
		email: locals.user.email,
		action: `Submitted payment of ${amount.toFixed(2)} baht; note: ${body.note.trim()}`,
		targets: [{ type: 'transaction', id: inserted.meta.last_row_id }]
	}).run();
	let automaticallyApproved = false;
	try {
		automaticallyApproved = await automaticallyProcessSlip(
			accountingDatabase,
			inserted.meta.last_row_id,
			amount,
			imageBytes.buffer as ArrayBuffer,
			locals.user.email
		);
	} catch (err) {
		// The payment and receipt are saved. Provider failures leave it pending for review/retry.
		console.error('Automatic slip processing failed; payment remains pending:', err);
	}
	return json({ ok: true, automaticallyApproved });
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
	return new Uint8Array(bytes);
}
