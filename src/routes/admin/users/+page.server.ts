import { getUserBalances } from '$lib/server/billing';

export const load = async ({ platform }) => {
	const transactionsFromUser = await getUserBalances(platform!.env.AccountingDatabase);
	return { transactionsFromUser };
};
