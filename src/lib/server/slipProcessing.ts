import { checkSlip, type SlipOkResponse } from '$lib/slipOKAPI';
import { getPromptPayTarget } from './promptpayQrCreator';
import { verifySlipRecipient } from './slipVerification';
import { auditLogStatement } from './auditLog';

export const APPLICATION_PROCESSOR = 'Application Approved';
export const AUTO_SLIP_SETTING = 'preapprove_with_slips_passed_checks';

export async function isAutomaticSlipProcessingEnabled(db: D1Database) {
	const setting = await db
		.prepare('SELECT value FROM app_settings WHERE key = ?')
		.bind(AUTO_SLIP_SETTING)
		.first<{ value: string }>();
	return setting?.value === '1';
}

export async function checkAndCacheSlip(
	db: D1Database,
	transactionId: number,
	amount: number,
	readImage: () => Promise<ArrayBuffer>,
	actor: string,
	actorType: 'user' | 'application' = 'user'
) {
	const cached = await db
		.prepare(
			`SELECT slipok_response FROM slipok_cache WHERE transaction_id = ?
		AND json_extract(slipok_response, '$.success') = 1
		AND json_extract(slipok_response, '$.data.success') = 1 LIMIT 1`
		)
		.bind(transactionId)
		.first<{ slipok_response: string }>();
	const response: SlipOkResponse = cached
		? JSON.parse(cached.slipok_response)
		: await checkSlip(await readImage(), amount);
	if (!cached && response.success && response.data?.success) {
		await db.batch([
			db.prepare('DELETE FROM slipok_cache WHERE transaction_id = ?').bind(transactionId),
			db
				.prepare('INSERT INTO slipok_cache (transaction_id, slipok_response) VALUES (?, ?)')
				.bind(transactionId, JSON.stringify(response))
		]);
	}
	await auditLogStatement(db, {
		email: actor,
		actorType,
		action: `Checked slip for transaction ${transactionId} from ${cached ? 'cache' : 'SlipOK API'}; ${response.success && response.data?.success ? 'bank verification succeeded' : `bank verification failed${!response.success && response.code ? ` (code ${response.code})` : ''}`}`,
		targets: [{ type: 'transaction', id: transactionId }]
	}).run();
	return response;
}

export async function approveVerifiedSlip(
	db: D1Database,
	transactionId: number,
	response: SlipOkResponse
) {
	if (!response.success || !response.data?.success) return false;
	if (!(await isAutomaticSlipProcessingEnabled(db))) return false;
	const slip = response.data;
	const target = await getPromptPayTarget(db);
	if (!target) return false;
	const transaction = await db
		.prepare('SELECT amount, email FROM transactions WHERE id = ?')
		.bind(transactionId)
		.first<{ amount: number; email: string }>();
	if (
		!transaction ||
		!(await verifySlipRecipient(db, transactionId, transaction.amount, response, target))
			.allChecksPassed
	)
		return false;
	// Recheck mutable inputs and duplicate reference atomically when approving.
	const [result] = await db.batch([
		db
			.prepare(
				`UPDATE transactions SET approved = 'approved', processor = ?
			WHERE id = ? AND approved = 'pending' AND type = 'payment' AND amount = ?
			AND EXISTS (SELECT 1 FROM app_settings WHERE key = ? AND value = '1')
			AND (SELECT COUNT(*) FROM transfer_promptpay) = 1
			AND EXISTS (SELECT 1 FROM transfer_promptpay WHERE target_type = ? AND target_info = ?)
			AND NOT EXISTS (SELECT 1 FROM slipok_cache WHERE trans_ref = ? AND sending_bank = ? AND transaction_id != ?)`
			)
			.bind(
				APPLICATION_PROCESSOR,
				transactionId,
				transaction.amount,
				AUTO_SLIP_SETTING,
				target.target_type,
				target.target_info,
				slip.transRef,
				slip.sendingBank,
				transactionId
			),
		auditLogStatement(db, {
			email: transaction.email,
			actorType: 'application',
			changedOnly: true,
			action: `Application approved transaction ${transactionId} after all slip checks passed`,
			targets: [{ type: 'transaction', id: transactionId }]
		})
	]);
	return result.meta.changes > 0;
}

export async function automaticallyProcessSlip(
	db: D1Database,
	transactionId: number,
	amount: number,
	image: ArrayBuffer,
	email: string
) {
	if (!(await isAutomaticSlipProcessingEnabled(db))) return false;
	if (!(await getPromptPayTarget(db))) return false;
	const response = await checkAndCacheSlip(
		db,
		transactionId,
		amount,
		async () => image,
		email,
		'application'
	);
	return approveVerifiedSlip(db, transactionId, response);
}
