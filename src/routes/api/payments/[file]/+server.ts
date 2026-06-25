export const GET = async ({ params, platform }) => {
	return new Response((await platform?.env.AccountingReceipts.get(params.file))?.body ?? null, {
		headers: {
			'Content-Type': 'image/png'
		}
	});
};
