/* eslint-disable @typescript-eslint/ban-ts-comment -- Runtime doubles implement only the APIs exercised in these tests. */
// @ts-nocheck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const serverEnv = {
	VAPID_PUBLIC_KEY: 'configured-public-key',
	ADMIN_EMAIL: 'bootstrap@school.test'
};
globalThis.__notificationTestEnv = serverEnv;
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$env/dynamic/private')
			return {
				url: 'data:text/javascript,export const env = globalThis.__notificationTestEnv;',
				shortCircuit: true
			};
		if (specifier.startsWith('$lib/'))
			return next(
				new URL('../src/lib/' + specifier.slice(5) + '.ts', import.meta.url).href,
				context
			);
		try {
			return next(specifier, context);
		} catch (err) {
			if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier))
				return next(specifier + '.ts', context);
			throw err;
		}
	}
});
const { createDailyReminders, bangkokDay } = await import('../notifications/reminders.ts');
const { deliverPush, syncReviewNotifications } = await import('../notifications/index.ts');
const { isPushEndpoint, validPushKey } = await import('../src/lib/server/pushSubscription.ts');
const inbox = await import('../src/routes/api/notifications/+server.ts');
const subscriptions = await import('../src/routes/api/notifications/subscription/+server.ts');

function database() {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of readdirSync(new URL('../migrations/', import.meta.url))
		.filter((f) => f.endsWith('.sql'))
		.sort()) {
		sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
	}
	const db = {
		prepare(sql) {
			let args = [];
			return {
				bind(...values) {
					args = values;
					return this;
				},
				async run() {
					const r = sqlite.prepare(sql).run(...args);
					return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
				},
				async all() {
					return { results: sqlite.prepare(sql).all(...args) };
				},
				async first() {
					return sqlite.prepare(sql).get(...args) ?? null;
				}
			};
		},
		async batch(statements) {
			sqlite.exec('BEGIN');
			try {
				const rows = [];
				for (const stmt of statements) rows.push(await stmt.all());
				sqlite.exec('COMMIT');
				return rows;
			} catch (e) {
				sqlite.exec('ROLLBACK');
				throw e;
			}
		},
		sqlite
	};
	return db;
}

function user(db, email = 'student@school.test', role = 'user', left = null, deleted = null) {
	db.sqlite
		.prepare(
			'INSERT INTO users (email, name, nickname, role, left_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(email, email.split('@')[0], '', role, left, deleted);
	return email;
}
function obligation(
	db,
	start = '2026-10-04',
	amount = 30,
	end = '2026-10-10',
	multiplier = 1,
	deleted = null
) {
	return Number(
		db.sqlite
			.prepare(
				'INSERT INTO obligations (start_date, end_date, amount, description, deleted_at) VALUES (?, ?, ?, ?, ?)'
			)
			.run(
				(Date.parse(start) / 1000) * multiplier,
				(Date.parse(end) / 1000) * multiplier,
				amount,
				'Weekly fee',
				deleted
			).lastInsertRowid
	);
}
function payment(db, email, amount, approved = 'pending') {
	return Number(
		db.sqlite
			.prepare(
				'INSERT INTO transactions (email, amount, description, date, type, approved) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run(email, amount, 'Paid', Math.floor(Date.now() / 1000), 'payment', approved)
			.lastInsertRowid
	);
}
function rows(db, sql = 'SELECT * FROM notifications', ...args) {
	return db.sqlite.prepare(sql).all(...args);
}

test('all migrations apply; new obligations notify active accounts and deletion removes alerts', () => {
	const db = database();
	user(db);
	user(db, 'admin@school.test', 'admin');
	user(db, 'left@school.test', 'user', 1);
	user(db, 'deleted@school.test', 'user', null, 1);
	const id = obligation(db);
	assert.equal(rows(db).length, 2);
	assert.match(rows(db)[0].body, /30\.00.*10 10 2026/);
	obligation(db, '2026-10-04', 30, '2026-10-10', 1, 1);
	assert.equal(rows(db).length, 2);
	db.sqlite.prepare('UPDATE obligations SET deleted_at = 1 WHERE id = ?').run(id);
	assert.equal(rows(db).length, 0);
	db.sqlite.close();
});

test('payment review and result notifications are atomic, deduplicated, and cover bootstrap admin', async () => {
	const db = database();
	const student = user(db);
	user(db, 'admin@school.test', 'admin');
	user(db, 'bootstrap@school.test');
	const id = payment(db, student, 30);
	assert.equal(rows(db, "SELECT * FROM notifications WHERE kind = 'review'").length, 1);
	await syncReviewNotifications(db, 'bootstrap@school.test');
	await syncReviewNotifications(db, 'bootstrap@school.test');
	assert.equal(rows(db, "SELECT * FROM notifications WHERE kind = 'review'").length, 2);
	db.sqlite.prepare("UPDATE transactions SET approved = 'approved' WHERE id = ?").run(id);
	assert.equal(rows(db, "SELECT * FROM notifications WHERE kind = 'review'").length, 0);
	assert.equal(rows(db, "SELECT * FROM notifications WHERE kind = 'payment'").length, 1);
	db.sqlite.prepare("UPDATE transactions SET approved = 'approved' WHERE id = ?").run(id);
	assert.equal(rows(db).length, 1);
	db.sqlite
		.prepare("UPDATE transactions SET approved = 'voided', void_reason = 'Duplicate' WHERE id = ?")
		.run(id);
	assert.match(rows(db).at(-1).body, /voided.*Duplicate/);
	const rejected = payment(db, student, 20);
	db.sqlite
		.prepare(
			"UPDATE transactions SET approved = 'rejected', reject_reason = 'Wrong recipient' WHERE id = ?"
		)
		.run(rejected);
	assert.match(rows(db).at(-1).body, /rejected.*Wrong recipient/);
	db.sqlite.close();
});

test('reminders use Bangkok dates, ignore future/deleted charges, exclude pending coverage, and run once a day', async () => {
	const db = database();
	const unpaid = user(db);
	const paid = user(db, 'paid@school.test');
	const pending = user(db, 'pending@school.test');
	user(db, 'left@school.test', 'user', 1);
	user(db, 'deleted@school.test', 'user', null, 1);
	obligation(db);
	obligation(db, '2026-10-11', 300, '2026-10-17');
	obligation(db, '2026-09-27', 30, '2026-10-03', 1000); // historical millisecond dates
	obligation(db, '2026-10-04', 900, '2026-10-10', 1, 1);
	payment(db, paid, 60, 'approved');
	payment(db, pending, 60);
	payment(db, unpaid, 10, 'approved');
	payment(db, unpaid, 20);
	const now = Date.parse('2026-10-10T02:00:00Z');
	await createDailyReminders(db, now);
	await createDailyReminders(db, now);
	const reminders = rows(db, "SELECT * FROM notifications WHERE kind = 'reminder'");
	assert.equal(reminders.length, 1);
	assert.equal(reminders[0].email, unpaid);
	assert.match(reminders[0].body, /฿30\.00/);
	assert.equal(bangkokDay(Date.parse('2026-10-09T17:00:00Z')), '2026-10-10');
	await createDailyReminders(db, now + 86400000);
	// The next week becomes current on Sunday, so all three active users now owe more.
	assert.equal(rows(db, "SELECT * FROM notifications WHERE kind = 'reminder'").length, 4);
	db.sqlite.close();
});

function keyPair() {
	const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
	const pub = publicKey.export({ format: 'jwk' });
	return {
		publicKey: Buffer.concat([
			Buffer.from([4]),
			Buffer.from(pub.x, 'base64url'),
			Buffer.from(pub.y, 'base64url')
		]).toString('base64url'),
		privateKey: privateKey.export({ format: 'jwk' }).d
	};
}
function subscription(db, email, suffix) {
	const endpoint = 'https://fcm.googleapis.com/fcm/send/' + suffix;
	db.sqlite
		.prepare(
			'INSERT INTO push_subscriptions (endpoint, email, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)'
		)
		.run(
			endpoint,
			email,
			keyPair().publicKey,
			randomBytes(16).toString('base64url'),
			Math.floor(Date.now() / 1000) - 100
		);
	return endpoint;
}
function environment(db) {
	const keys = keyPair();
	return {
		AccountingDatabase: db,
		VAPID_PUBLIC_KEY: keys.publicKey,
		VAPID_PRIVATE_KEY: keys.privateKey,
		VAPID_SUBJECT: 'mailto:admin@school.test'
	};
}

test('encrypted pushes fan out to devices once; read/departed/late subscriptions are excluded', async () => {
	const db = database();
	const student = user(db);
	const left = user(db, 'left@school.test');
	const read = user(db, 'read@school.test');
	const late = user(db, 'late@school.test');
	subscription(db, student, 'one');
	subscription(db, student, 'two');
	subscription(db, left, 'left');
	subscription(db, read, 'read');
	obligation(db);
	db.sqlite.prepare('UPDATE users SET left_at = 1 WHERE email = ?').run(left);
	db.sqlite.prepare('UPDATE notifications SET read_at = unixepoch() WHERE email = ?').run(read);
	subscription(db, late, 'late');
	db.sqlite
		.prepare('UPDATE push_subscriptions SET created_at = unixepoch() + 10 WHERE email = ?')
		.run(late);
	const env = environment(db);
	let sent = 0;
	const send = async (_url, init) => {
		sent++;
		assert.equal(init.headers['content-encoding'], 'aes128gcm');
		assert.match(init.headers.authorization, /^vapid /);
		assert.ok(init.body.byteLength > 100);
		assert.equal(init.redirect, 'error');
		return new Response(null, { status: 201 });
	};
	const now = Math.floor(Date.now() / 1000);
	await deliverPush(env, now, send);
	await deliverPush(env, now, send);
	assert.equal(sent, 2);
	assert.equal(rows(db, 'SELECT * FROM push_deliveries WHERE delivered_at IS NOT NULL').length, 2);
	db.sqlite.close();
});

test('push failures retry independently; expired devices are removed with their deliveries', async () => {
	const db = database();
	const student = user(db);
	subscription(db, student, 'good');
	subscription(db, student, 'retry');
	subscription(db, student, 'gone');
	obligation(db);
	const now = Math.floor(Date.now() / 1000);
	const env = environment(db);
	let retryCount = 0;
	let goodCount = 0;
	const send = async (url) => {
		if (url.endsWith('gone')) return new Response(null, { status: 410 });
		if (url.endsWith('good')) goodCount++;
		if (url.endsWith('retry') && retryCount++ === 0) return new Response(null, { status: 503 });
		return new Response(null, { status: 201 });
	};
	await deliverPush(env, now, send);
	assert.equal(rows(db, 'SELECT * FROM push_subscriptions').length, 2);
	await deliverPush(env, now + 10, send);
	assert.equal(retryCount, 1);
	await deliverPush(env, now + 301, send);
	assert.equal(retryCount, 2);
	assert.equal(goodCount, 1);
	assert.equal(rows(db, 'SELECT * FROM push_deliveries WHERE delivered_at IS NOT NULL').length, 2);
	db.sqlite.close();
});

test('concurrent dispatchers atomically claim deliveries', async () => {
	const db = database();
	const student = user(db);
	subscription(db, student, 'one');
	obligation(db);
	let sent = 0;
	const env = environment(db);
	const now = Math.floor(Date.now() / 1000);
	const send = async () => {
		sent++;
		return new Response(null, { status: 201 });
	};
	await Promise.all([deliverPush(env, now, send), deliverPush(env, now, send)]);
	assert.equal(sent, 1);
	db.sqlite.close();
});

test('subscription validation rejects arbitrary destinations and malformed encryption keys', () => {
	assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/test'));
	assert.ok(isPushEndpoint('https://web.push.apple.com/test'));
	assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/test'));
	assert.ok(isPushEndpoint('https://wns.notify.windows.com/test'));
	for (const value of [
		'http://fcm.googleapis.com/test',
		'https://localhost/test',
		'https://127.0.0.1/test',
		'https://fcm.googleapis.com.attacker.test/test',
		'https://user@fcm.googleapis.com/test',
		'https://fcm.googleapis.com:8443/test',
		null
	])
		assert.equal(isPushEndpoint(value), false);
	assert.ok(validPushKey(keyPair().publicKey, 65));
	assert.ok(validPushKey(randomBytes(16).toString('base64url'), 16));
	assert.equal(validPushKey('bad!', 16), false);
	assert.equal(validPushKey('YQ', 16), false);
});

function event(db, email, body, admin = false, search = '') {
	return {
		locals: { user: email ? { email, admin } : undefined },
		platform: { env: { AccountingDatabase: db } },
		url: new URL('https://accounting.test/api/notifications' + search),
		request: new Request('https://accounting.test/api/notifications', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body ?? {})
		})
	};
}

test('inbox endpoints enforce ownership, page all history, and scope marking read', async () => {
	const db = database();
	const student = user(db);
	const other = user(db, 'other@school.test');
	for (let i = 0; i < 35; i++) obligation(db);
	const page = await (await inbox.GET(event(db, student))).json();
	assert.equal(page.notifications.length, 30);
	assert.equal(page.unread, 35);
	assert.ok(page.nextCursor);
	assert.equal(page.publicKey, 'configured-public-key');
	const older = await (
		await inbox.GET(event(db, student, null, false, `?before=${page.nextCursor}`))
	).json();
	assert.equal(older.notifications.length, 5);
	assert.equal(older.nextCursor, null);
	await inbox.PATCH(event(db, student, { through: page.notifications[0].id }));
	assert.equal((await (await inbox.GET(event(db, student))).json()).unread, 0);
	assert.equal((await (await inbox.GET(event(db, other))).json()).unread, 35);
	await assert.rejects(() => inbox.GET(event(db)), { status: 401 });
	await assert.rejects(() => inbox.PATCH(event(db, student, { id: '1' })), { status: 400 });
	await assert.rejects(() => inbox.GET(event(db, student, null, false, '?before=-1')), {
		status: 400
	});
	// Old admin alerts remain private after a role change.
	db.sqlite
		.prepare(
			"INSERT INTO notifications(email, event_key, kind, title, body) VALUES (?, 'review:999', 'review', 'Review', 'Private')"
		)
		.run(student);
	assert.equal((await (await inbox.GET(event(db, student))).json()).unread, 0);
	db.sqlite.close();
});

test('subscription endpoints move a shared browser between accounts and reject unauthorized deletion', async () => {
	const db = database();
	const student = user(db);
	const other = user(db, 'other@school.test');
	const endpoint = subscription(db, student, 'shared');
	obligation(db);
	const n = rows(db, 'SELECT * FROM notifications WHERE email = ?', student)[0];
	db.sqlite
		.prepare('INSERT INTO push_deliveries(notification_id, endpoint) VALUES (?, ?)')
		.run(n.id, endpoint);
	const sub = {
		endpoint,
		keys: { p256dh: keyPair().publicKey, auth: randomBytes(16).toString('base64url') }
	};
	await subscriptions.DELETE(event(db, other, { endpoint }));
	assert.equal(rows(db, 'SELECT * FROM push_subscriptions')[0].email, student);
	await subscriptions.POST(event(db, other, sub));
	assert.equal(rows(db, 'SELECT * FROM push_subscriptions')[0].email, other);
	assert.equal(rows(db, 'SELECT * FROM push_deliveries').length, 0);
	await subscriptions.DELETE(event(db, other, { endpoint }));
	assert.equal(rows(db, 'SELECT * FROM push_subscriptions').length, 0);
	await assert.rejects(
		() => subscriptions.POST(event(db, student, { ...sub, endpoint: 'https://localhost/private' })),
		{ status: 400 }
	);
	await assert.rejects(() => subscriptions.POST(event(db, undefined, sub)), { status: 401 });
	db.sqlite.close();
});

test('a submitted payment suppresses a daily reminder that was waiting to be pushed', async () => {
	const db = database();
	const student = user(db);
	subscription(db, student, 'one');
	obligation(db, '2020-01-01', 30, '2020-01-07');
	await createDailyReminders(db);
	db.sqlite.exec("DELETE FROM notifications WHERE kind != 'reminder'");
	payment(db, student, 30, 'pending');
	let sent = 0;
	await deliverPush(environment(db), Math.floor(Date.now() / 1000), async () => {
		sent++;
		return new Response(null, { status: 201 });
	});
	assert.equal(sent, 0);
	assert.ok(rows(db, "SELECT * FROM notifications WHERE kind = 'reminder'")[0].read_at);
	db.sqlite.close();
});

test('service worker displays notifications, refreshes clients, and restricts click navigation to the app', async () => {
	const handlers = {};
	const shown = [];
	const messages = [];
	const opened = [];
	const worker = {
		location: { origin: 'https://accounting.test' },
		addEventListener(name, handler) {
			handlers[name] = handler;
		},
		registration: {
			async showNotification(title, options) {
				shown.push({ title, ...options });
			}
		},
		clients: {
			async matchAll() {
				return [
					{
						url: 'https://other.test',
						postMessage(value) {
							messages.push(value);
						}
					}
				];
			},
			async openWindow(url) {
				opened.push(url);
			}
		}
	};
	const source = readFileSync(new URL('../src/service-worker.ts', import.meta.url), 'utf8');
	runInNewContext(
		ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
		{ ...worker, URL }
	);
	let work;
	handlers.push({
		data: {
			json() {
				return {
					title: 'Payment approved',
					body: '฿30.00',
					tag: 'test',
					data: { url: '/admin/transactions' }
				};
			}
		},
		waitUntil(p) {
			work = p;
		}
	});
	await work;
	assert.equal(shown[0].title, 'Payment approved');
	assert.equal(shown[0].tag, 'test');
	assert.equal(shown[0].data.url, '/admin/transactions');
	assert.equal(messages[0].type, 'notification');
	handlers.notificationclick({
		notification: { data: { url: '//attacker.test' }, close() {} },
		waitUntil(p) {
			work = p;
		}
	});
	await work;
	assert.equal(opened[0], 'https://accounting.test/');
});
