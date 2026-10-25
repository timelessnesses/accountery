import { env } from '$env/dynamic/private';
import { isDepartedAccount } from '$lib/server/departedAccounts';

export const POST = async ({ request, platform, locals, params }) => {
	if (!locals.user || locals.user.email !== env.ADMIN_EMAIL || !locals.user.admin) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
	}

	const { email, name, nickname } = (await request.json()) as {
		email: string;
		name: string;
		nickname: string;
	};
	const target = params.user;
	const database = platform!.env.AccountingDatabase;
	const current = await database
		.prepare('SELECT left_at FROM users WHERE email = ?')
		.bind(target)
		.first<{ left_at: number | null }>();
	if (!current || current.left_at !== null || (await isDepartedAccount(database, email)))
		return new Response(
			JSON.stringify({ error: 'Departed account identities cannot be restored.' }),
			{ status: 409 }
		);

	if (!email.trim() || !name.trim() || !nickname.trim()) {
		return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
	}

	await platform?.env.AccountingDatabase.prepare(
		`
        UPDATE users
        SET email = ?, name = ?, nickname = ?
        WHERE email = ?
        `
	)
		.bind(email.trim(), name.trim(), nickname.trim(), target)
		.run();

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
