export const POST = async ({ params, platform, locals }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	await accountingDatabase
		.prepare(
			`
        UPDATE users
        SET session_token = NULL,
            session_expiry = NULL
        WHERE email = ?
    `
		)
		.bind(params.user)
		.run();
	await accountingDatabase
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			params.user,
			`Admin ${locals.user?.email} reset session for user ${params.user}`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	return new Response(null, { status: 200 });
};
