import { auditLogStatement } from './auditLog';
import { approveVerifiedSlip, automaticallyProcessSlip } from './slipProcessing';
import type { SlipOkResponse } from '../slipOKAPI';
import { enqueueNotification } from './notificationQueue';
import { error } from '@sveltejs/kit';

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
	verifiedSlip?: SlipOkResponse,
	adminSubmission?: { actorEmail: string }
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
					WHERE NOT EXISTS (SELECT 1 FROM slipok_cache WHERE sending_bank = ? AND trans_ref = ?)
					AND EXISTS (SELECT 1 FROM users WHERE email = ? AND deleted_at IS NULL AND left_at IS NULL)
					AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value != 'active')`
				)
				.bind(
					email,
					Math.round(amount * 100) / 100,
					note.trim(),
					Math.floor(Date.now() / 1000),
					'payment',
					'/api/payments/' + key,
					slip?.sendingBank ?? null,
					slip?.transRef ?? null,
					email
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
		if (adminSubmission) {
			// Save the admin attribution in the same batch as the payment. The receipt
			// key identifies this insert even when a cache insert changes last_insert_rowid().
			statements.push(
				db
					.prepare(
						`INSERT INTO logs (email, action, timestamp, targets, actor_type)
						SELECT ?, ? || id || ?, ?,
						json_array(json_object('type', 'transaction', 'id', id),
						json_object('type', 'user', 'email', email)), 'user'
						FROM transactions WHERE image = ?`
					)
					.bind(
						adminSubmission.actorEmail,
						`Admin ${adminSubmission.actorEmail} manually uploaded slip for transaction #`,
						` on behalf of ${email}; amount: ${amount.toFixed(2)} baht; awaiting approval; note: ${note.trim()}`,
						Math.floor(Date.now() / 1000),
						'/api/payments/' + key
					)
			);
		}
		const results = await db.batch(statements);
		if (!results[0].meta.changes) {
			const active = await db
				.prepare('SELECT 1 FROM users WHERE email = ? AND deleted_at IS NULL AND left_at IS NULL')
				.bind(email)
				.first();
			if (!active) error(409, 'This account is no longer available for payments.');
			const disabled = await db
				.prepare("SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value != 'active'")
				.first();
			if (disabled) error(503, 'This instance is no longer available.');
			throw new DuplicateSlipError();
		}
		transactionId = results[0].meta.last_row_id;
	} catch (err) {
		await env.AccountingReceipts.delete(key);
		throw err;
	}
	if (!adminSubmission)
		await auditLogStatement(db, {
			email,
			action: `Submitted payment of ${amount.toFixed(2)} baht; note: ${note.trim()}`,
			targets: [{ type: 'transaction', id: transactionId }]
		}).run();
	let automaticallyApproved = false;
	try {
		automaticallyApproved = adminSubmission
			? false
			: verifiedSlip
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
						output: 'all'
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
						output: 'all'
					}
				}
	);
	return { ok: true, automaticallyApproved, transactionId };
}
