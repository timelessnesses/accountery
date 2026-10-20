import { resolve } from '$app/paths';
import { error, redirect } from '@sveltejs/kit';
import { checkSlip } from '$lib/slipOKAPI';
import { validateAmount } from '$lib/promptpay';
import { getPromptPayTarget } from '$lib/server/promptpayQrCreator';
import { verifySlipRecipient } from '$lib/server/slipVerification';
import { DuplicateSlipError, submitPayment } from '$lib/server/paymentSubmission';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) error(401, 'Sign in before sharing a payment slip.');
	const fail = (code: string): never => redirect(303, resolve('/') + '?share=' + code);
	const form = await request.formData().catch(() => null);
	const files = form?.getAll('file');
	const file = files?.[0];
	if (files?.length !== 1 || !(file instanceof File) || !file.size) return fail('missing-file');
	if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return fail('invalid-image');
	if (file.size > 10 * 1024 * 1024) return fail('too-large');
	const env = platform!.env;
	if (!env.SLIP_OK_API_KEY || !env.SLIP_OK_API_ENDPOINT) return fail('not-configured');
	const image = await file.arrayBuffer();
	let response;
	try {
		response = await checkSlip(image);
	} catch {
		return fail('verification-unavailable');
	}
	if (!response.success || !response.data?.success) return fail('invalid-slip');
	const amount = response.data.amount;
	try {
		validateAmount(amount);
	} catch {
		return fail('invalid-amount');
	}
	const target = await getPromptPayTarget(env.AccountingDatabase);
	const verification = await verifySlipRecipient(
		env.AccountingDatabase,
		-1,
		amount,
		response,
		target
	);
	if (verification.duplicateSlip) return fail('duplicate');
	if (!verification.allChecksPassed) return fail('wrong-recipient');
	let result;
	try {
		result = await submitPayment(
			env,
			locals.user.email,
			amount,
			'Payment shared from slip',
			new Uint8Array(image),
			response
		);
	} catch (err) {
		if (err instanceof DuplicateSlipError) return fail('duplicate');
		console.error('Shared payment submission failed:', err);
		return fail('save-failed');
	}
	return redirect(
		303,
		resolve('/') + '?share=' + (result.automaticallyApproved ? 'approved' : 'submitted')
	);
};
