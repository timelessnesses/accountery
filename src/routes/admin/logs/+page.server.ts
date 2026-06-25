import { unixTimestampToDate } from '$lib/date';
import type { Log } from '$lib/types/AccountingDatabaseTypes';

export const load = async ({ platform }) => {
    const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
    const logs = (
        await accountingDatabase
            .prepare('SELECT * FROM logs ORDER BY date DESC')
            .all<Log>()
    ).results.map((transaction) => ({
        ...transaction,
        date: unixTimestampToDate(transaction.date)
    })) as Log[];

    return { logs };
};
