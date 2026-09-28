import { isPublicObligationsEnabled } from '$lib/server/publicObligations';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => ({
	publicObligationsEnabled: await isPublicObligationsEnabled(platform!.env.AccountingDatabase)
});
