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
	const cached = await platform?.env.AccounteryCaching.getWithMetadata('public-obligations-summary');
	let summary;
	if (cached && cached.value) {
		summary = JSON.parse(cached.value);
	} else {
		summary = await getPublicObligationSummary(database);
		await platform?.env.AccounteryCaching.put('public-obligations-summary', JSON.stringify(summary), {
			metadata: { createdAt: new Date().toISOString() },
			expirationTtl: 60
		});
	}
	if (!summary) error(404, 'The public payment summary is currently unavailable.');
	if (
		typeof summary.studentsWithUnpaidObligations === 'number' &&
		summary.studentsWithUnpaidObligations <= 10
	) {
		summary.studentsWithUnpaidObligations = '<=10';
	}
	return { summary };
};
