import { error } from '@sveltejs/kit';
import { auditLogStatement } from './auditLog';
import { departedAccountHash } from './departedAccounts';

export async function anonymizeDepartedUser(
	env: Pick<Env, 'AccountingDatabase' | 'AccountingReceipts'>,
	email: string,
	leftAt: number,
	actor: string
) {
	const db = env.AccountingDatabase;
	const user = await db
		.prepare('SELECT email, anonymized_at FROM users WHERE email = ? AND deleted_at IS NULL')
		.bind(email)
		.first<{ email: string; anonymized_at: number | null }>();
	if (!user) error(404, 'User not found');
	if (user.anonymized_at !== null) {
		await db.batch([
			db.prepare('UPDATE users SET left_at = ? WHERE email = ?').bind(leftAt, email),
			auditLogStatement(db, {
				email: actor,
				action: `Updated leaving date for anonymized user ${email}`,
				targets: [{ type: 'user', email }]
			})
		]);
		return { email, anonymized: true };
	}

	// Freeze access first. A failed R2 deletion leaves a blocked account which can
	// be retried without losing the receipt keys needed to complete the cleanup.
	await db.batch([
		db
			.prepare(
				'UPDATE users SET left_at = ?, session_token = NULL, session_expiry = NULL WHERE email = ?'
			)
			.bind(leftAt, email),
		db.prepare('DELETE FROM calendar_tokens WHERE by_user = ?').bind(email),
		db.prepare('DELETE FROM notifications WHERE email = ?').bind(email)
	]);
	const { results: receipts } = await db
		.prepare(
			"SELECT DISTINCT image FROM transactions WHERE email = ? AND image IS NOT NULL AND image != ''"
		)
		.bind(email)
		.all<{ image: string }>();
	const keys = [
		...new Set(
			receipts
				.map(({ image }) => {
					if (!image.startsWith('/api/payments/'))
						error(
							409,
							'An unrecognized receipt reference needs administrator review before anonymization.'
						);
					return image.slice('/api/payments/'.length);
				})
				.filter(Boolean)
		)
	];
	try {
		for (let offset = 0; offset < keys.length; offset += 100)
			await env.AccountingReceipts.delete(keys.slice(offset, offset + 100));
	} catch (cause) {
		console.error('Departure receipt cleanup failed:', cause);
		error(
			503,
			'Sign-in is disabled, but receipt deletion failed. Retry Mark as left to finish anonymization.'
		);
	}

	const anonymousEmail = `left-user-${crypto.randomUUID()}@tsu.ac.th`;
	const hash = await departedAccountHash(db, email);
	const now = Math.floor(Date.now() / 1000);
	const results = await db.batch([
		// Insert the replacement before moving references, so foreign keys remain
		// valid throughout the batch without disabling referential integrity.
		db
			.prepare(
				`INSERT INTO users (email, name, nickname, role, left_at, anonymized_at)
			SELECT ?, 'Departed user', '', 'student', ?, ? FROM users
			WHERE email = ? AND deleted_at IS NULL AND anonymized_at IS NULL`
			)
			.bind(anonymousEmail, leftAt, now, email),
		db.prepare('INSERT OR IGNORE INTO departed_account_blocks (email_hash) VALUES (?)').bind(hash),
		// Retain bank/reference deduplication, but discard provider names, account
		// numbers and every other personal field from the original slip response.
		db
			.prepare(
				`UPDATE slipok_cache SET slipok_response = json_object(
			'success', json('false'), 'code', 'ANONYMIZED', 'message', 'Receipt removed after departure',
			'data', json_object('transRef', trans_ref, 'sendingBank', sending_bank))
			WHERE transaction_id IN (SELECT id FROM transactions WHERE email = ?)`
			)
			.bind(email),
		db
			.prepare(
				`UPDATE transactions SET email = ?, image = NULL,
			description = 'Payment from departed user',
			reject_reason = CASE WHEN reject_reason != '' THEN 'Reason removed after anonymization' ELSE '' END,
			void_reason = CASE WHEN void_reason != '' THEN 'Reason removed after anonymization' ELSE '' END
			WHERE email = ?`
			)
			.bind(anonymousEmail, email),
		db
			.prepare('UPDATE transactions SET processor = ? WHERE processor = ?')
			.bind(anonymousEmail, email),
		db
			.prepare(
				`UPDATE logs SET
			email = CASE WHEN email = ? THEN ? ELSE email END,
			action = 'Historical audit entry anonymized following account departure',
			targets = (SELECT COALESCE(json_group_array(json(CASE
				WHEN json_extract(value, '$.type') = 'user' AND json_extract(value, '$.email') = ?
				THEN json_set(value, '$.email', ?) ELSE value END)), '[]')
				FROM json_each(CASE WHEN json_valid(logs.targets) THEN logs.targets ELSE '[]' END))
			WHERE email = ? OR instr(action, ?) > 0 OR EXISTS (
				SELECT 1 FROM json_each(CASE WHEN json_valid(logs.targets) THEN logs.targets ELSE '[]' END)
				WHERE json_extract(value, '$.type') = 'user' AND json_extract(value, '$.email') = ?)`
			)
			.bind(email, anonymousEmail, email, anonymousEmail, email, email, email),
		db.prepare('DELETE FROM users WHERE email = ?').bind(email),
		auditLogStatement(db, {
			email: actor === email ? anonymousEmail : actor,
			changedOnly: true,
			action: `Marked user as left and anonymized account; leaving date: ${new Date(leftAt * 1000).toISOString().slice(0, 10)}; removed ${keys.length} receipt(s); accounting transactions retained`,
			targets: [{ type: 'user', email: anonymousEmail }]
		})
	]);
	if (!results[0].meta.changes)
		error(409, 'This account was already anonymized. Refresh the user list.');
	return { email: anonymousEmail, anonymized: true };
}
