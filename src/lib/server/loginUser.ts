import { error } from '@sveltejs/kit';
import type { User } from '$lib/types/AccountingDatabaseTypes';

export async function requireLoginUser(database: D1Database, email: string) {
	const user = await database
		.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL')
		.bind(email)
		.first<User>();
	if (!user) error(403, 'This account is not available for sign-in.');
	// The date controls billing only. Marking a departure blocks access immediately.
	if (user.left_at !== null)
		error(403, 'This account has been marked as left and can no longer sign in.');
	return user;
}
