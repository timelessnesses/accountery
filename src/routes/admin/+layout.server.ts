import { administrators } from '$lib/whitelisted.js';
import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) {
		return redirect(308, '/login');
	}
	if (!Object.keys(administrators).includes(locals.user.email.split('@')[0])) {
		return redirect(307, '/');
	}
};
