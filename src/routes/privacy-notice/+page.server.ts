import { resolve } from '$app/paths';
import { error, fail, redirect } from '@sveltejs/kit';
import {
	PRIVACY_NOTICE_VERSION,
	PRIVACY_NOTICE_LABEL,
	safeNoticeReturnTo
} from '$lib/privacyNotice';
import { requireLoginUser } from '$lib/server/loginUser';
import { auditLogStatement } from '$lib/server/auditLog';
import { getInstanceStatus } from '$lib/server/instanceLifecycle';
import type { Actions, PageServerLoad } from './$types';
import markdown from '../../../static/privacy-markdown/v1.md?raw';
import { renderMarkdown } from '$lib/server/markdown';

const html = renderMarkdown(markdown);

export const load: PageServerLoad = async ({ locals, platform, url, setHeaders }) => {
	if (!locals.user) redirect(303, resolve('/login'));
	setHeaders({ 'Cache-Control': 'no-store' });
	const user = await requireLoginUser(platform!.env.AccountingDatabase, locals.user.email);
	const next = safeNoticeReturnTo(url.searchParams.get('next'));
	if (user.privacy_policy_read_version >= PRIVACY_NOTICE_VERSION) redirect(303, next);
	return {
		html,
		user: { name: user.name, email: user.email },
		next,
		pushPublicKey:
			platform!.env.VAPID_PUBLIC_KEY && platform!.env.VAPID_PRIVATE_KEY
				? platform!.env.VAPID_PUBLIC_KEY
				: null
	};
};

export const actions: Actions = {
	default: async ({ locals, platform, request, url }) => {
		if (!locals.user) error(401, 'Sign in to acknowledge the privacy notice.');
		if (request.headers.get('origin') !== url.origin) error(403, 'Invalid request origin.');
		const db = platform!.env.AccountingDatabase;
		await requireLoginUser(db, locals.user.email);
		if ((await getInstanceStatus(db)) !== 'active')
			error(403, 'This instance is closed for changes.');
		const form = await request.formData().catch(() => null);
		if (form?.get('acknowledgement') !== 'yes')
			return fail(400, { message: 'โปรดยืนยันว่าได้อ่านและรับทราบประกาศความเป็นส่วนตัวแล้ว' });
		const next = safeNoticeReturnTo(form.get('next'));
		await db.batch([
			db
				.prepare(
					`UPDATE users SET privacy_policy_read_version = ?
				WHERE email = ? AND deleted_at IS NULL AND left_at IS NULL
				AND privacy_policy_read_version < ?
				AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'instance_status' AND value != 'active')`
				)
				.bind(PRIVACY_NOTICE_VERSION, locals.user.email, PRIVACY_NOTICE_VERSION),
			auditLogStatement(db, {
				email: locals.user.email,
				action: `Acknowledged privacy notice version ${PRIVACY_NOTICE_LABEL}`,
				changedOnly: true,
				targets: [{ type: 'user', email: locals.user.email }]
			})
		]);
		const current = await requireLoginUser(db, locals.user.email);
		if (current.privacy_policy_read_version < PRIVACY_NOTICE_VERSION)
			error(409, 'The account or instance changed. Reload the privacy notice before continuing.');
		redirect(303, next);
	}
};
