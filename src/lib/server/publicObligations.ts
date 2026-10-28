import { fail, type Actions } from '@sveltejs/kit';
import { applicableObligationSql } from './billing';
import { requireAdmin } from './admin';
import { auditLogStatement } from './auditLog';

export type PublicObligationSummary = {
	outstandingAmount: number;
	unfulfilledObligations: number;
	studentsWithUnpaidObligations: number | string;
	// pendingAmount: number;
	remainingAfterPending: number;
	totalObligations: number;
	fulfilledObligations: number;
};

export async function isPublicObligationsEnabled(database: D1Database) {
	const setting = await database
		.prepare("SELECT value FROM app_settings WHERE key = 'public_obligations_enabled'")
		.first<{ value: string }>();
	return setting?.value === '1';
}

export async function getPublicObligationSummary(database: D1Database) {
	// Allocate approved funds oldest first, as on the private payment pages.
	// Work in integer cents and return only a single aggregate row from SQL.
	return database
		.prepare(
			`
		WITH funds AS (
			SELECT u.email, u.left_at,
				(SELECT COALESCE(SUM(CAST(ROUND(t.amount * 100) AS INTEGER)), 0)
					FROM transactions t WHERE t.email = u.email AND t.approved = 'approved') AS approvedCents,
				(SELECT COALESCE(SUM(CAST(ROUND(t.amount * 100) AS INTEGER)), 0)
					FROM transactions t WHERE t.email = u.email AND t.approved = 'pending') AS pendingCents
			FROM users u WHERE u.deleted_at IS NULL
		), assigned AS (
			SELECT u.email, u.approvedCents, u.pendingCents,
				CAST(ROUND(o.amount * 100) AS INTEGER) AS amountCents,
				SUM(CAST(ROUND(o.amount * 100) AS INTEGER)) OVER (
					PARTITION BY u.email
					ORDER BY CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END, o.id
					ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
				) AS dueCents
			FROM funds u JOIN obligations o ON ${applicableObligationSql}
		), balances AS (
			SELECT email, MAX(dueCents) AS dueCents, approvedCents, pendingCents
			FROM assigned GROUP BY email
		), counts AS (
			SELECT COUNT(*) AS totalObligations,
				COUNT(CASE WHEN amountCents > 0 AND dueCents > approvedCents THEN 1 END) AS unfulfilledObligations
			FROM assigned
		)
		SELECT
			COALESCE((SELECT SUM(MAX(dueCents - approvedCents, 0)) FROM balances), 0) / 100.0 AS outstandingAmount,
			unfulfilledObligations,
			(SELECT COUNT(*) FROM balances WHERE dueCents > approvedCents) AS studentsWithUnpaidObligations,
			COALESCE((SELECT SUM(MAX(dueCents - approvedCents - MAX(pendingCents, 0), 0)) FROM balances), 0) / 100.0 AS remainingAfterPending,
			totalObligations, totalObligations - unfulfilledObligations AS fulfilledObligations
		FROM counts WHERE EXISTS (
			SELECT 1 FROM app_settings WHERE key = 'public_obligations_enabled' AND value = '1'
		)
	`
		)
		.first<PublicObligationSummary>();
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
			auditLogStatement(database, {
				email: admin.email,
				action: `${value === '1' ? 'Enabled' : 'Disabled'} the public obligations owed page`,
				targets: [{ type: 'settings', section: 'public-obligations' }]
			})
		]);
		return { ok: true } as const;
	}
} satisfies Actions;
