import { matchesPromptPayRecipient, type PromptPayTarget } from '$lib/promptpay';
import type { SlipOkResponse } from '$lib/slipOKAPI';
import type { SlipVerification } from '$lib/types/SlipVerification';

export async function verifySlipRecipient(
	db: D1Database,
	transactionId: number,
	amount: number,
	response: SlipOkResponse,
	target: PromptPayTarget | null
): Promise<SlipVerification> {
	const slip = response.success && response.data?.success ? response.data : null;
	const proxy = slip?.receiver?.proxy;
	const recipientTypeMatches = !!target && proxy?.type === target.target_type;
	const recipientValueMatches = !!target && matchesPromptPayRecipient(target, proxy);
	const amountMatches =
		!!slip && Number.isFinite(slip.amount) && Math.abs(slip.amount - amount) < 0.005;
	const hasReference = !!slip?.transRef && !!slip.sendingBank;
	const duplicate = hasReference
		? await db
				.prepare(
					`SELECT transaction_id FROM slipok_cache
		WHERE trans_ref = ? AND sending_bank = ? AND transaction_id != ? LIMIT 1`
				)
				.bind(slip.transRef, slip.sendingBank, transactionId)
				.first()
		: null;
	return {
		configured: !!target,
		recipientTypeMatches,
		recipientValueMatches,
		recipientValueMasked: !!proxy && /[xX*]/.test(proxy.value),
		amountMatches,
		duplicateSlip: !!duplicate,
		allChecksPassed:
			!!slip &&
			hasReference &&
			recipientTypeMatches &&
			recipientValueMatches &&
			amountMatches &&
			!duplicate
	};
}
