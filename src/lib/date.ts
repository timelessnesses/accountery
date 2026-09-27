export function unixTimestampToDate(value: Date | number | string) {
	if (value instanceof Date) return value;

	const timestamp = Number(value);
	return new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
}

/** Parse a calendar date at UTC midnight without accepting rolled-over dates. */
export function parseDateInput(value: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
	return Math.floor(date.getTime() / 1000);
}

/** Older weekly writers may omit end_date; retain their seven-day range. */
export function obligationDates(obligation: {
	start_date: Date | number | string;
	end_date?: Date | number | string | null;
}) {
	const start_date = unixTimestampToDate(obligation.start_date);
	const end_date =
		obligation.end_date == null
			? new Date(start_date.getTime() + 6 * 86400 * 1000)
			: unixTimestampToDate(obligation.end_date);
	return { start_date, end_date };
}
