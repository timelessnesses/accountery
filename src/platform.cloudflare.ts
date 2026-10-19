import type { NotificationMessage } from "$lib/types/QueueMessage";
import type { Notification } from "$lib/types/AccountingDatabaseTypes";
import { Resend } from "resend";
import { env } from "$env/dynamic/private";
import * as web_push from "web-push";

export async function queue(batch: MessageBatch<NotificationMessage>, env: Env, ctx: ExecutionContext) { 
    for (const message of batch.messages) { 
        if (message.body.type === 'notification') {
            if (message.body.data.output === 'push') {
                await notifyViaPush(message.body, env, ctx);
            }
            else if (message.body.data.output === 'email') {
                await notifyViaEmail(message.body, env, ctx);
            }
            else if (message.body.data.output === 'all') {
                await notifyViaPush(message.body, env, ctx);
                await notifyViaEmail(message.body, env, ctx);
            }
        }
        message.ack();
    }
}

const resend = new Resend(env.RESEND_API_KEY);

async function notifyViaPush(notification: NotificationMessage, env: Env, _: ExecutionContext) {
    web_push.setVapidDetails(
        'mailto:mooping@timelessnesses.me',
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
    );
    const accounting_db = env.AccountingDatabase;
    if (!accounting_db) throw new Error('AccountingDatabase not configured');
    const { where, params } = getReceipientsPush(notification, env);
    const receipients = await accounting_db.prepare(`SELECT * FROM push_subscriptions ${where}`).bind(...params).all<Notification>();
    if (!receipients || !receipients.results) throw new Error('No receipients found');

    const pushMessages = receipients.results.map(async recipient => { 
        await web_push.sendNotification({
            endpoint: recipient.endpoint,
            keys: {
                p256dh: recipient.p256dh,
                auth: recipient.auth
            },
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                title: notification.data.title,
                body: notification.data.body,
                icon: notification.data.icon,
                url: notification.data.url
            })
        });
    }).map(p => p.catch(err => {
        console.error('Error sending push notification:', err);
    }));
    await Promise.all(pushMessages);
}

async function notifyViaEmail(notification: NotificationMessage, env: Env, _: ExecutionContext) { 
    const accounting_db = env.AccountingDatabase;
    if (!accounting_db) throw new Error('AccountingDatabase not configured');
    const { where, params } = getReceipientsPush(notification, env);
    const receipients = await accounting_db.prepare(`SELECT * FROM push_subscriptions ${where}`).bind(...params).all<Notification>();
    if (!receipients || !receipients.results) throw new Error('No receipients found');

    const emailMessages = receipients.results.map(recipient => { 
        return {
            from: "accountery@timelessnesses.me",
            to: recipient.email,
            subject: notification.data.title,
            html: notification.data.body
        }
    });
    await resend.batch.send(emailMessages);
}

function getReceipientsPush(notification: NotificationMessage, _: Env): {
    where: string;
    params: unknown[];
} { 
    if (notification.data.destination === 'all') { 
        return { where: "", params: [] };
    } else if (notification.data.destination === 'students') {
        return { where: "WHERE email IN (SELECT email FROM users WHERE role = 'student')", params: [] };
    } else if (notification.data.destination === 'admins') { 
        return { where: "WHERE email IN (SELECT email FROM users WHERE role = 'admin')", params: [] };
    } else if (Array.isArray(notification.data.destination)) { 
        return { where: "WHERE email IN (?)", params: notification.data.destination };
    }
    throw new Error('Invalid destination');
}