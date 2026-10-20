import { auditLogStatement } from './auditLog';
import { approveVerifiedSlip, automaticallyProcessSlip } from './slipProcessing';
import type { SlipOkResponse } from '../slipOKAPI';
import { enqueueNotification } from './notificationQueue';

export class DuplicateSlipError extends Error {
	constructor() {
		super('This bank transfer has already been submitted.');
	}
}

export async function submitPayment(
	env: Pick<Env, 'AccountingDatabase' | 'AccountingReceipts' | 'NotificationQueue'>,
	email: string,
	amount: number,
	note: string,
	image: Uint8Array,
	verifiedSlip?: SlipOkResponse
) {
	const db = env.AccountingDatabase;
	const key = crypto.randomUUID();
	await env.AccountingReceipts.put(key, image);
	let transactionId: number;
	try {
		const statements = [];
		const slip = verifiedSlip?.success && verifiedSlip.data.success ? verifiedSlip.data : null;
		// D1 executes this batch atomically. Check the existing cache inside the insert
		// so concurrent shares cannot both record a payment for the same transfer.
		statements.push(
			db
				.prepare(
					`INSERT INTO transactions (email, amount, description, date, type, image)
					SELECT ?, ?, ?, ?, ?, ?
					WHERE NOT EXISTS (SELECT 1 FROM slipok_cache WHERE sending_bank = ? AND trans_ref = ?)`
				)
				.bind(
					email,
					Math.round(amount * 100) / 100,
					note.trim(),
					Math.floor(Date.now() / 1000),
					'payment',
					'/api/payments/' + key,
					slip?.sendingBank ?? null,
					slip?.transRef ?? null
				)
		);
		if (slip) {
			statements.push(
				db
					.prepare(
						`INSERT INTO slipok_cache(transaction_id, slipok_response)
						SELECT last_insert_rowid(), ? WHERE changes() > 0`
					)
					.bind(JSON.stringify(verifiedSlip))
			);
		}
		const results = await db.batch(statements);
		if (!results[0].meta.changes) throw new DuplicateSlipError();
		transactionId = results[0].meta.last_row_id;
	} catch (err) {
		await env.AccountingReceipts.delete(key);
		throw err;
	}
	await auditLogStatement(db, {
		email,
		action: `Submitted payment of ${amount.toFixed(2)} baht; note: ${note.trim()}`,
		targets: [{ type: 'transaction', id: transactionId }]
	}).run();
	let automaticallyApproved = false;
	try {
		automaticallyApproved = verifiedSlip
			? await approveVerifiedSlip(db, transactionId, verifiedSlip)
			: await automaticallyProcessSlip(
					db,
					transactionId,
					amount,
					image.buffer as ArrayBuffer,
					email
				);
	} catch (err) {
		console.error('Automatic slip processing failed; payment remains pending:', err);
	}
	await enqueueNotification(
		env,
		automaticallyApproved
			? {
					type: 'notification',
					id: `processed:${transactionId}:approved`,
					data: {
						title: 'Payment approved',
						body: `Your payment of ฿${amount.toFixed(2)} was approved.`,
						url: '/',
						destination: [email],
						output: 'push'
					}
				}
			: {
					type: 'notification',
					id: `review:${transactionId}`,
					event: { type: 'review', transactionId },
					data: {
						title: 'Payment awaiting review',
						body: `${email} submitted a payment of ฿${amount.toFixed(2)}.`,
						url: `/admin/transactions?highlightTransactionId=${transactionId}`,
						destination: 'admins',
						output: 'push'
					}
				}
	);
	return { ok: true, automaticallyApproved };
}
