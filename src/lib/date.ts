export function unixTimestampToDate(value: Date | number | string) {
	if (value instanceof Date) return value;

	const timestamp = Number(value);
	return new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
}
