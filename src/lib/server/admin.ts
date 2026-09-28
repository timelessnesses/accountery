import { error } from '@sveltejs/kit';

export function requireAdmin(user: App.Locals['user']) {
	if (!user) error(401, 'Sign in to continue');
	if (!user.admin) error(403, 'Administrator access required');
	return user;
}
