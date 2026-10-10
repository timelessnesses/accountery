import { error } from '@sveltejs/kit';
import { validateAmount } from '$lib/promptpay';
import { createPromptPayQr, getPromptPayTarget } from '$lib/server/promptpayQrCreator';

export const GET = async ({ locals, platform, url }) => {
	if (!locals.user) error(401, 'Sign in to generate a payment QR.');
	const input = url.searchParams.get('amount');
	if (!input || !/^\d+(?:\.\d{1,2})?$/.test(input))
		error(400, 'Enter a positive amount with at most two decimal places.');
	const amount = Number(input);
	try {
		validateAmount(amount);
	} catch (err) {
		error(400, (err as Error).message);
	}
	const db = platform?.env.AccountingDatabase;
	if (!db) error(503, 'Database unavailable.');
	const target = await getPromptPayTarget(db);
	if (!target) error(503, 'Payment QR unavailable. Ask an administrator to configure PromptPay.');
	return new Response(await createPromptPayQr(target, amount), {
		headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'private, no-store' }
	});
};
