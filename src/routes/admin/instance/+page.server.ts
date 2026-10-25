import { env as privateEnv } from '$env/dynamic/private';
import { fail } from '@sveltejs/kit';
import { parseDateInput } from '$lib/date';
import { auditLogStatement } from '$lib/server/auditLog';
import {
	requireBootstrapAdministrator,
	getInstanceLifecycle,
	getInstanceUnpaidSummary,
	destroyInstanceData
} from '$lib/server/instanceLifecycle';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, platform, setHeaders }) => {
	requireBootstrapAdministrator(locals.user, platform!.env.ADMIN_EMAIL ?? privateEnv.ADMIN_EMAIL);
	setHeaders({ 'Cache-Control': 'no-store' });
	const db = platform!.env.AccountingDatabase;
	return { lifecycle: await getInstanceLifecycle(db), unpaid: await getInstanceUnpaidSummary(db) };
};

export const actions: Actions = {
	destroy: async ({ locals, platform, request, url, cookies }) => {
		const admin = requireBootstrapAdministrator(
			locals.user,
			platform!.env.ADMIN_EMAIL ?? privateEnv.ADMIN_EMAIL
		);
		if (request.headers.get('origin') !== url.origin)
			return fail(403, { ok: false, message: 'Invalid request origin.' });
		const form = await request.formData().catch(() => null);
		if (form?.get('confirmation') !== 'DESTROY THIS INSTANCE')
			return fail(400, { ok: false, message: 'Type DESTROY THIS INSTANCE to confirm.' });
		if (form.get('acknowledgement') !== 'yes')
			return fail(400, {
				ok: false,
				message: 'Confirm that you understand the consequences by checking the acknowledgement.'
			});
		const db = platform!.env.AccountingDatabase;
		const lifecycle = await getInstanceLifecycle(db);
		if (lifecycle.status === 'closing')
			return fail(409, {
				ok: false,
				message: 'Destruction is already scheduled. The 90-day retention period cannot be bypassed.'
			});
		if (lifecycle.status === 'active') {
			const value = form.get('closingDate');
			const date = typeof value === 'string' ? parseDateInput(value) : null;
			if (date === null) return fail(400, { ok: false, message: 'Choose a valid closing date.' });
			// The selected date is midnight in Bangkok; retain for 90 calendar days.
			const closedAt = date - 7 * 3600;
			const deleteAfter = closedAt + 90 * 86400;
			if (closedAt > Date.now() / 1000)
				return fail(400, { ok: false, message: 'The closing date cannot be in the future.' });
			const unpaid = await getInstanceUnpaidSummary(db);
			const retention = form.get('retention');
			if (retention !== '90' && retention !== '0')
				return fail(400, {
					ok: false,
					message: 'Refresh this page before confirming destruction.'
				});
			if (unpaid.unpaidStudents > 0 || retention === '90') {
				if (retention !== '90')
					return fail(409, {
						ok: false,
						message:
							'Unpaid obligations now exist. Refresh and confirm the 90-day retention period.'
					});
				await db.batch([
					...[
						['instance_closed_at', String(closedAt)],
						['instance_delete_after', String(deleteAfter)],
						['instance_status', 'closing']
					].map(([key, value]) =>
						db
							.prepare(
								`INSERT INTO app_settings (key, value) VALUES (?, ?)
						ON CONFLICT(key) DO UPDATE SET value = excluded.value`
							)
							.bind(key, value)
					),
					auditLogStatement(db, {
						email: admin.email,
						action: `Closed instance on ${value}; destruction scheduled after 90 days on ${new Date(deleteAfter * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })}; ${unpaid.unpaidStudents} unpaid student(s)`
					})
				]);
				return {
					ok: true,
					scheduled: true,
					message:
						'The instance is closed. Data and receipt files will be deleted 90 days after the closing date by the hourly cleanup.'
				};
			}
		}
		await destroyInstanceData(platform!.env, lifecycle.status === 'active');
		cookies.delete('token', { path: '/' });
		return {
			ok: true,
			destroyed: true,
			message:
				'This instance has been destroyed. Application records and receipt files were deleted.'
		};
	}
};
