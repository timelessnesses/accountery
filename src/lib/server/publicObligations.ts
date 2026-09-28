import { fail, type Actions } from '@sveltejs/kit';
import { applicableObligationSql } from './billing';
import { requireAdmin } from './admin';

export type PublicObligationBalance = {
	name: string;
	nickname: string;
	owed: number;
	pending: number;
	pendingCount: number;
};

export async function isPublicObligationsEnabled(database: D1Database) {
	const setting = await database
		.prepare("SELECT value FROM app_settings WHERE key = 'public_obligations_enabled'")
		.first<{ value: string }>();
	return setting?.value === '1';
}

export async function getPublicObligationBalances(database: D1Database) {
	// Only public fields leave the query: no account identifiers or payment records.
	const { results } = await database
		.prepare(
			`
		WITH balances AS (
			SELECT u.name, u.nickname,
				(SELECT COALESCE(SUM(o.amount), 0) FROM obligations o
					WHERE ${applicableObligationSql}) -
				(SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
					WHERE t.email = u.email AND t.approved = 'approved') AS owed,
				(SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
					WHERE t.email = u.email AND t.approved = 'pending') AS pending,
				(SELECT COUNT(*) FROM transactions t
					WHERE t.email = u.email AND t.approved = 'pending') AS pendingCount
			FROM users u WHERE u.deleted_at IS NULL
		)
		SELECT name, nickname, owed, pending, pendingCount FROM balances
		WHERE owed > 0 AND EXISTS (
			SELECT 1 FROM app_settings WHERE key = 'public_obligations_enabled' AND value = '1'
		)
		ORDER BY owed DESC, name, nickname
	`
		)
		.all<PublicObligationBalance>();
	return results;
}

export const publicObligationActions = {
	setPublicObligations: async ({ locals, platform, request }) => {
		const admin = requireAdmin(locals.user);
		const value = (await request.formData()).get('enabled');
		if (value !== '0' && value !== '1')
			return fail(400, { ok: false, message: 'Invalid public page setting.' } as const);
		const database = platform!.env.AccountingDatabase;
		await database.batch([
			database
				.prepare(
					`INSERT INTO app_settings (key, value) VALUES ('public_obligations_enabled', ?)
				ON CONFLICT(key) DO UPDATE SET value = excluded.value`
				)
				.bind(value),
			database
				.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
				.bind(
					admin.email,
					`${value === '1' ? 'Enabled' : 'Disabled'} the public obligations owed page`,
					Math.floor(Date.now() / 1000)
				)
		]);
		return { ok: true } as const;
	}
} satisfies Actions;
