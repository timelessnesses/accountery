import QRCode from 'qrcode';
import { createPromptPayPayload, validateTarget, type PromptPayTarget } from '$lib/promptpay';

export async function getPromptPayTarget(db: D1Database): Promise<PromptPayTarget | null> {
	const { results } = await db
		.prepare('SELECT target_type, target_info FROM transfer_promptpay LIMIT 2')
		.all<PromptPayTarget>();
	if (results.length === 0) return null;
	if (results.length !== 1)
		throw new Error('Configure exactly one PromptPay recipient in the admin page.');
	return validateTarget(results[0]);
}

export async function createPromptPayQr(target: PromptPayTarget, amount: number): Promise<string> {
	return QRCode.toString(createPromptPayPayload(target, amount), {
		type: 'svg',
		errorCorrectionLevel: 'M',
		margin: 4,
		width: 512,
		color: { dark: '#000000', light: '#ffffff' }
	});
}
