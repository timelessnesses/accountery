import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

export const GET = async ({ params, platform, locals }) => {
	const target_user_slip = await platform?.env.AccountingDatabase.prepare(
		`
		SELECT * FROM transactions WHERE image = ? AND (? = 1 OR email = ?) LIMIT 1
	`
	)
		.bind(`/api/payments/${params.file}`, locals.user?.admin ? 1 : 0, locals.user?.email)
		.first<Transaction | null>();
	if (!target_user_slip) {
		return new Response('Not Found', { status: 404 });
	}
	if (locals.user?.admin !== true && target_user_slip.email !== locals.user?.email) {
		return new Response('Unauthorized', { status: 401 });
	}
	await platform?.env.AccountingDatabase.prepare(
		'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
	)
		.bind(
			locals.user?.email,
			`User ${locals.user?.email} requested payment slip image with key: ${params.file} And is the file exist: ${(await platform?.env.AccountingReceipts.get(params.file)) !== null}`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	return new Response((await platform?.env.AccountingReceipts.get(params.file))?.body ?? null, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'private, no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
