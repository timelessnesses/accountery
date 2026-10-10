import { fail } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { getPromptPayTarget } from '$lib/server/promptpayQrCreator';
import { parsePromptPayPayload } from '$lib/promptpay';
import { AUTO_SLIP_SETTING, isAutomaticSlipProcessingEnabled } from '$lib/server/slipProcessing';
import { auditLogStatement } from '$lib/server/auditLog';

export const load = async ({ locals, platform }) => {
	requireAdmin(locals.user);
	const db = platform!.env.AccountingDatabase;
	return {
		recipient: await getPromptPayTarget(db),
		automaticSlipProcessing: await isAutomaticSlipProcessingEnabled(db)
	};
};

export const actions = {
	default: async ({ locals, platform, request }) => {
		const admin = requireAdmin(locals.user);
		const form = await request.formData();
		const db = platform!.env.AccountingDatabase;
		if (form.get('intent') === 'automaticSlipProcessing') {
			const enabled = form.get('enabled');
			if (enabled !== '0' && enabled !== '1')
				return fail(400, { saved: false, message: 'Invalid automatic approval setting.' });
			if (enabled === '1' && !(await getPromptPayTarget(db)))
				return fail(400, {
					saved: false,
					message: 'Save the receiving account before enabling automatic approval.'
				});
			await db.batch([
				db
					.prepare(
						'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
					)
					.bind(AUTO_SLIP_SETTING, enabled),
				auditLogStatement(db, {
					email: admin.email,
					action: `${enabled === '1' ? 'Enabled' : 'Disabled'} automatic slip approval`,
					targets: [{ type: 'settings', section: 'automatic-slip' }]
				})
			]);
			return {
				saved: true,
				message: `Automatic slip approval ${enabled === '1' ? 'enabled' : 'disabled'}.`
			};
		}
		const payload = form.get('payload');
		let target;
		try {
			if (typeof payload !== 'string') throw new Error('Upload a PromptPay QR image first.');
			target = parsePromptPayPayload(payload);
		} catch (err) {
			return fail(400, { message: (err as Error).message });
		}
		await db.batch([
			db.prepare('DELETE FROM transfer_promptpay'),
			db
				.prepare('INSERT INTO transfer_promptpay (target_type, target_info) VALUES (?, ?)')
				.bind(target.target_type, target.target_info),
			auditLogStatement(db, {
				email: admin.email,
				action: `Admin ${admin.email} updated the PromptPay recipient from a QR image`,
				targets: [{ type: 'settings', section: 'promptpay' }]
			})
		]);
		return {
			message:
				'PromptPay recipient saved. Payment QR codes and slip checks now use this recipient.',
			saved: true
		};
	}
};
