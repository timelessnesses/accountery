export async function POST({ cookies, platform, locals }) {
	await platform?.env.AccountingDatabase
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			locals.user?.email,
			`User logged out.`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	
	await platform?.env.AccountingDatabase
		.prepare("UPDATE users")
	
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
