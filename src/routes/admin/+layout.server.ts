import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) {
		return redirect(308, '/login');
	}
	if (!locals.user.admin) {
		return redirect(307, '/');
	}
};
