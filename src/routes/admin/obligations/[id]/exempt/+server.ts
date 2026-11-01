import { requireAdmin } from '$lib/server/admin';
import { auditLogStatement } from '$lib/server/auditLog';
import { error, json } from '@sveltejs/kit';

type ExceptionObligationBody = {
	users: { email: string }[];
	grant_reason: string;
};

export async function POST({ params, request, locals, platform }) {
	const admin = requireAdmin(locals.user);
	if (!platform) error(500, 'Platform not available');
	const obligationId = Number(params.id);
	if (!Number.isSafeInteger(obligationId) || obligationId <= 0)
		return json({ error: 'Invalid obligation id.' }, { status: 400 });

	const data = (await request.json().catch(() => null)) as ExceptionObligationBody | null;
	const reason = typeof data?.grant_reason === 'string' ? data.grant_reason.trim() : '';
	const emails = Array.isArray(data?.users)
		? [
				...new Set(
					data.users
						.map((user) => (typeof user?.email === 'string' ? user.email.trim() : ''))
						.filter(Boolean)
				)
			]
		: [];
	if (!reason || reason.length > 500 || emails.length === 0 || emails.length > 50)
		return json(
			{ error: 'Select a user and enter a reason of at most 500 characters.' },
			{ status: 400 }
		);

	const db = platform.env.AccountingDatabase;
	const obligation = await db
		.prepare('SELECT id FROM obligations WHERE id = ? AND deleted_at IS NULL')
		.bind(obligationId)
		.first<{ id: number }>();
	if (!obligation) return json({ error: 'Obligation not found.' }, { status: 404 });

	const placeholders = emails.map(() => '?').join(', ');
	const targets = (
		await db
			.prepare(`SELECT email FROM users WHERE deleted_at IS NULL AND email IN (${placeholders})`)
			.bind(...emails)
			.all<{ email: string }>()
	).results;
	if (targets.length !== emails.length)
		return json({ error: 'One or more selected users are no longer available.' }, { status: 400 });

	const existing = await db
		.prepare(
			`SELECT email FROM exception_obligation WHERE obligation_id = ? AND voided_at IS NULL AND email IN (${placeholders})`
		)
		.bind(obligationId, ...emails)
		.all<{ email: string }>();
	const alreadyExcepted = new Set(existing.results.map(({ email }) => email));
	const newEmails = emails.filter((email) => !alreadyExcepted.has(email));
	if (newEmails.length === 0)
		return json(
			{ error: 'The selected user already has an active exception for this obligation.' },
			{ status: 409 }
		);

	const grantedAt = Math.floor(Date.now() / 1000);
	const statements = newEmails.map((email) =>
		db
			.prepare(
				`
				INSERT INTO exception_obligation (obligation_id, email, granted_by, granted_at, grant_reason)
				VALUES (?, ?, ?, ?, ?)
			`
			)
			.bind(obligationId, email, admin.email, grantedAt, reason)
	);
	statements.push(
		auditLogStatement(db, {
			email: admin.email,
			action: `Granted obligation #${obligationId} exception to ${newEmails.join(', ')}: ${reason}`,
			targets: [
				{ type: 'obligation', id: obligationId },
				...newEmails.map((email) => ({ type: 'user' as const, email }))
			]
		})
	);
	await db.batch(statements);
	return json({ success: true, count: newEmails.length });
}

export async function DELETE({ params, request, locals, platform }) {
	const admin = requireAdmin(locals.user);
	if (!platform) error(500, 'Platform not available');
	const obligationId = Number(params.id);
	if (!Number.isSafeInteger(obligationId) || obligationId <= 0)
		return json({ error: 'Invalid obligation id.' }, { status: 400 });

	const data = (await request.json().catch(() => null)) as { email?: unknown } | null;
	const email = typeof data?.email === 'string' ? data.email.trim() : '';
	if (!email) return json({ error: 'Select an exception to void.' }, { status: 400 });

	const db = platform.env.AccountingDatabase;
	const now = Math.floor(Date.now() / 1000);
	const results = await db.batch([
		db
			.prepare(
				`
				UPDATE exception_obligation SET voided_at = ?
				WHERE obligation_id = ? AND email = ? AND voided_at IS NULL
			`
			)
			.bind(now, obligationId, email),
		auditLogStatement(db, {
			email: admin.email,
			action: `Voided obligation #${obligationId} exception for ${email}`,
			targets: [
				{ type: 'obligation', id: obligationId },
				{ type: 'user', email }
			],
			changedOnly: true
		})
	]);
	if (!results[0].meta.changes)
		return json(
			{ error: 'This active exception was not found. Refresh and try again.' },
			{ status: 404 }
		);
	return json({ success: true });
}
