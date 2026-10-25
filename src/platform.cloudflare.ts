import type { NotificationMessage } from './lib/types/QueueMessage';
import {
	processNotification,
	recipientFilter,
	type NotificationEnv
} from './lib/server/notificationProcessor';
import { newWeeklyObligations } from './lib/server/weeklyObligations';
import { runScheduledInstanceDestruction } from './lib/server/instanceLifecycle';

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

export async function scheduled(
	controller: ScheduledController,
	env: NotificationEnv & Pick<Env, 'AccountingReceipts'>
) {
	if (await runScheduledInstanceDestruction(env, controller.scheduledTime / 1000)) return;
	// One hourly trigger checks for missing weekly obligations and runs reminders at 09:00 Bangkok.
	await newWeeklyObligations(
		env.AccountingDatabase,
		new Date(controller.scheduledTime),
		env.NotificationQueue
	);
	// Use the scheduled time so a delayed invocation keeps its intended day and hour.
	const bangkokTime = new Date(controller.scheduledTime + 7 * 3600000);
	if (bangkokTime.getUTCHours() === 9) {
		const day = bangkokTime.toISOString().slice(0, 10);
		const cutoff = Date.parse(day + 'T00:00:00Z') / 1000;
		const { where, params } = recipientFilter('students', env.ADMIN_EMAIL);
		const recipients = await env.AccountingDatabase.prepare(
			`SELECT email, remaining FROM (
			SELECT u.email, ROUND((SELECT COALESCE(SUM(o.amount), 0) FROM obligations o WHERE o.deleted_at IS NULL
				AND (CASE WHEN o.start_date >= 10000000000 THEN o.start_date / 1000 ELSE o.start_date END) <= ?)
				- (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t WHERE t.email = u.email AND t.approved IN ('approved', 'pending')), 2) remaining
			FROM users u WHERE ${where}
			) WHERE remaining > 0`
		)
			.bind(cutoff, ...params)
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
					output: 'all'
				}
			} satisfies NotificationMessage);
		}
	}
}
