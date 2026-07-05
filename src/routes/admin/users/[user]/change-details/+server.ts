import { env } from '$env/dynamic/private';

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
