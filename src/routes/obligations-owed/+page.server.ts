import { error } from '@sveltejs/kit';
import {
	getPublicObligationBalances,
	isPublicObligationsEnabled
} from '$lib/server/publicObligations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'no-store' });
	const database = platform!.env.AccountingDatabase;
	if (!(await isPublicObligationsEnabled(database)))
		error(404, 'The public database is currently unavailable.');
	return { balances: await getPublicObligationBalances(database) };
};
