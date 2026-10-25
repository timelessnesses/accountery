import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';
import { env as privateEnv } from '$env/dynamic/private';
import { getInstanceLifecycle, isBootstrapAdministrator } from '$lib/server/instanceLifecycle';

export const load = async ({ locals, platform }) => {
	if (!locals.user) {
		return redirect(308, resolve('/login'));
	}
	if (!locals.user.admin) {
		return redirect(307, resolve('/'));
	}
	return {
		user: locals.user,
		isBootstrapAdministrator: isBootstrapAdministrator(
			locals.user,
			platform?.env.ADMIN_EMAIL ?? privateEnv.ADMIN_EMAIL
		),
		instanceLifecycle: await getInstanceLifecycle(platform!.env.AccountingDatabase)
	};
};
