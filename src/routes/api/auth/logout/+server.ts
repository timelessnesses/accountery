export async function POST({ cookies, platform }) {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const token = cookies.get('token');

	if (token) {
		const user = await accountingDatabase
			.prepare('SELECT email FROM users WHERE session_token = ?')
			.bind(token)
			.first<{ email: string }>();

		if (user?.email) {
			await accountingDatabase
				.prepare('UPDATE users SET session_token = NULL, session_expiry = NULL WHERE email = ?')
				.bind(user.email)
				.run();

			await accountingDatabase.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)').bind(
				user.email,
				'User logged out and session token was reset.',
				Math.floor(Date.now() / 1000)
			).run();
		}
	}

	cookies.set('token', '', {
		path: '/',
		sameSite: 'strict',
		maxAge: 0,
		expires: new Date(0)
	});

	return new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}
