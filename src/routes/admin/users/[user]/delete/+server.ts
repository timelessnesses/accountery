import { json } from '@sveltejs/kit';

export const POST = async ({ params, platform, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	if (!locals.user.admin) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const userEmail = params.user;

	if (!userEmail) {
		return json({ error: 'User email is required' }, { status: 400 });
	}

	const env = platform?.env as Env | undefined;

	try {
		const user = await env?.AccountingDatabase.prepare('SELECT left_at FROM users WHERE email = ?')
			.bind(userEmail)
			.first<{ left_at: number | null }>();
		if (user && user.left_at !== null) {
			// Keep the departure record so deleting/reimporting cannot re-enable sign-in.
			await env?.AccountingDatabase.prepare('UPDATE users SET deleted_at = ? WHERE email = ?')
				.bind(Math.floor(Date.now() / 1000), userEmail)
				.run();
		} else
			await env?.AccountingDatabase.prepare('DELETE FROM users WHERE email = ?')
				.bind(userEmail)
				.run();
		await env?.AccountingDatabase.prepare(
			'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
		)
			.bind(
				locals.user.email,
				`Admin ${locals.user.email} deleted user with email: ${userEmail}`,
				Math.floor(Date.now() / 1000)
			)
			.run();
		return json({ ok: true });
	} catch {
		await env?.AccountingDatabase.prepare(`UPDATE users SET deleted_at = ? WHERE email = ?`)
			.bind(Math.floor(Date.now() / 1000), userEmail)
			.run();
		await env?.AccountingDatabase.prepare(
			'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
		)
			.bind(
				locals.user.email,
				`Admin ${locals.user.email} marked user with email: ${userEmail} as deleted`,
				Math.floor(Date.now() / 1000)
			)
			.run();
		return json({ ok: true });
	}
};
