import type { NotificationMessage } from './lib/types/QueueMessage';
import { processNotification, type NotificationEnv } from './lib/server/notificationProcessor';
import { newWeeklyObligations } from './lib/server/weeklyObligations';

export async function queue(batch: MessageBatch<NotificationMessage>, env: NotificationEnv) {
	for (const message of batch.messages) {
		try {
			await processNotification(message.body, message.body?.id ?? message.id, env);
			message.ack();
		} catch (err) {
			console.error('Notification delivery failed:', err);
			message.retry({ delaySeconds: Math.min(3600, 60 * 2 ** (message.attempts - 1)) });
		}
	}
}

export async function scheduled(controller: ScheduledController, env: NotificationEnv) {
	// Keep the weekly schedule and hourly catch-up from the former accounting-cron Worker.
	if (controller.cron === '0 0 * * SUN' || controller.cron === '0 * * * *') {
		await newWeeklyObligations(
			env.AccountingDatabase,
			new Date(controller.scheduledTime),
			env.NotificationQueue
		);
		return;
	}
	if (controller.cron === '0 2 * * *') {
		const day = new Date(controller.scheduledTime + 7 * 3600000).toISOString().slice(0, 10);
		const cutoff = Date.parse(day + 'T00:00:00Z') / 1000;
		const recipients = await env.AccountingDatabase.prepare(
			`SELECT email, remaining FROM (
			SELECT u.email, ROUND((SELECT COALESCE(SUM(o.amount), 0) FROM obligations o WHERE o.deleted_at IS NULL
				AND (CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END) <= ?)
				- (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.email = u.email AND t.approved IN ('approved', 'pending')), 2) remaining
			FROM users u WHERE u.deleted_at IS NULL AND u.left_at IS NULL AND u.role != 'admin' AND u.email != ?
			) WHERE remaining > 0`
		)
			.bind(cutoff, env.ADMIN_EMAIL ?? '')
			.all<{ email: string; remaining: number }>();
		for (const recipient of recipients.results) {
			await env.NotificationQueue.send({
				type: 'notification',
				id: `reminder:${day}:${recipient.email}`,
				event: { type: 'reminder', day, email: recipient.email },
				data: {
					title: 'Daily payment reminder',
					body: `You have ฿${recipient.remaining.toFixed(2)} still to submit.`,
					url: '/',
					destination: [recipient.email],
					output: 'push'
				}
			} satisfies NotificationMessage);
		}
	}
}
