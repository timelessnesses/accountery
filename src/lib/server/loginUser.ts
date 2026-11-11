import { error } from '@sveltejs/kit';
import type { User } from '$lib/types/AccountingDatabaseTypes';
import { isDepartedAccount } from './departedAccounts';

export async function requireLoginUser(database: D1Database, email: string, adminEmail: string) {
	let user = await database
		.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL')
		.bind(email)
		.first<User>();
	const isBootstrappedAdmin = email === adminEmail;
	if (isBootstrappedAdmin) {
		await database
			.prepare('INSERT OR IGNORE INTO users (email, name, nickname, role) VALUES (?, ?, ?, ?)')
			.bind(email, 'Administrator', 'Admin', 'admin')
			.run();
		user = await database
			.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL')
			.bind(email)
			.first<User>();
	}
	if (!user) error(403, 'This account is not available for sign-in.');
	if (user.left_at !== null)
		error(403, 'This account has been marked as left and can no longer sign in.');
	if (await isDepartedAccount(database, email))
		error(403, 'This account has been marked as left and can no longer sign in.');
	return user;
}
