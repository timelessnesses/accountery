import { auditLogStatement } from '$lib/server/auditLog';

export const POST = async ({ locals, params, platform, request }) => {
	if (!locals.user) {
		throw new Response('Unauthorized', { status: 401 });
	}

	if (!locals.user.admin) {
		throw new Response('Forbidden', { status: 403 });
	}

	const { admin } = (await request.json()) as {
		admin?: boolean;
	};

	if (admin === undefined) {
		throw new Response('Invalid admin status', { status: 400 });
	}

	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;

	const result = await accountingDatabase
		.prepare(
			`
            UPDATE users
            SET role = ?
            WHERE email = ?
        `
		)
		.bind(admin ? 'admin' : 'student', params.user)
		.run();

	if (result.meta.changes === 0) {
		throw new Response('User not found', { status: 404 });
	}
	await auditLogStatement(accountingDatabase, {
		email: locals.user.email,
		action: `Changed permissions for ${params.user} to ${admin ? 'admin' : 'student'}`,
		targets: [{ type: 'user', email: params.user }]
	}).run();

	return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
