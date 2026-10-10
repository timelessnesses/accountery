import type { LogTarget } from '$lib/logTargets';

export function auditLogStatement(
	db: D1Database,
	entry: {
		email: string;
		action: string;
		targets?: LogTarget[];
		actorType?: 'user' | 'application';
		changedOnly?: boolean;
	}
) {
	return db
		.prepare(
			`INSERT INTO logs (email, action, timestamp, targets, actor_type)
		SELECT ?, ?, ?, ?, ? ${entry.changedOnly ? 'WHERE changes() > 0' : ''}`
		)
		.bind(
			entry.email,
			entry.action,
			Math.floor(Date.now() / 1000),
			JSON.stringify(entry.targets ?? []),
			entry.actorType ?? 'user'
		);
}
