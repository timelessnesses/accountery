import webPush from 'web-push';
import { Resend } from 'resend';
import type { NotificationMessage } from '../types/QueueMessage';
import type { Notification } from '../types/AccountingDatabaseTypes';
import { isPushEndpoint } from './pushSubscription';
import { getInstanceStatus } from './instanceLifecycle';

// Use Workers' native fetch transport rather than Node's HTTPS agent.
async function sendWebPush(...args: Parameters<typeof webPush.generateRequestDetails>) {
	const request = webPush.generateRequestDetails(...args);
	const response = await fetch(request.endpoint, {
		method: request.method,
		headers: request.headers,
		body: request.body ? Uint8Array.from(request.body).buffer : undefined,
		signal: AbortSignal.timeout(15000),
		redirect: 'error'
	});
	if (!response.ok)
		throw Object.assign(new Error(`Push provider returned HTTP ${response.status}`), {
			statusCode: response.status
		});
	return { statusCode: response.status, body: '', headers: {} };
}

export type NotificationEnv = Pick<Env, 'AccountingDatabase' | 'NotificationQueue'> & {
	VAPID_PUBLIC_KEY?: string;
	VAPID_PRIVATE_KEY?: string;
	RESEND_API_KEY?: string;
	ADMIN_EMAIL?: string;
};

export function recipientFilter(
	destination: NotificationMessage['data']['destination'],
	adminEmail = ''
) {
	const active = 'u.deleted_at IS NULL AND u.left_at IS NULL';
	// Student accounts retain their obligations when granted admin permissions.
	if (destination === 'all' || destination === 'students') return { where: active, params: [] };
	if (destination === 'admins')
		return { where: `${active} AND (u.role = 'admin' OR u.email = ?)`, params: [adminEmail] };
	if (
		Array.isArray(destination) &&
		destination.length <= 100 &&
		destination.every((email) => typeof email === 'string')
	) {
		return {
			where: `${active} AND u.email IN (${destination.map(() => '?').join(',') || 'NULL'})`,
			params: destination
		};
	}
	throw new Error('Invalid notification destination');
}

export async function processNotification(
	notification: NotificationMessage,
	id: string,
	env: NotificationEnv,
	dependencies = {
		sendPush: sendWebPush,
		resend: () => new Resend(env.RESEND_API_KEY)
	}
) {
	if (
		notification?.type !== 'notification' ||
		!notification.data ||
		!['push', 'email', 'all'].includes(notification.data.output) ||
		typeof notification.data.title !== 'string' ||
		typeof notification.data.body !== 'string'
	)
		throw new Error('Invalid notification message');
	const db = env.AccountingDatabase;
	if ((await getInstanceStatus(db)) !== 'active') return;
	const event = notification.event;
	if (event) {
		if (event.type === 'review') {
			const pending = await db
				.prepare(
					`SELECT 1 FROM transactions t JOIN users u ON u.email = t.email
					WHERE t.id = ? AND t.approved = 'pending' AND u.deleted_at IS NULL AND u.left_at IS NULL`
				)
				.bind(event.transactionId)
				.first();
			if (!pending) return;
		}
		if (event.type === 'reminder') {
			const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
			if (event.day !== day) return;
			const email = event.email;
			const balance = await db
				.prepare(
					`SELECT
				(SELECT COALESCE(SUM(amount), 0) FROM obligations WHERE deleted_at IS NULL
				AND (CASE WHEN start_date >= 10000000000 THEN start_date / 1000 ELSE start_date END) <= ?)
				- (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE email = ? AND approved IN ('approved', 'pending')) AS remaining`
				)
				.bind(Date.parse(day + 'T00:00:00Z') / 1000, email)
				.first<{ remaining: number }>();
			if (!balance || balance.remaining <= 0) return;
		}
	}
	const { where, params } = recipientFilter(notification.data.destination, env.ADMIN_EMAIL);
	const failures: unknown[] = [];
	if (notification.data.output !== 'email') {
		if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY)
			failures.push(new Error('VAPID keys are not configured'));
		else {
			const recipients = await db
				.prepare(`SELECT s.* FROM notifications s JOIN users u ON u.email = s.email WHERE ${where}`)
				.bind(...params)
				.all<Notification>();
			const results = await Promise.allSettled(
				recipients.results.map(async (recipient) => {
					if (!isPushEndpoint(recipient.endpoint)) throw new Error('Invalid stored push endpoint');
					try {
						await dependencies.sendPush(
							{
								endpoint: recipient.endpoint,
								keys: { p256dh: recipient.p256dh, auth: recipient.auth }
							},
							JSON.stringify({
								title: notification.data.title,
								body: notification.data.body,
								tag: id,
								data: { url: notification.data.url ?? '/' }
							}),
							{
								vapidDetails: {
									subject: 'mailto:mooping@timelessnesses.me',
									publicKey: env.VAPID_PUBLIC_KEY!,
									privateKey: env.VAPID_PRIVATE_KEY!
								},
								timeout: 15000,
								TTL: 86400
							}
						);
					} catch (err) {
						const status = (err as { statusCode?: number }).statusCode;
						if (status !== 404 && status !== 410) throw err;
						await db
							.prepare('DELETE FROM notifications WHERE endpoint = ? AND p256dh = ? AND auth = ?')
							.bind(recipient.endpoint, recipient.p256dh, recipient.auth)
							.run();
					}
				})
			);
			failures.push(...results.filter((r) => r.status === 'rejected').map((r) => r.reason));
		}
	}
	if (notification.data.output !== 'push') {
		if (!env.RESEND_API_KEY) failures.push(new Error('RESEND_API_KEY is not configured'));
		else {
			const recipients = await db
				.prepare(`SELECT u.email FROM users u WHERE ${where}`)
				.bind(...params)
				.all<{ email: string }>();
			const resend = dependencies.resend();
			for (const recipient of recipients.results) {
				try {
					const { error } = await resend.emails.send(
						{
							from: 'accountery@timelessnesses.me',
							to: recipient.email,
							subject: notification.data.title,
							text: notification.data.body
						},
						{ idempotencyKey: `notification-${id}-${recipient.email}` }
					);
					if (error) throw new Error(error.message);
				} catch (err) {
					failures.push(err);
				}
			}
		}
	}
	if (failures.length) throw new AggregateError(failures, 'Notification delivery failed');
}
