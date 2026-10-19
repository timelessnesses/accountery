import { buildPushPayload } from '@block65/webcrypto-web-push';
import { isPushEndpoint } from '../src/lib/server/pushSubscription';
import { createDailyReminders, retireSettledReminders } from './reminders';

export interface NotificationEnv {
	AccountingDatabase: D1Database;
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
	VAPID_SUBJECT?: string;
	ADMIN_EMAIL?: string;
}

type Delivery = {
	notification_id: number;
	endpoint: string;
	email: string;
	p256dh: string;
	auth: string;
	title: string;
	body: string;
	url: string;
	attempts: number;
};

export async function syncReviewNotifications(db: D1Database, adminEmail = '') {
	await db
		.prepare(
			`INSERT INTO app_settings (key, value) VALUES ('notification_admin_email', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE value != excluded.value`
		)
		.bind(adminEmail)
		.run();
	// Covers the bootstrap ADMIN_EMAIL too, including payments submitted before
	// that admin first opened the inbox. The unique event key makes retries safe.
	await db
		.prepare(
			`INSERT OR IGNORE INTO notifications (email, event_key, kind, title, body, url)
		SELECT u.email, 'review:' || t.id, 'review', 'Payment awaiting approval',
			substr(payer.name, 1, 150) || ' submitted ฿' || printf('%.2f', t.amount) || ' for review.', '/admin/transactions'
		FROM transactions t JOIN users payer ON payer.email = t.email
		JOIN users u ON u.deleted_at IS NULL AND u.left_at IS NULL AND (u.role = 'admin' OR u.email = ?)
		WHERE t.approved = 'pending'`
		)
		.bind(adminEmail)
		.run();
}

export async function deliverPush(
	env: NotificationEnv,
	now = Math.floor(Date.now() / 1000),
	send: typeof fetch = fetch
) {
	const db = env.AccountingDatabase;
	// A payment may have arrived while push was being retried. Retire that
	// reminder instead of sending a now-incorrect payment request.
	await retireSettledReminders(db, now);
	if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
		console.warn(
			'Push delivery disabled: configure all three VAPID secrets. Inbox notifications remain available.'
		);
		return;
	}
	// Only notify devices already subscribed when an event was created. Reading
	// a notification before dispatch suppresses its push; the inbox keeps history.
	await db
		.prepare(
			`INSERT OR IGNORE INTO push_deliveries (notification_id, endpoint)
		SELECT n.id, s.endpoint FROM notifications n JOIN push_subscriptions s ON s.email = n.email
		JOIN users u ON u.email = n.email
		WHERE n.created_at >= ? AND s.created_at <= n.created_at AND n.read_at IS NULL
		AND u.deleted_at IS NULL AND u.left_at IS NULL
		AND (n.kind != 'review' OR u.role = 'admin' OR u.email = ?)`
		)
		.bind(now - 86400, env.ADMIN_EMAIL ?? '')
		.run();
	const { results } = await db
		.prepare(
			`SELECT d.notification_id, d.endpoint, d.attempts,
		s.email, s.p256dh, s.auth, n.title, n.body, n.url
		FROM push_deliveries d JOIN notifications n ON n.id = d.notification_id
		JOIN push_subscriptions s ON s.endpoint = d.endpoint AND s.email = n.email
		JOIN users u ON u.email = n.email
		WHERE d.delivered_at IS NULL AND d.next_attempt_at <= ? AND d.attempts < 8
		AND n.created_at >= ? AND n.read_at IS NULL AND u.deleted_at IS NULL AND u.left_at IS NULL
		AND (n.kind != 'review' OR u.role = 'admin' OR u.email = ?)
		ORDER BY d.next_attempt_at, n.id LIMIT 100`
		)
		.bind(now, now - 86400, env.ADMIN_EMAIL ?? '')
		.all<Delivery>();
	for (const row of results) {
		// Atomically lease each delivery across concurrent cron invocations. A
		// crashed invocation becomes retryable after five minutes.
		const claim = await db
			.prepare(
				`UPDATE push_deliveries SET next_attempt_at = ?, attempts = attempts + 1
			WHERE notification_id = ? AND endpoint = ? AND delivered_at IS NULL AND next_attempt_at <= ?`
			)
			.bind(now + 300, row.notification_id, row.endpoint, now)
			.run();
		if (!claim.meta.changes) continue;
		try {
			if (!isPushEndpoint(row.endpoint)) {
				await db
					.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
					.bind(row.endpoint)
					.run();
				continue;
			}
			const payload = await buildPushPayload(
				{
					data: JSON.stringify({
						title: row.title,
						body: row.body,
						tag: `notification-${row.notification_id}`,
						data: { url: row.url }
					}),
					options: { ttl: 3600 }
				},
				{
					endpoint: row.endpoint,
					expirationTime: null,
					keys: { p256dh: row.p256dh, auth: row.auth }
				},
				{
					publicKey: env.VAPID_PUBLIC_KEY,
					privateKey: env.VAPID_PRIVATE_KEY,
					subject: env.VAPID_SUBJECT
				}
			);
			const response = await send(row.endpoint, {
				...payload,
				redirect: 'error',
				signal: AbortSignal.timeout(10000)
			});
			if (response.body) await response.body.cancel();
			if (response.status === 404 || response.status === 410) {
				await db
					.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?')
					.bind(row.endpoint)
					.run();
			} else if (response.ok) {
				await db
					.prepare(
						'UPDATE push_deliveries SET delivered_at = ? WHERE notification_id = ? AND endpoint = ?'
					)
					.bind(now, row.notification_id, row.endpoint)
					.run();
			} else {
				throw new Error(`Push service returned ${response.status}`);
			}
		} catch (err) {
			// Do not log subscription endpoints, key material, or notification bodies.
			console.error(
				`Push delivery ${row.notification_id} failed:`,
				err instanceof Error ? err.message : 'Unknown error'
			);
			await db
				.prepare(
					'UPDATE push_deliveries SET next_attempt_at = ? WHERE notification_id = ? AND endpoint = ?'
				)
				.bind(now + Math.min(3600, 300 * 2 ** row.attempts), row.notification_id, row.endpoint)
				.run();
		}
	}
}

export default {
	async scheduled(controller: ScheduledController, env: NotificationEnv) {
		const db = env.AccountingDatabase;
		await syncReviewNotifications(db, env.ADMIN_EMAIL);
		if (controller.cron === '0 2 * * *') await createDailyReminders(db, controller.scheduledTime);
		await deliverPush(env);
		// Retain inbox history for 90 days; cascades also remove delivery records.
		await db
			.prepare('DELETE FROM notifications WHERE created_at < ?')
			.bind(Math.floor(Date.now() / 1000) - 90 * 86400)
			.run();
	},
	fetch() {
		return new Response('Notification Worker', { status: 404 });
	}
} satisfies ExportedHandler<NotificationEnv>;
