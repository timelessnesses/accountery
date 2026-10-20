import { error } from '@sveltejs/kit';
import { enqueueNotification } from './notificationQueue';

export type ProcessingStatus = 'approved' | 'rejected' | 'voided';

export function parseProcessingRequest(body: unknown): {
	approved: ProcessingStatus;
	reason: string;
} {
	if (!body || typeof body !== 'object' || Array.isArray(body))
		error(400, 'Invalid processing request');
	const { approved, reason: suppliedReason } = body as { approved?: unknown; reason?: unknown };
	if (approved !== 'approved' && approved !== 'rejected' && approved !== 'voided')
		error(400, 'Invalid approval status');
	const reason = typeof suppliedReason === 'string' ? suppliedReason.trim() : '';
	if (approved === 'voided' && !reason) error(400, 'A void reason is required');
	if (reason.length > 2000) error(400, 'Reason must be at most 2000 characters');
	return { approved, reason };
}

export async function processTransactions(
	db: D1Database,
	ids: number[],
	approved: ProcessingStatus,
	reason: string,
	processor: string,
	notificationEnv?: Pick<Env, 'NotificationQueue'>
) {
	let changed = 0;
	// Stay below D1's bound-parameter limit, including the status and reasons.
	for (let offset = 0; offset < ids.length; offset += 80) {
		const chunk = ids.slice(offset, offset + 80);
		const placeholders = chunk.map(() => '?').join(', ');
		const eligible =
			approved === 'voided' ? "approved IN ('approved', 'rejected')" : "approved = 'pending'";
		const [, result] = await db.batch<{ id: number; email: string; amount: number }>([
			// Capture only eligible targets before changing them, in the same transaction.
			db
				.prepare(
					`INSERT INTO logs (email, action, timestamp, targets)
				SELECT ?, ? || COUNT(*) || ' transaction(s)' || ?, ?,
				json_group_array(json_object('type', 'transaction', 'id', id))
				FROM transactions WHERE ${eligible} AND id IN (${placeholders}) HAVING COUNT(*) > 0`
				)
				.bind(
					processor,
					`Admin ${processor} ${approved} `,
					reason ? `; reason: ${reason}` : '',
					Math.floor(Date.now() / 1000),
					...chunk
				),
			db
				.prepare(
					`UPDATE transactions SET approved = ?, processor = ?,
				reject_reason = CASE WHEN ? = 'rejected' THEN ? ELSE reject_reason END,
				void_reason = CASE WHEN ? = 'voided' THEN ? ELSE void_reason END
				WHERE ${eligible} AND id IN (${placeholders}) RETURNING id, email, amount`
				)
				.bind(approved, processor, approved, reason, approved, reason, ...chunk)
		]);
		changed += result.meta.changes;
		if (notificationEnv) {
			for (const transaction of result.results) {
				await enqueueNotification(notificationEnv, {
					type: 'notification',
					id: `processed:${transaction.id}:${approved}`,
					data: {
						title: `Payment ${approved}`,
						body: `Your payment of ฿${transaction.amount.toFixed(2)} was ${approved}.${reason ? ` Reason: ${reason}` : ''}`,
						url: '/',
						destination: [transaction.email],
						output: 'push'
					}
				});
			}
		}
	}
	return changed;
}
