import { unixTimestampToDate } from '$lib/date';
import type { Log } from '$lib/types/AccountingDatabaseTypes';
import { error } from 'console';

export const load = async ({ platform, url }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
	const params = url.searchParams;
	const startDate = params.get('start_date');
	const endDate = params.get('end_date');
	const offset = parseInt(params.get('offset') || '0');
	const search = params.get('search') || '';

	if (startDate) {
		const start = new Date(parseInt(startDate) * 1000);
		if (isNaN(start.getTime())) {
			return error(400, 'Invalid start date');
		}
	}

	if (endDate) {
		const end = new Date(parseInt(endDate) * 1000);
		if (isNaN(end.getTime())) {
			return error(400, 'Invalid end date');
		}
	}

	const ow = whereClause(startDate, endDate, search);

	const logsQuery = (await accountingDatabase.prepare(
		`
		SELECT * FROM logs
		${ow.whereClause}
		ORDER BY timestamp DESC, id DESC
		LIMIT 25 OFFSET ?
		`
	).bind(...ow.whereParams, offset * 25).all<Log>()).results.map((log) => ({
		...log,
		date: unixTimestampToDate(log.timestamp)
	})) as Log[];

	const totalLogsCountQuery = await accountingDatabase.prepare(
		`
		SELECT COUNT(*) as count FROM logs
		${ow.whereClause}
		`
	).bind(...ow.whereParams).first<{ count: number }>();

	const totalLogsCount = totalLogsCountQuery?.count || 0;

	return {
		logs: logsQuery,
		totalLogsCount,
	};
};

function whereClause(startDate: string | null, endDate: string | null, search: string | null): {
	whereClause: string;
	whereParams: (string | number)[];
} { 
	if (!startDate && !endDate && !search) return { whereClause: '', whereParams: [] };

	let whereClause = '1=1 ';
	const whereParams: (string | number)[] = [];
	if (startDate) {
		whereClause += `AND timestamp >= ?`;
		whereParams.push(startDate);
	}
	if (endDate) {
		whereClause += `AND timestamp <= ?`;
		whereParams.push(endDate);
	}
	if (search) { 
		whereClause += `AND (email LIKE ? OR action LIKE ? OR id LIKE ?)`;
		whereParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
	}

	return { whereClause: `WHERE ${whereClause}`, whereParams };
}