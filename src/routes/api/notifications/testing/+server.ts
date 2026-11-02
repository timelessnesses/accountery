import { requireAdmin } from '$lib/server/admin.js';
import { enqueueNotification } from '$lib/server/notificationQueue.js';

export async function GET({ locals, platform }) {
    requireAdmin(locals.user);
    if (!platform) return new Response('Platform not available', { status: 500 });
    await enqueueNotification(platform?.env, {
        type: 'notification',
        id: `test:${Date.now()}`,
        data: {
            title: 'Test Notification',
            body: 'This is a test notification.',
            destination: ["6910310259@tsu.ac.th"],
            output: 'all'
        }
    });
    return new Response('Notification enqueued.', { status: 200 });
}