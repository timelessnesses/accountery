import { error } from '@sveltejs/kit';
import { requireAdmin } from './admin';

export type InstanceStatus = 'active' | 'closing' | 'destroying' | 'destroyed';

export function isBootstrapAdministrator(user: App.Locals['user'], configuredEmail?: string) {
	return Boolean(
		user?.admin &&
		configuredEmail?.trim() &&
		user.email.toLowerCase() === configuredEmail.trim().toLowerCase()
	);
}

export function requireBootstrapAdministrator(user: App.Locals['user'], configuredEmail?: string) {
	const admin = requireAdmin(user);
	if (!isBootstrapAdministrator(admin, configuredEmail))
		error(403, 'Only the bootstrapped administrator can manage instance destruction.');
	return admin;
}

export async function getInstanceStatus(database: D1Database): Promise<InstanceStatus> {
	const row = await database
		.prepare("SELECT value FROM app_settings WHERE key = 'instance_status'")
		.first<{ value: InstanceStatus }>();
	return row?.value ?? 'active';
}

export async function getInstanceLifecycle(database: D1Database) {
	const { results } = await database
		.prepare(
			`SELECT key, value FROM app_settings
		WHERE key IN ('instance_status', 'instance_closed_at', 'instance_delete_after')`
		)
		.all<{ key: string; value: string }>();
	const settings = Object.fromEntries(results.map(({ key, value }) => [key, value]));
	return {
		status: (settings.instance_status ?? 'active') as InstanceStatus,
		closedAt: settings.instance_closed_at ? Number(settings.instance_closed_at) : null,
		deleteAfter: settings.instance_delete_after ? Number(settings.instance_delete_after) : null
	};
}

const unpaidSummarySql = `WITH balances AS (
		SELECT MAX(0,
			(SELECT COALESCE(SUM(CAST(ROUND(o.amount * 100) AS INTEGER)), 0) FROM obligations o
				WHERE o.deleted_at IS NULL AND (u.left_at IS NULL OR
				(CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END) < u.left_at)) -
			(SELECT COALESCE(SUM(CAST(ROUND(t.amount * 100) AS INTEGER)), 0) FROM transactions t
				WHERE t.email = u.email AND t.approved = 'approved')) AS owedCents
		FROM users u WHERE u.deleted_at IS NULL
	) SELECT COUNT(*) AS unpaidStudents, COALESCE(SUM(owedCents), 0) / 100.0 AS outstandingAmount
	FROM balances WHERE owedCents > 0`;

export async function getInstanceUnpaidSummary(database: D1Database) {
	return (await database
		.prepare(unpaidSummarySql)
		.first<{ unpaidStudents: number; outstandingAmount: number }>())!;
}

type DestructionEnv = Pick<Env, 'AccountingDatabase' | 'AccountingReceipts'>;

export async function destroyInstanceData(env: DestructionEnv, requireSettled = false) {
	const db = env.AccountingDatabase;
	if ((await getInstanceStatus(db)) === 'destroyed') return { deletedFiles: 0 };
	// Lock every writer before removing files. On failure this marker remains so
	// the owner or next hourly cron can safely resume instead of reopening access.
	if (requireSettled) {
		const result = await db
			.prepare(
				`UPDATE app_settings SET value = 'destroying'
			WHERE key = 'instance_status' AND value = 'active'
			AND NOT EXISTS (SELECT 1 FROM (${unpaidSummarySql}) WHERE unpaidStudents > 0)`
			)
			.run();
		if (!result.meta.changes)
			error(
				409,
				'Unpaid obligations or the instance status changed. Refresh and confirm the retention period before continuing.'
			);
	} else
		await db
			.prepare("UPDATE app_settings SET value = 'destroying' WHERE key = 'instance_status'")
			.run();
	let deletedFiles = 0;
	try {
		while (true) {
			// Re-list from the beginning after deleting a page; no cursor can skip
			// objects when the bucket's contents change as deletion progresses.
			const page = await env.AccountingReceipts.list({ limit: 500 });
			if (!page.objects.length) break;
			for (let offset = 0; offset < page.objects.length; offset += 100) {
				const keys = page.objects.slice(offset, offset + 100).map(({ key }) => key);
				await env.AccountingReceipts.delete(keys);
				deletedFiles += keys.length;
			}
		}
	} catch (cause) {
		console.error('Instance receipt cleanup failed:', cause);
		error(
			503,
			'The instance is locked, but receipt deletion is incomplete. Cleanup will retry hourly; the owner can also retry here.'
		);
	}
	const tables = [
		'notifications',
		'calendar_tokens',
		'slipok_cache',
		'logs',
		'transactions',
		'departed_account_blocks',
		'obligation_creation_pauses',
		'obligations',
		'transfer_promptpay',
		'users'
	];
	await db.batch([
		...tables.map((table) => db.prepare(`DELETE FROM ${table}`)),
		db.prepare("DELETE FROM app_settings WHERE key != 'instance_status'"),
		db.prepare("UPDATE app_settings SET value = 'destroyed' WHERE key = 'instance_status'")
	]);
	return { deletedFiles };
}

/** The main Worker's existing hourly cron is also the retention scheduler. */
export async function runScheduledInstanceDestruction(env: DestructionEnv, now: number) {
	const lifecycle = await getInstanceLifecycle(env.AccountingDatabase);
	if (lifecycle.status === 'destroyed') return true;
	if (
		lifecycle.status === 'destroying' ||
		(lifecycle.status === 'closing' &&
			lifecycle.deleteAfter !== null &&
			lifecycle.deleteAfter <= now)
	) {
		await destroyInstanceData(env);
		return true;
	}
	return lifecycle.status === 'closing';
}
