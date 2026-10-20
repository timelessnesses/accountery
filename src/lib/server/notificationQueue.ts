import type { NotificationMessage } from '../types/QueueMessage';

/** Payment/obligation writes are already committed; a queue outage must not ask users to resubmit. */
export async function enqueueNotification(
	env: Pick<Env, 'NotificationQueue'>,
	notification: NotificationMessage
) {
	try {
		await env.NotificationQueue.send(notification);
	} catch (err) {
		console.error('Unable to enqueue notification:', err);
	}
}
