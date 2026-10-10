import { error } from '@sveltejs/kit';
import { parseDateInput, unixTimestampToDate } from '$lib/date';
import type { Log } from '$lib/types/AccountingDatabaseTypes';
import type { PageServerLoad } from './$types';
import { getLogTargets, positiveId } from '$lib/logTargets';

const pageSize = 25;
const bangkokOffset = 7 * 60 * 60;

/** Accept older timestamp links as well as calendar dates from the filter controls. */
function dateFilter(raw: string | null, label: string) {
	if (!raw) return '';
	let value = raw;
	if (/^\d+$/.test(raw)) {
		const date = new Date((Number(raw) + bangkokOffset) * 1000);
		if (!Number.isFinite(date.getTime())) error(400, `Invalid ${label} date`);
		value = date.toISOString().slice(0, 10);
	}
	if (parseDateInput(value) === null) error(400, `Invalid ${label} date`);
	return value;
}

export const load: PageServerLoad = async ({ platform, url }) => {
	const db = platform!.env.AccountingDatabase;
	const startDate = dateFilter(url.searchParams.get('start_date'), 'start');
	const endDate = dateFilter(url.searchParams.get('end_date'), 'end');
	const search = (url.searchParams.get('search') ?? '').trim();
	const requestedOffset = Number(url.searchParams.get('offset') || '0');
	const highlightedId = positiveId(url.searchParams.get('highlightLogId'));
	if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) error(400, 'Invalid page');
	if (startDate && endDate && startDate > endDate)
		error(400, 'End date must be on or after start date');

	const clauses: string[] = [];
	const params: (string | number)[] = [];
	if (startDate) {
		clauses.push('timestamp >= ?');
		params.push(parseDateInput(startDate)! - bangkokOffset);
	}
	if (endDate) {
		clauses.push('timestamp < ?');
		params.push(parseDateInput(endDate)! - bangkokOffset + 86400);
	}
	if (search) {
		clauses.push('(email LIKE ? OR action LIKE ? OR id LIKE ? OR targets LIKE ?)');
		params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
	}
	const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
	const count = await db
		.prepare(`SELECT COUNT(*) AS count FROM logs ${where}`)
		.bind(...params)
		.first<{ count: number }>();
	const totalLogsCount = count?.count ?? 0;
	const totalPages = Math.max(1, Math.ceil(totalLogsCount / pageSize));
	let offset = Math.min(requestedOffset, totalPages - 1);
	let highlightedLogFound = false;
	if (highlightedId !== null) {
		const target = await db
			.prepare(
				`SELECT timestamp FROM logs WHERE id = ? ${clauses.length ? `AND ${clauses.join(' AND ')}` : ''}`
			)
			.bind(highlightedId, ...params)
			.first<{ timestamp: number }>();
		if (target) {
			highlightedLogFound = true;
			const before = await db
				.prepare(
					`SELECT COUNT(*) AS count FROM logs ${where ? `${where} AND` : 'WHERE'} (timestamp > ? OR (timestamp = ? AND id > ?))`
				)
				.bind(...params, target.timestamp, target.timestamp, highlightedId)
				.first<{ count: number }>();
			offset = Math.floor((before?.count ?? 0) / pageSize);
		}
	}
	const result = await db
		.prepare(`SELECT * FROM logs ${where} ORDER BY timestamp DESC, id DESC LIMIT ? OFFSET ?`)
		.bind(...params, pageSize, offset * pageSize)
		.all<Log>();
	return {
		logs: result.results.map((log) => ({
			...log,
			actor_type:
				log.actor_type === 'application' || /^Application approved transaction /.test(log.action)
					? ('application' as const)
					: ('user' as const),
			date: unixTimestampToDate(log.timestamp),
			links: getLogTargets(log)
		})),
		highlightedId,
		highlightedLogFound,
		totalLogsCount,
		totalPages,
		pageSize,
		offset,
		filters: { startDate, endDate, search }
	};
};
