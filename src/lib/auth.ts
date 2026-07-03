import { type User } from "./types/AccountingDatabaseTypes";

export async function verifySessionToken(
	token: string,
	env: Env
): Promise<{ email: string; name: string; nickname: string; admin: boolean }> {
	const db = env.AccountingDatabase;
	const stmt = db.prepare('SELECT * FROM users WHERE session_token = ? AND session_expiry > ?');
	const result = await stmt.bind(token, Date.now() / 1000).first<User>();
	if (!result) {
		throw new Error('Invalid session token');
	}
	console.log('User verified:', result.email, 'Admin:', result.role === 'admin');
	return {
		email: result.email,
		name: result.name,
		nickname: result.nickname,
		admin: result.role === 'admin' || result.email === env.ADMIN_EMAIL
	};
}
