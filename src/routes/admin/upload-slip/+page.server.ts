import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { validateAmount } from '$lib/promptpay';
import { submitPayment } from '$lib/server/paymentSubmission';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, locals }) => {
	requireAdmin(locals.user);
	const { results: uploadUsers } = await platform!.env.AccountingDatabase.prepare(
		'SELECT email, name, nickname FROM users WHERE deleted_at IS NULL AND left_at IS NULL ORDER BY name, email'
	).all<{ email: string; name: string; nickname: string }>();
	return { uploadUsers };
};

export const actions: Actions = {
	uploadSlip: async ({ locals, platform, request }) => {
		const admin = requireAdmin(locals.user);
		const env = platform!.env;
		const form = await request.formData().catch(() => null);
		if (!form) return fail(400, { ok: false, message: 'Invalid upload. Please try again.' });
		const email = form.get('email');
		const note = form.get('note');
		const amount = Number(form.get('amount'));
		if (typeof email !== 'string' || !email.trim())
			return fail(400, { ok: false, message: 'Select a target user from the suggestions.' });
		const target = await env.AccountingDatabase.prepare(
			'SELECT email FROM users WHERE email = ? AND deleted_at IS NULL AND left_at IS NULL'
		)
			.bind(email.trim())
			.first<{ email: string }>();
		if (!target)
			return fail(400, {
				ok: false,
				message: 'This user is no longer available. Select another user.'
			});
		try {
			validateAmount(amount);
		} catch {
			return fail(400, {
				ok: false,
				message:
					'Enter a positive amount with at most two decimal places (maximum 9,999,999,999.99 baht).'
			});
		}
		if (typeof note !== 'string' || !note.trim() || note.trim().length > 2000)
			return fail(400, { ok: false, message: 'Enter a payment note of at most 2000 characters.' });
		const files = form.getAll('slip');
		const file = files[0];
		if (files.length !== 1 || !(file instanceof File) || !file.size)
			return fail(400, { ok: false, message: 'Attach one payment slip.' });
		if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
			return fail(400, { ok: false, message: 'Use a PNG, JPEG, or WebP image.' });
		if (file.size > 10 * 1024 * 1024)
			return fail(413, { ok: false, message: 'The slip must be at most 10 MB.' });
		const result = await submitPayment(
			env,
			target.email,
			amount,
			note,
			new Uint8Array(await file.arrayBuffer()),
			undefined,
			{ actorEmail: admin.email }
		);
		return {
			ok: true,
			transactionId: result.transactionId,
			message: `Slip uploaded for ${target.email}. Transaction #${result.transactionId} is waiting for approval.`
		};
	}
};
