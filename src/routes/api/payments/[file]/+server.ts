export const GET = async ({ params, platform, locals}) => {
	await platform?.env.AccountingDatabase.prepare(
		'INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)'
	).bind(
		locals.user?.email,
		`User ${locals.user?.email} requested payment slip image with key: ${params.file} And is the file exist: ${await platform?.env.AccountingReceipts.get(params.file) !== null}`,
		Math.floor(Date.now() / 1000)
	).run();
	return new Response((await platform?.env.AccountingReceipts.get(params.file))?.body ?? null, {
		headers: {
			'Content-Type': 'image/png'
		}
	});
};
