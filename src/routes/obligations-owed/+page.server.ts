import { error } from '@sveltejs/kit';
import {
	getPublicObligationSummary,
	isPublicObligationsEnabled
} from '$lib/server/publicObligations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'no-store' });
	const database = platform!.env.AccountingDatabase;
	if (!(await isPublicObligationsEnabled(database)))
		error(404, 'The public payment summary is currently unavailable.');
	const summary = await getPublicObligationSummary(database);
	if (!summary) error(404, 'The public payment summary is currently unavailable.');
	if (typeof summary.studentsWithUnpaidObligations === "number" && summary.studentsWithUnpaidObligations <= 10) {
		summary.studentsWithUnpaidObligations = "<=10";
	}
	return { summary };
};
