/* eslint-disable @typescript-eslint/ban-ts-comment -- Minimal Cloudflare runtime doubles. */
// @ts-nocheck
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { randomBytes } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

globalThis.__queueTestEnv = { SLIP_OK_API_KEY: 'test', SLIP_OK_API_ENDPOINT: 'https://slip.test' };
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$env/dynamic/private')
			return {
				url: 'data:text/javascript,export const env = globalThis.__queueTestEnv;',
				shortCircuit: true
			};
		if (specifier === '$app/paths')
			return { url: 'data:text/javascript,export const resolve = x => x;', shortCircuit: true };
		if (specifier === '$env/dynamic/public')
			return { url: 'data:text/javascript,export const env = {};', shortCircuit: true };
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
const { processNotification } = await import('../src/lib/server/notificationProcessor.ts');
const { scheduled, queue } = await import('../src/platform.cloudflare.ts');
const api = await import('../src/routes/api/notifications/+server.ts');
const share = await import('../src/routes/api/share_target/+server.ts');
const { submitPayment } = await import('../src/lib/server/paymentSubmission.ts');
const { isPushEndpoint } = await import('../src/lib/server/pushSubscription.ts');
const { processTransactions } = await import('../src/lib/server/transactionProcessing.ts');
const { newWeeklyObligations } = await import('../src/lib/server/weeklyObligations.ts');
const { actions: obligationActions } =
	await import('../src/routes/admin/obligations/+page.server.ts');

function database(before = '9999') {
	let batchTail = Promise.resolve();
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('PRAGMA foreign_keys = ON');
	for (const file of readdirSync(new URL('../migrations/', import.meta.url))
		.filter((f) => f.endsWith('.sql') && f < before)
		.sort())
		sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
	const db = {
		sqlite,
		prepare(sql) {
			let args = [];
			return {
				bind(...values) {
					args = values;
					return this;
				},
				execute() {
					const statement = sqlite.prepare(sql);
					if (statement.columns().length) {
						const results = statement.all(...args);
						const meta = sqlite
							.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id')
							.get();
						return { results, meta };
					}
					const r = statement.run(...args);
					return {
						results: [],
						meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) }
					};
				},
				async run() {
					return this.execute();
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
			const previous = batchTail;
			let release;
			batchTail = new Promise((resolve) => {
				release = resolve;
			});
			await previous;
			sqlite.exec('BEGIN');
			try {
				const results = [];
				for (const stmt of statements) results.push(stmt.execute());
				sqlite.exec('COMMIT');
				return results;
			} catch (err) {
				sqlite.exec('ROLLBACK');
				throw err;
			} finally {
				release();
			}
		}
	};
	return db;
}
function user(db, email = 'student@test', role = 'user', deleted = null, left = null) {
	db.sqlite
		.prepare(
			'INSERT INTO users(email, name, nickname, role, deleted_at, left_at) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(email, email, '', role, deleted, left);
	return email;
}
function subscription(db, email, suffix) {
	const endpoint = 'https://fcm.googleapis.com/fcm/send/' + suffix;
	db.sqlite
		.prepare('INSERT INTO notifications(endpoint, email, p256dh, auth) VALUES (?, ?, ?, ?)')
		.run(endpoint, email, 'key', 'auth');
	return endpoint;
}
function environment(db) {
	const objects = new Map();
	const queued = [];
	return {
		AccountingDatabase: db,
		NotificationQueue: {
			async send(message) {
				queued.push(message);
			}
		},
		VAPID_PUBLIC_KEY: 'public',
		VAPID_PRIVATE_KEY: 'private',
		RESEND_API_KEY: 'resend',
		SLIP_OK_API_KEY: 'test',
		SLIP_OK_API_ENDPOINT: 'https://slip.test',
		AccountingReceipts: {
			async put(key, value) {
				objects.set(key, value);
			},
			async delete(key) {
				objects.delete(key);
			}
		},
		objects,
		queued
	};
}
function notification(destination = 'all', output = 'push') {
	return {
		type: 'notification',
		data: { title: 'Test', body: 'Hello', destination, output, url: '/admin/transactions' }
	};
}
function event(env, email, body, method = 'POST') {
	return {
		locals: { user: email ? { email } : null },
		platform: { env },
		url: new URL('https://app.test/api/notifications'),
		request: new Request('https://app.test/api/notifications', {
			method,
			headers: { 'content-type': 'application/json' },
			body: method === 'GET' ? undefined : JSON.stringify(body)
		})
	};
}
const rows = (db, sql, ...args) => db.sqlite.prepare(sql).all(...args);
const slip = (ref = 'ref-1', amount = 42.75) => ({
	success: true,
	data: {
		success: true,
		amount,
		transRef: ref,
		sendingBank: '004',
		receiver: { proxy: { type: 'MSISDN', value: '0812345678' } }
	}
});

test('the schema stores only subscriptions and the existing slip cache, with no notification history', () => {
	const db = database();
	assert.deepEqual(
		rows(
			db,
			"SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%notification%' OR name LIKE '%slip%')"
		)
			.map((r) => r.name)
			.sort(),
		['notifications', 'slipok_cache']
	);
	db.sqlite.close();
});

test('push retries use stable tags, remove expired endpoints, and require no delivery state', async () => {
	const db = database();
	const student = user(db);
	for (const id of ['good', 'retry', 'gone']) subscription(db, student, id);
	const calls = [];
	const deps = {
		async sendPush(sub, payload, options) {
			calls.push(sub.endpoint);
			assert.equal(JSON.parse(payload).data.url, '/admin/transactions');
			assert.equal(JSON.parse(payload).tag, 'one');
			assert.equal(options.TTL, 86400);
			if (sub.endpoint.endsWith('gone')) throw { statusCode: 410 };
			if (sub.endpoint.endsWith('retry') && calls.filter((x) => x.endsWith('retry')).length === 1)
				throw { statusCode: 503 };
		},
		resend() {
			throw new Error('Unexpected email');
		}
	};
	await assert.rejects(() => processNotification(notification(), 'one', environment(db), deps));
	await processNotification(notification(), 'one', environment(db), deps);
	assert.equal(calls.filter((x) => x.endsWith('good')).length, 2);
	assert.equal(calls.filter((x) => x.endsWith('retry')).length, 2);
	assert.equal(rows(db, 'SELECT * FROM notifications').length, 2);
	db.sqlite.close();
});

test('email reaches active recipients without subscriptions and keeps a stable provider idempotency key', async () => {
	const db = database();
	user(db);
	user(db, 'admin@test', 'admin');
	user(db, 'bootstrap@test');
	user(db, 'deleted@test', 'user', 1);
	user(db, 'left@test', 'user', null, 1);
	const sent = [];
	const deps = {
		async sendPush() {},
		resend: () => ({
			emails: {
				async send(mail, options) {
					assert.ok(options.idempotencyKey.startsWith('notification-'));
					sent.push({ ...mail, options });
					return {};
				}
			}
		})
	};
	const env = { ...environment(db), ADMIN_EMAIL: 'bootstrap@test' };
	await processNotification(notification('admins', 'email'), 'admins', env, deps);
	assert.deepEqual(sent.map((x) => x.to).sort(), ['admin@test', 'bootstrap@test']);
	await processNotification(
		notification(['student@test', 'left@test'], 'email'),
		'specific',
		env,
		deps
	);
	await processNotification(
		notification(['student@test', 'left@test'], 'email'),
		'specific',
		env,
		deps
	);
	assert.equal(sent.length, 4);
	assert.deepEqual(sent[2].options, sent[3].options);
	assert.equal(sent[2].text, 'Hello');
	await assert.rejects(() =>
		processNotification(notification([{ email: 'student@test' }]), 'bad', env, deps)
	);
	db.sqlite.close();
});

test('subscription API validates providers and keys, transfers ownership and only removes one owned device', async () => {
	const db = database();
	const a = user(db);
	const b = user(db, 'other@test');
	const env = environment(db);
	const endpoint = subscription(db, a, 'shared');
	const otherDevice = subscription(db, a, 'other');
	const key = Buffer.concat([Buffer.from([4]), randomBytes(64)]).toString('base64url');
	const body = { endpoint, keys: { p256dh: key, auth: randomBytes(16).toString('base64url') } };
	await api.DELETE(event(env, b, { endpoint }));
	assert.equal(rows(db, 'SELECT * FROM notifications WHERE endpoint = ?', endpoint)[0].email, a);
	await api.POST(event(env, b, body));
	const statusEvent = event(env, b, null, 'GET');
	statusEvent.url.searchParams.set('endpoint', endpoint);
	assert.equal((await (await api.GET(statusEvent)).json()).subscribed, true);
	await api.DELETE(event(env, b, { endpoint }));
	assert.equal(rows(db, 'SELECT * FROM notifications')[0].endpoint, otherDevice);
	await assert.rejects(
		() => api.POST(event(env, a, { ...body, endpoint: 'https://localhost/internal' })),
		{ status: 400 }
	);
	await assert.rejects(() => api.POST(event(env, null, body)), { status: 401 });
	await assert.rejects(
		() => api.POST(event(env, a, { ...body, keys: { p256dh: 'bad', auth: 'bad' } })),
		{ status: 400 }
	);
	for (const url of [
		'http://fcm.googleapis.com/test',
		'https://fcm.googleapis.com.evil.test',
		'https://fcm.googleapis.com:8443',
		'https://user@fcm.googleapis.com'
	])
		assert.equal(isPushEndpoint(url), false);
	db.sqlite.close();
});

test('payment submission and processing enqueue directly, only for rows actually changed', async () => {
	const db = database();
	user(db);
	user(db, 'admin@test', 'admin');
	const env = environment(db);
	await submitPayment(env, 'student@test', 30, 'Payment', new Uint8Array([1]));
	assert.equal(env.queued[0].event.type, 'review');
	assert.equal(env.queued[0].data.destination, 'admins');
	assert.match(env.queued[0].data.url, /highlightTransactionId=1/);
	assert.equal(await processTransactions(db, [1], 'approved', '', 'admin@test', env), 1);
	assert.equal(env.queued[1].data.destination[0], 'student@test');
	assert.equal(await processTransactions(db, [1], 'approved', '', 'admin@test', env), 0);
	assert.equal(env.queued.length, 2);
	assert.equal(await processTransactions(db, [1], 'voided', 'Wrong payment', 'admin@test', env), 1);
	assert.match(env.queued[2].data.body, /Wrong payment/);
	db.sqlite.close();
});

test('manual and weekly obligations enqueue directly after successful creation', async () => {
	const db = database();
	user(db, 'admin@test', 'admin');
	const env = environment(db);
	const form = new FormData();
	for (const [key, value] of Object.entries({
		start_date: '2026-10-18',
		end_date: '2026-10-24',
		amount: '30',
		description: 'Weekly'
	}))
		form.set(key, value);
	await assert.rejects(
		() =>
			obligationActions.create({
				locals: { user: { email: 'admin@test', admin: true } },
				platform: { env },
				request: new Request('https://app.test/admin/obligations', { method: 'POST', body: form })
			}),
		{ status: 303 }
	);
	assert.equal(env.queued.length, 1);
	assert.equal(env.queued[0].data.destination, 'students');
	const now = new Date('2026-10-20T02:00:00Z');
	assert.equal(await newWeeklyObligations(db, now, env.NotificationQueue), true);
	assert.equal(await newWeeklyObligations(db, now, env.NotificationQueue), false);
	assert.equal(env.queued.length, 2);
	db.sqlite.close();
});

test('an enqueue outage does not turn a saved payment into a failed submission', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	env.NotificationQueue.send = async () => {
		throw new Error('Queue unavailable');
	};
	const oldError = console.error;
	const errors = [];
	console.error = (...args) => errors.push(args);
	try {
		assert.equal(
			(await submitPayment(env, 'student@test', 30, 'Payment', new Uint8Array([1]))).ok,
			true
		);
		assert.equal(rows(db, 'SELECT * FROM transactions').length, 1);
		assert.equal(errors.length, 1);
	} finally {
		console.error = oldError;
		db.sqlite.close();
	}
});

test('the main Worker handles Sunday and hourly creation using the scheduled time, with duplicate and pause guards', async () => {
	const db = database();
	const env = environment(db);
	const sunday = Date.parse('2026-10-18T00:00:00Z');
	await scheduled({ cron: '0 0 * * SUN', scheduledTime: sunday }, env);
	await scheduled({ cron: '0 * * * *', scheduledTime: sunday + 3600000 }, env);
	let obligations = rows(db, 'SELECT * FROM obligations');
	assert.equal(obligations.length, 1);
	assert.equal(obligations[0].start_date, Date.parse('2026-10-25T00:00:00Z') / 1000);
	assert.equal(obligations[0].end_date, Date.parse('2026-10-31T00:00:00Z') / 1000);
	assert.equal(obligations[0].amount, 30);
	assert.equal(env.queued.length, 1);
	db.sqlite.exec('UPDATE obligations SET deleted_at = 1');
	await scheduled({ cron: '0 * * * *', scheduledTime: sunday + 7200000 }, env);
	assert.equal(env.queued.length, 1);
	const paused = Date.parse('2026-11-01T00:00:00Z') / 1000;
	db.sqlite
		.prepare(
			'INSERT INTO obligation_creation_pauses(start_date,end_date,created_at) VALUES (?, ?, 1)'
		)
		.run(paused, paused);
	await scheduled({ cron: '0 0 * * SUN', scheduledTime: sunday + 7 * 86400000 }, env);
	obligations = rows(db, 'SELECT * FROM obligations');
	assert.equal(obligations.length, 1);
	assert.equal(env.queued.length, 1);
	db.sqlite.close();
});

test('Bangkok daily reminders enqueue directly, ignore future/deleted charges and subtract pending payments', async () => {
	const db = database();
	user(db);
	user(db, 'paid@test');
	user(db, 'left@test', 'user', null, 1);
	const start = Date.parse('2026-10-01T00:00:00Z') / 1000;
	db.sqlite
		.prepare('INSERT INTO obligations(start_date,end_date,amount,description) VALUES (?,?,30,?)')
		.run(start, start + 86400, 'Current');
	db.sqlite
		.prepare('INSERT INTO obligations(start_date,end_date,amount,description) VALUES (?,?,100,?)')
		.run(start * 1000 + 40 * 86400000, start * 1000 + 41 * 86400000, 'Future');
	db.sqlite.exec(
		"INSERT INTO transactions(email,amount,description,date,type) VALUES ('paid@test',30,'Pay',1,'payment')"
	);
	const sent = [];
	const env = {
		...environment(db),
		NotificationQueue: {
			async send(body) {
				sent.push(body);
			}
		}
	};
	const controller = { cron: '0 2 * * *', scheduledTime: Date.parse('2026-10-19T02:00:00Z') };
	await scheduled(controller, env);
	assert.equal(sent.length, 1);
	assert.equal(sent[0].id, 'reminder:2026-10-19:student@test');
	assert.equal(sent[0].event.type, 'reminder');
	assert.match(sent[0].data.body, /30.00/);
	await scheduled({ ...controller, cron: '* * * * *' }, env);
	assert.equal(sent.length, 1);
	db.sqlite.close();
});

test('shared slip submission uses verified amount and caches once; duplicates, mismatches and failures save nothing', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	db.sqlite.exec("INSERT INTO transfer_promptpay VALUES ('MSISDN', '0812345678')");
	let verified = slip();
	let providerCalls = 0;
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (_url, init) => {
		providerCalls++;
		assert.equal(init.body.get('amount'), null);
		return Response.json(verified);
	};
	const runShare = async (
		email = 'student@test',
		file = new File(['image'], 'slip.png', { type: 'image/png' })
	) => {
		const form = new FormData();
		if (file) form.set('file', file);
		const evt = {
			locals: { user: email ? { email } : null },
			platform: { env },
			request: new Request('https://app.test/api/share_target', { method: 'POST', body: form })
		};
		try {
			await share.POST(evt);
			assert.fail('Expected redirect');
		} catch (err) {
			return err;
		}
	};
	try {
		assert.equal((await runShare()).location, '/?share=submitted');
		const transactions = rows(db, 'SELECT * FROM transactions');
		assert.equal(transactions[0].amount, 42.75);
		assert.equal(transactions[0].approved, 'pending');
		assert.equal(rows(db, 'SELECT * FROM slipok_cache')[0].transaction_id, transactions[0].id);
		assert.equal(env.objects.size, 1);
		assert.equal(providerCalls, 1);
		assert.equal((await runShare()).location, '/?share=duplicate');
		verified = slip('wrong');
		verified.data.receiver.proxy.value = '0899999999';
		assert.equal((await runShare()).location, '/?share=wrong-recipient');
		assert.equal((await runShare('student@test', null)).location, '/?share=missing-file');
		assert.equal((await runShare(null)).status, 401);
		globalThis.fetch = async () => {
			throw new Error('Offline');
		};
		assert.equal((await runShare()).location, '/?share=verification-unavailable');
		assert.equal(rows(db, 'SELECT * FROM transactions').length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		db.sqlite.close();
	}
});

test('shared payments auto-approve only when the existing setting and recipient checks permit it', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	db.sqlite.exec(
		"INSERT INTO transfer_promptpay VALUES ('MSISDN','0812345678'); INSERT INTO app_settings(key,value) VALUES ('preapprove_with_slips_passed_checks','1') ON CONFLICT(key) DO UPDATE SET value='1'"
	);
	const result = await submitPayment(
		env,
		'student@test',
		42.75,
		'Shared',
		new Uint8Array([1]),
		slip()
	);
	assert.equal(result.automaticallyApproved, true);
	assert.equal(rows(db, 'SELECT * FROM transactions')[0].processor, 'Application Approved');
	db.sqlite.close();
});

test('settled reminders and completed review requests are suppressed before delivery', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	subscription(db, 'student@test', 'one');
	db.sqlite.exec(
		"INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,2,30,'Current')"
	);
	await scheduled({ cron: '0 2 * * *', scheduledTime: Date.now() }, env);
	db.sqlite.exec(
		"INSERT INTO transactions(email,amount,description,date,type) VALUES ('student@test',30,'Pay',1,'payment'); UPDATE transactions SET approved='approved'"
	);
	env.queued.push({ ...notification('admins'), event: { type: 'review', transactionId: 1 } });
	const events = env.queued;
	assert.equal(events.length, 2);
	let sent = 0;
	for (const event of events)
		await processNotification(event, event.id ?? 'review:1', env, {
			async sendPush() {
				sent++;
			},
			resend() {
				throw new Error('Unexpected email');
			}
		});
	assert.equal(sent, 0);
	db.sqlite.close();
});

test('a provider error propagates so Cloudflare retries the message without a D1 ledger', async () => {
	const db = database();
	user(db);
	subscription(db, 'student@test', 'one');
	let pushCount = 0;
	let emailCount = 0;
	const deps = {
		async sendPush() {
			pushCount++;
		},
		resend() {
			return {
				emails: {
					async send() {
						return emailCount++ === 0 ? { error: { message: 'Rate limited' } } : {};
					}
				}
			};
		}
	};
	await assert.rejects(() =>
		processNotification(notification('all', 'all'), 'both', environment(db), deps)
	);
	await processNotification(notification('all', 'all'), 'both', environment(db), deps);
	assert.equal(pushCount, 2);
	assert.equal(emailCount, 2);
	db.sqlite.close();
});

test('concurrent shared submissions use the cache atomically and keep only the saved receipt', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	const outcomes = await Promise.allSettled(
		[1, 2].map(() =>
			submitPayment(env, 'student@test', 42.75, 'Shared', new Uint8Array([1]), slip())
		)
	);
	assert.equal(outcomes.filter((x) => x.status === 'fulfilled').length, 1);
	assert.equal(env.objects.size, 1);
	assert.equal(rows(db, 'SELECT * FROM transactions').length, 1);
	assert.equal(rows(db, 'SELECT * FROM slipok_cache').length, 1);
	assert.equal(env.queued.length, 1);
	db.sqlite.close();
});

test('queue retries a failed message and acknowledges the next independent message', async () => {
	const db = database();
	const env = environment(db);
	const actions = [];
	const messages = [null, notification()].map((body, i) => ({
		body,
		id: String(i),
		attempts: 1,
		ack() {
			actions.push('ack:' + i);
		},
		retry() {
			actions.push('retry:' + i);
		}
	}));
	const originalError = console.error;
	console.error = () => {};
	try {
		await queue({ messages }, env);
	} finally {
		console.error = originalError;
	}
	assert.deepEqual(actions, ['retry:0', 'ack:1']);
	db.sqlite.close();
});

test('service worker shows malformed/text pushes safely and constrains notification navigation', async () => {
	const handlers = {};
	const shown = [];
	const opened = [];
	let work;
	const worker = {
		registration: {
			scope: 'https://app.test/',
			async showNotification(title, options) {
				shown.push({ title, ...options });
			}
		},
		location: { origin: 'https://app.test' },
		addEventListener(type, handler) {
			handlers[type] = handler;
		},
		clients: {
			async matchAll() {
				return [];
			},
			async openWindow(url) {
				opened.push(url);
			}
		}
	};
	const source = readFileSync(new URL('../src/service-worker.ts', import.meta.url), 'utf8');
	runInNewContext(
		ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
		{
			...worker,
			URL,
			Response,
			fetch: async (url, options) => {
				assert.equal(url.href, 'https://app.test/api/share_target');
				assert.equal(options.credentials, 'include');
				return { redirected: true, url: 'https://app.test/?share=submitted' };
			}
		}
	);
	handlers.push({
		data: {
			json() {
				return { title: 'Pay', tag: 'one', data: { url: '/admin/transactions' } };
			}
		},
		waitUntil(p) {
			work = p;
		}
	});
	await work;
	assert.equal(shown[0].tag, 'one');
	assert.equal(shown[0].data.url, '/admin/transactions');
	handlers.push({
		data: {
			json() {
				throw new Error();
			},
			text() {
				return 'Plain text';
			}
		},
		waitUntil(p) {
			work = p;
		}
	});
	await work;
	assert.equal(shown[1].body, 'Plain text');
	handlers.notificationclick({
		notification: { data: { url: 'https://evil.test/' }, close() {} },
		waitUntil(p) {
			work = p;
		}
	});
	await work;
	assert.equal(opened[0], 'https://app.test/');
	handlers.fetch({
		request: {
			method: 'POST',
			url: 'https://app.test/api/share_target',
			async formData() {
				return new FormData();
			}
		},
		respondWith(p) {
			work = p;
		}
	});
	const redirected = await work;
	assert.equal(redirected.status, 303);
	assert.equal(redirected.headers.get('location'), 'https://app.test/?share=submitted');
});
