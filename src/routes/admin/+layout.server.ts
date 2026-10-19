import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) {
		return redirect(308, resolve('/login'));
	}
	if (!locals.user.admin) {
		return redirect(307, resolve('/'));
	}
	return { user: locals.user };
};
