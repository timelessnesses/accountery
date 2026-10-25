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
		if (specifier.endsWith('.md?raw')) {
			const markdown = readFileSync(new URL(specifier.slice(0, -4), context.parentURL), 'utf8');
			return {
				url:
					'data:text/javascript,' +
					encodeURIComponent('export default ' + JSON.stringify(markdown)),
				shortCircuit: true
			};
		}
		if (specifier === '$env/dynamic/private')
			return {
				url: 'data:text/javascript,export const env = globalThis.__queueTestEnv;',
				shortCircuit: true
			};
		if (specifier === '$app/paths')
			return {
				url: "data:text/javascript,export const resolve = x => x; export const base = '';",
				shortCircuit: true
			};
		if (specifier === '$app/environment')
			return { url: 'data:text/javascript,export const building = false;', shortCircuit: true };
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
const { load: dashboardLoad } = await import('../src/routes/admin/+page.server.ts');
const { actions: uploadActions, load: uploadLoad } =
	await import('../src/routes/admin/upload-slip/+page.server.ts');
const { getPublicObligationSummary } = await import('../src/lib/server/publicObligations.ts');
const { load: publicSummaryLoad } = await import('../src/routes/obligations-owed/+page.server.ts');
const { POST: markLeft } = await import('../src/routes/admin/users/[user]/leaving-date/+server.ts');
const { POST: importStudents } =
	await import('../src/routes/admin/users/import-students/+server.ts');
const { requireLoginUser } = await import('../src/lib/server/loginUser.ts');
const { load: adminLayoutLoad } = await import('../src/routes/admin/+layout.server.ts');
const { load: instanceLoad, actions: instanceActions } =
	await import('../src/routes/admin/instance/+page.server.ts');
const { getInstanceLifecycle, destroyInstanceData } =
	await import('../src/lib/server/instanceLifecycle.ts');
const { handle: handleRequest } = await import('../src/hooks.server.ts');
const { load: noticeLoad, actions: noticeActions } =
	await import('../src/routes/privacy-notice/+page.server.ts');
const { load: policyLoad, prerender: policyPrerender } =
	await import('../src/routes/privacy/+page.server.ts');
const { safeNoticeReturnTo, PRIVACY_NOTICE_VERSION } = await import('../src/lib/privacyNotice.ts');
const { verifyJWT } = await import('../src/lib/auth.ts');
const { POST: googleSignIn } = await import('../src/routes/api/auth/google-jwt/+server.ts');
const { OAuth2Client } = await import('google-auth-library');

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
function user(
	db,
	email = 'student@test',
	role = 'user',
	deleted = null,
	left = null,
	noticeVersion = 1
) {
	db.sqlite
		.prepare(
			'INSERT INTO users(email, name, nickname, role, deleted_at, left_at, privacy_policy_read_version) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(email, email, '', role, deleted, left, noticeVersion);
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
				for (const item of Array.isArray(key) ? key : [key]) objects.delete(item);
			},
			async list({ limit = 1000 } = {}) {
				return {
					objects: [...objects.keys()]
						.sort()
						.slice(0, limit)
						.map((key) => ({ key })),
					truncated: objects.size > limit
				};
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

test('public payment statistics aggregate in SQL without returning any student identities', async () => {
	const db = database();
	try {
		user(db, 'unpaid-secret@test');
		user(db, 'settled-secret@test');
		user(db, 'admin-secret@test', 'admin');
		user(db, 'departed-secret@test', 'user', null, 1700600000);
		user(db, 'deleted-secret@test', 'user', 1);
		db.sqlite.exec(`
			UPDATE users SET name = 'Private student name', nickname = 'Private nickname';
			UPDATE app_settings SET value='1' WHERE key='public_obligations_enabled';
			INSERT INTO obligations(start_date,end_date,amount,description) VALUES
				(1700000000,1700000000,10,'First'),
				(1700600000000,1700600000000,20,'Legacy milliseconds'),
				(1701200000,1701200000,0,'No charge'),
				(1701800000,1701800000,40,'Last');
			INSERT INTO obligations(start_date,end_date,amount,description,deleted_at)
				VALUES (1690000000,1690000000,999,'Deleted charge',1);
			INSERT INTO transactions(email,amount,description,date,type,approved) VALUES
				('unpaid-secret@test',5,'Private payment note',1,'payment','approved'),
				('unpaid-secret@test',100,'Pending',1,'payment','pending'),
				('unpaid-secret@test',999,'Rejected',1,'payment','rejected'),
				('unpaid-secret@test',999,'Voided',1,'payment','voided'),
				('settled-secret@test',1000,'Overpayment',1,'payment','approved'),
				('settled-secret@test',200,'Surplus pending',1,'payment','pending'),
				('admin-secret@test',10,'Admin is also billed',1,'payment','approved'),
				('admin-secret@test',5,'Admin pending',1,'payment','pending'),
				('departed-secret@test',2,'Departure',1,'payment','approved'),
				('departed-secret@test',3,'Departure pending',1,'payment','pending'),
				('deleted-secret@test',1000,'Deleted account',1,'payment','approved');
		`);
		const expected = {
			outstandingAmount: 133,
			unfulfilledObligations: 6,
			studentsWithUnpaidObligations: 3,
			pendingAmount: 73,
			remainingAfterPending: 60,
			totalObligations: 13,
			fulfilledObligations: 7
		};
		assert.deepEqual({ ...(await getPublicObligationSummary(db)) }, expected);
		// Check the anonymous route's complete data contract, not only its visible UI.
		const headers = {};
		const response = await publicSummaryLoad({
			platform: { env: environment(db) },
			setHeaders(values) {
				Object.assign(headers, values);
			}
		});
		assert.deepEqual(JSON.parse(JSON.stringify(response)), { summary: expected });
		assert.equal(headers['Cache-Control'], 'no-store');
		assert.ok(Object.values(response.summary).every((value) => typeof value === 'number'));
		assert.doesNotMatch(
			JSON.stringify(response),
			/secret|Private|email|nickname|description|image|transaction/i
		);
	} finally {
		db.sqlite.close();
	}
});

test('public summary handles empty data and decimal payments without rounding debt or sharing surplus', async () => {
	const db = database();
	try {
		db.sqlite.exec("UPDATE app_settings SET value='1' WHERE key='public_obligations_enabled'");
		assert.ok(Object.values(await getPublicObligationSummary(db)).every((value) => value === 0));
		user(db, 'partial@test');
		user(db, 'paid@test');
		db.sqlite.exec(`
			INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,1,0.1,'One'),(2,2,0.2,'Two');
			INSERT INTO transactions(email,amount,description,date,type,approved) VALUES
				('partial@test',0.1,'Partial',1,'payment','approved'),
				('partial@test',0.2,'Pending',1,'payment','pending'),
				('paid@test',0.3,'Complete',1,'payment','approved');
		`);
		assert.deepEqual(
			{ ...(await getPublicObligationSummary(db)) },
			{
				outstandingAmount: 0.2,
				unfulfilledObligations: 1,
				studentsWithUnpaidObligations: 1,
				pendingAmount: 0.2,
				remainingAfterPending: 0,
				totalObligations: 4,
				fulfilledObligations: 3
			}
		);
	} finally {
		db.sqlite.close();
	}
});

test('public statistics remain unavailable when the admin switch is off or turns off during loading', async () => {
	const db = database();
	try {
		const event = { platform: { env: environment(db) }, setHeaders() {} };
		assert.equal(await getPublicObligationSummary(db), null);
		await assert.rejects(
			() => publicSummaryLoad(event),
			(e) => e.status === 404
		);
		db.sqlite.exec("UPDATE app_settings SET value='1' WHERE key='public_obligations_enabled'");
		const prepare = db.prepare;
		db.prepare = (sql) => {
			if (sql.includes('WITH funds AS'))
				db.sqlite.exec("UPDATE app_settings SET value='0' WHERE key='public_obligations_enabled'");
			return prepare(sql);
		};
		await assert.rejects(
			() => publicSummaryLoad(event),
			(e) => e.status === 404
		);
	} finally {
		db.sqlite.close();
	}
});

const ownerIdentity = { email: 'owner@test', admin: true, name: 'Owner', nickname: '' };
function leaveEvent(
	env,
	email = 'student@test',
	actor = ownerIdentity,
	origin = 'https://app.test'
) {
	return {
		platform: { env },
		locals: { user: actor },
		params: { user: email },
		url: new URL(`https://app.test/admin/users/${email}/leaving-date`),
		request: new Request(`https://app.test/admin/users/${email}/leaving-date`, {
			method: 'POST',
			headers: { origin, 'content-type': 'application/json' },
			body: JSON.stringify({ leavingDate: '2026-10-25' })
		})
	};
}
function destroyEvent(env, fields = {}, actor = ownerIdentity) {
	const data = new FormData();
	for (const [key, value] of Object.entries({
		confirmation: 'DESTROY THIS INSTANCE',
		acknowledgement: 'yes',
		closingDate: '2026-10-25',
		retention: '0',
		...fields
	})) {
		if (value !== null) data.set(key, value);
	}
	return {
		platform: { env },
		locals: { user: actor },
		url: new URL('https://app.test/admin/instance'),
		request: new Request('https://app.test/admin/instance?/destroy', {
			method: 'POST',
			headers: { origin: 'https://app.test' },
			body: data
		}),
		cookies: {
			deleted: false,
			delete() {
				this.deleted = true;
			}
		}
	};
}
async function handleFixture(env, actor, path = '/admin', method = 'GET') {
	const url = new URL(path, 'https://app.test');
	return handleRequest({
		event: {
			platform: { env },
			locals: { user: actor },
			url,
			request: new Request(url, { method }),
			cookies: {
				get() {
					return undefined;
				}
			}
		},
		resolve: async () => new Response('Allowed')
	});
}

test('Mark as left anonymizes linked data, deletes only that user’s receipts, and retains financial history', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		user(db, 'student@test', 'admin');
		const env = environment(db);
		db.sqlite
			.exec(`UPDATE users SET name='Secret Student Name', nickname='SecretNickname', session_token='secret-session', session_expiry=9999999999, logged_in_when=1, privacy_policy_read_version=1 WHERE email='student@test';
			INSERT INTO calendar_tokens(token,created_at,by_user) VALUES ('secret-calendar',1,'student@test');
			INSERT INTO notifications(endpoint,email,p256dh,auth) VALUES ('https://fcm.googleapis.com/fcm/send/secret','student@test','secret-key','secret-auth');
			INSERT INTO transactions(email,amount,description,date,type,image,approved,processor) VALUES
			('student@test',20,'Secret Student Name paid',1,'payment','/api/payments/private-one','approved','owner@test'),
			('student@test',10,'SecretNickname note',2,'payment','/api/payments/private-two','pending',''),
			('owner@test',5,'Other payment',3,'payment','/api/payments/unrelated','approved','student@test');
			INSERT INTO logs(email,action,timestamp,targets) VALUES
			('student@test','student@test Secret Student Name signed in',1,'[]'),
			('owner@test','Manual upload for student@test; SecretNickname',1,'[{"type":"user","email":"student@test"},{"type":"transaction","id":1}]');
			INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,1,30,'Before leaving'),(9999999999,9999999999,100,'After leaving');`);
		const provider = slip('keep-dedup-reference', 20);
		provider.data.sender = {
			displayName: 'Secret Student Name',
			account: { value: 'secret-account-number' }
		};
		db.sqlite
			.prepare('INSERT INTO slipok_cache(transaction_id,slipok_response) VALUES (1,?)')
			.run(JSON.stringify(provider));
		for (const key of ['private-one', 'private-two', 'unrelated'])
			env.objects.set(key, new Uint8Array([1]));
		const response = await markLeft(leaveEvent(env));
		assert.equal(response.status, 200);
		const result = await response.json();
		assert.match(result.email, /^left-user-[a-f0-9-]{36}@tsu\.ac\.th$/);
		assert.equal(rows(db, 'SELECT * FROM users WHERE email=?', 'student@test').length, 0);
		const anonymous = rows(db, 'SELECT * FROM users WHERE email=?', result.email)[0];
		assert.equal(anonymous.name, 'Departed user');
		assert.equal(anonymous.nickname, '');
		assert.equal(anonymous.role, 'student');
		assert.equal(anonymous.session_token, null);
		assert.equal(anonymous.session_expiry, null);
		assert.equal(anonymous.logged_in_when, null);
		assert.ok(anonymous.anonymized_at);
		assert.equal(env.objects.size, 1);
		assert.ok(env.objects.has('unrelated'));
		assert.deepEqual(
			rows(
				db,
				'SELECT amount,date,approved,image FROM transactions WHERE email=? ORDER BY id',
				result.email
			).map((r) => ({ ...r })),
			[
				{ amount: 20, date: 1, approved: 'approved', image: null },
				{ amount: 10, date: 2, approved: 'pending', image: null }
			]
		);
		assert.equal(
			rows(db, 'SELECT processor FROM transactions WHERE id=3')[0].processor,
			result.email
		);
		assert.equal(rows(db, 'SELECT * FROM notifications').length, 0);
		assert.equal(rows(db, 'SELECT * FROM calendar_tokens').length, 0);
		const cached = rows(db, 'SELECT * FROM slipok_cache')[0];
		assert.equal(cached.trans_ref, 'keep-dedup-reference');
		assert.equal(cached.sending_bank, '004');
		const allRetained = JSON.stringify(
			['users', 'transactions', 'logs', 'slipok_cache', 'departed_account_blocks'].map((table) =>
				rows(db, `SELECT * FROM ${table}`)
			)
		);
		assert.doesNotMatch(
			allRetained,
			/student@test|Secret Student Name|SecretNickname|secret-account-number|secret-session/
		);
		assert.equal(rows(db, 'PRAGMA foreign_key_check').length, 0);
		await assert.rejects(
			() => requireLoginUser(db, 'student@test'),
			(e) => e.status === 403
		);
		await assert.rejects(
			() => requireLoginUser(db, result.email),
			(e) => e.status === 403
		);
		const imported = await importStudents({
			platform: { env },
			locals: { user: ownerIdentity },
			request: new Request('https://app.test/admin/users/import-students', {
				method: 'POST',
				body: JSON.stringify({
					students: [{ id: 'student@test', name: 'Restored identity', nickname: '' }]
				})
			})
		});
		assert.equal((await imported.json()).importedCount, 0);
		assert.equal(rows(db, 'SELECT * FROM users WHERE email=?', 'student@test').length, 0);
		await assert.rejects(
			() => submitPayment(env, result.email, 10, 'No new slip', new Uint8Array([1])),
			(e) => e.status === 409
		);
		assert.equal(env.objects.size, 1);
	} finally {
		db.sqlite.close();
	}
});

test('departure receipt failures block sign-in immediately and remain retryable without losing receipt references', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		user(db);
		const env = environment(db);
		db.sqlite.exec(
			"INSERT INTO transactions(email,amount,description,date,type,image) VALUES ('student@test',10,'Original note',1,'payment','/api/payments/one')"
		);
		env.objects.set('one', new Uint8Array([1]));
		const remove = env.AccountingReceipts.delete;
		env.AccountingReceipts.delete = async () => {
			throw new Error('R2 unavailable');
		};
		await assert.rejects(
			() => markLeft(leaveEvent(env)),
			(e) => e.status === 503
		);
		assert.ok(rows(db, 'SELECT left_at FROM users WHERE email=?', 'student@test')[0].left_at);
		assert.equal(rows(db, 'SELECT image FROM transactions')[0].image, '/api/payments/one');
		await assert.rejects(
			() => requireLoginUser(db, 'student@test'),
			(e) => e.status === 403
		);
		env.AccountingReceipts.delete = remove;
		const result = await (await markLeft(leaveEvent(env))).json();
		assert.match(result.email, /^left-user-/);
		assert.equal(env.objects.size, 0);
		const second = await (await markLeft(leaveEvent(env, result.email))).json();
		assert.equal(second.email, result.email);
		assert.equal(rows(db, 'SELECT * FROM users').length, 2);
	} finally {
		db.sqlite.close();
	}
});

test('departure requires an administrator and a same-origin request', async () => {
	const db = database();
	try {
		user(db);
		const env = environment(db);
		for (const [actor, status] of [
			[null, 401],
			[{ email: 'student@test', admin: false }, 403]
		])
			await assert.rejects(
				() => markLeft(leaveEvent(env, 'student@test', actor)),
				(e) => e.status === status
			);
		await assert.rejects(
			() => markLeft(leaveEvent(env, 'student@test', ownerIdentity, 'https://other.test')),
			(e) => e.status === 403
		);
		assert.equal(rows(db, 'SELECT left_at FROM users')[0].left_at, null);
	} finally {
		db.sqlite.close();
	}
});

test('only the configured bootstrap administrator sees instance controls or can submit destruction', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		user(db, 'other@test', 'admin');
		const env = { ...environment(db), ADMIN_EMAIL: 'owner@test' };
		assert.equal(
			(await adminLayoutLoad({ locals: { user: ownerIdentity }, platform: { env } }))
				.isBootstrapAdministrator,
			true
		);
		const other = { ...ownerIdentity, email: 'other@test' };
		assert.equal(
			(await adminLayoutLoad({ locals: { user: other }, platform: { env } }))
				.isBootstrapAdministrator,
			false
		);
		for (const [actor, status] of [
			[null, 401],
			[other, 403],
			[{ ...ownerIdentity, admin: false }, 403]
		]) {
			await assert.rejects(
				() => instanceActions.destroy(destroyEvent(env, {}, actor)),
				(e) => e.status === status
			);
			await assert.rejects(
				() => instanceLoad({ locals: { user: actor }, platform: { env }, setHeaders() {} }),
				(e) => e.status === status
			);
		}
		for (const fields of [
			{ confirmation: 'destroy' },
			{ acknowledgement: null },
			{ acknowledgement: 'no' },
			{ closingDate: 'invalid' },
			{ closingDate: '2099-01-01' }
		]) {
			const result = await instanceActions.destroy(destroyEvent(env, fields));
			assert.equal(result.status, 400);
		}
		assert.equal((await getInstanceLifecycle(db)).status, 'active');
		assert.equal(rows(db, 'SELECT * FROM users').length, 2);
	} finally {
		db.sqlite.close();
	}
});

test('settled instance destruction clears every application record and every paginated R2 file, and cannot restart', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		user(db);
		const env = { ...environment(db), ADMIN_EMAIL: 'owner@test' };
		db.sqlite
			.exec(`INSERT INTO transactions(email,amount,description,date,type) VALUES ('student@test',30,'History',1,'payment');
			INSERT INTO logs(email,action,timestamp) VALUES ('owner@test','Audit',1);
			INSERT INTO transfer_promptpay VALUES ('MSISDN','0812345678');
			INSERT INTO calendar_tokens(token,created_at,by_user) VALUES ('token',1,'student@test');
			INSERT INTO departed_account_blocks VALUES ('digest');`);
		subscription(db, 'student@test', 'one');
		for (let i = 0; i < 1107; i++) env.objects.set(`file-${i}`, new Uint8Array([1]));
		const event = destroyEvent(env);
		const result = await instanceActions.destroy(event);
		assert.equal(result.destroyed, true);
		assert.equal(event.cookies.deleted, true);
		assert.equal(env.objects.size, 0);
		for (const table of [
			'users',
			'transactions',
			'logs',
			'obligations',
			'slipok_cache',
			'notifications',
			'calendar_tokens',
			'transfer_promptpay',
			'departed_account_blocks',
			'obligation_creation_pauses'
		])
			assert.equal(rows(db, `SELECT * FROM ${table}`).length, 0, table);
		assert.deepEqual(
			rows(db, 'SELECT * FROM app_settings').map((r) => ({ ...r })),
			[{ key: 'instance_status', value: 'destroyed' }]
		);
		assert.throws(() => user(db, 'cannot-return@test'), /instance is closed/);
		assert.throws(
			() => db.sqlite.exec("UPDATE app_settings SET value='active' WHERE key='instance_status'"),
			/instance is closed/
		);
		assert.throws(
			() => db.sqlite.exec("DELETE FROM app_settings WHERE key='instance_status'"),
			/instance is closed/
		);
		await scheduled({ cron: '0 * * * *', scheduledTime: Date.now() }, env);
		assert.equal(await newWeeklyObligations(db), false);
		assert.equal((await handleFixture(env, null, '/login')).status, 410);
		assert.equal(rows(db, 'SELECT * FROM obligations').length, 0);
		let delivered = false;
		await processNotification(notification('all', 'all'), 'old-message', env, {
			async sendPush() {
				delivered = true;
			},
			resend() {
				delivered = true;
			}
		});
		assert.equal(delivered, false);
	} finally {
		db.sqlite.close();
	}
});

test('unpaid obligations close access for members, retain read-only admin review for 90 Bangkok calendar days, then erase data', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		user(db, 'other@test', 'admin');
		user(db);
		const env = { ...environment(db), ADMIN_EMAIL: 'owner@test' };
		db.sqlite
			.exec(`INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,1,30,'Unpaid week');
			INSERT INTO transactions(email,amount,description,date,type,approved) VALUES
			('owner@test',30,'Settled',1,'payment','approved'),('other@test',30,'Settled',1,'payment','approved'),('student@test',30,'Still pending',1,'payment','pending');`);
		env.objects.set('retained-slip', new Uint8Array([1]));
		assert.equal((await instanceActions.destroy(destroyEvent(env))).status, 409);
		assert.equal((await getInstanceLifecycle(db)).status, 'active');
		const result = await instanceActions.destroy(destroyEvent(env, { retention: '90' }));
		assert.equal(result.scheduled, true);
		const lifecycle = await getInstanceLifecycle(db);
		const closing = Date.parse('2026-10-25T00:00:00+07:00') / 1000;
		assert.equal(lifecycle.closedAt, closing);
		assert.equal(lifecycle.deleteAfter, closing + 90 * 86400);
		assert.equal(lifecycle.status, 'closing');
		assert.equal(env.objects.size, 1);
		assert.equal((await handleFixture(env, null, '/obligations-owed')).status, 503);
		assert.equal(
			(await handleFixture(env, { email: 'student@test', admin: false }, '/')).status,
			503
		);
		assert.equal((await handleFixture(env, ownerIdentity)).status, 200);
		assert.equal((await handleFixture(env, { ...ownerIdentity, email: 'other@test' })).status, 200);
		assert.equal(
			(await handleFixture(env, ownerIdentity, '/admin/obligations', 'POST')).status,
			403
		);
		assert.equal((await handleFixture(env, ownerIdentity, '/admin/instance', 'POST')).status, 403);
		assert.throws(
			() =>
				db.sqlite.exec(
					"INSERT INTO obligations(start_date,end_date,amount,description) VALUES (2,2,30,'No new charges')"
				),
			/closed/
		);
		assert.throws(
			() => db.sqlite.exec("UPDATE app_settings SET value='0' WHERE key='instance_delete_after'"),
			/retention schedule/
		);
		await assert.rejects(
			() => submitPayment(env, 'student@test', 10, 'Blocked', new Uint8Array([1])),
			(e) => e.status === 503
		);
		assert.equal(env.objects.size, 1);
		await scheduled({ cron: '0 * * * *', scheduledTime: lifecycle.deleteAfter * 1000 - 1 }, env);
		assert.equal(env.objects.size, 1);
		assert.equal(rows(db, 'SELECT * FROM users').length, 3);
		assert.equal(rows(db, 'SELECT * FROM obligations').length, 1);
		assert.equal(env.queued.length, 0);
		await scheduled({ cron: '0 * * * *', scheduledTime: lifecycle.deleteAfter * 1000 }, env);
		assert.equal(env.objects.size, 0);
		assert.equal(rows(db, 'SELECT * FROM users').length, 0);
		assert.equal((await getInstanceLifecycle(db)).status, 'destroyed');
	} finally {
		db.sqlite.close();
	}
});

test('failed instance cleanup stays locked and the next hourly cron retries without deleting accounting rows early', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		const env = { ...environment(db), ADMIN_EMAIL: 'owner@test' };
		env.objects.set('one', new Uint8Array([1]));
		const remove = env.AccountingReceipts.delete;
		env.AccountingReceipts.delete = async () => {
			throw new Error('R2 outage');
		};
		await assert.rejects(
			() => instanceActions.destroy(destroyEvent(env)),
			(e) => e.status === 503
		);
		assert.equal((await getInstanceLifecycle(db)).status, 'destroying');
		assert.equal(rows(db, 'SELECT * FROM users').length, 1);
		assert.equal((await handleFixture(env, null, '/login')).status, 200);
		assert.equal((await handleFixture(env, ownerIdentity, '/admin/instance')).status, 200);
		assert.equal((await handleFixture(env, ownerIdentity, '/admin/users')).status, 503);
		env.AccountingReceipts.delete = remove;
		await scheduled({ cron: '0 * * * *', scheduledTime: Date.now() }, env);
		assert.equal((await getInstanceLifecycle(db)).status, 'destroyed');
		assert.equal(env.objects.size, 0);
	} finally {
		db.sqlite.close();
	}
});

test('the destruction write lock rechecks unpaid balances atomically before any R2 deletion', async () => {
	const db = database();
	try {
		user(db, 'owner@test', 'admin');
		const env = environment(db);
		db.sqlite.exec(
			"INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,1,30,'New outstanding charge')"
		);
		env.objects.set('must-keep', new Uint8Array([1]));
		await assert.rejects(
			() => destroyInstanceData(env, true),
			(e) => e.status === 409
		);
		assert.equal((await getInstanceLifecycle(db)).status, 'active');
		assert.equal(env.objects.size, 1);
	} finally {
		db.sqlite.close();
	}
});

function noticeEvent(
	env,
	fields = {},
	actor = { email: 'student@test', admin: false },
	origin = 'https://app.test'
) {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		acknowledgement: 'yes',
		next: '/admin?from=notice',
		...fields
	}))
		if (value !== null) form.set(key, value);
	return {
		locals: { user: actor },
		platform: { env },
		url: new URL('https://app.test/privacy-notice'),
		request: new Request('https://app.test/privacy-notice', {
			method: 'POST',
			headers: { origin },
			body: form
		})
	};
}

test('unread privacy notices gate private pages and writes while public reading, logout and optional push remain available', async () => {
	const db = database();
	try {
		user(db, 'student@test', 'student', null, null, 0);
		const env = environment(db),
			actor = { email: 'student@test', admin: false };
		await assert.rejects(
			() => handleFixture(env, actor, '/admin?fromLog=2'),
			(e) => e.status === 303 && e.location === '/privacy-notice?next=%2Fadmin%3FfromLog%3D2'
		);
		for (const [path, method] of [
			['/api/payments/key', 'GET'],
			['/api/payments', 'POST'],
			['/admin/transactions/1/approval', 'POST']
		]) {
			const response = await handleFixture(env, actor, path, method);
			assert.equal(response.status, 403);
			assert.equal((await response.json()).code, 'privacy_notice_required');
		}
		for (const [path, method] of [
			['/privacy', 'GET'],
			['/privacy-notice', 'GET'],
			['/api/auth/logout', 'POST'],
			['/api/notifications', 'GET'],
			['/api/notifications', 'POST']
		])
			assert.equal((await handleFixture(env, actor, path, method)).status, 200);
		await assert.rejects(
			() => handleFixture(env, null, '/privacy-notice'),
			(e) => e.status === 302 && e.location === '/login'
		);
		const publicDocument = await handleRequest({
			event: {
				url: new URL('https://app.test/privacy'),
				request: new Request('https://app.test/privacy')
			},
			resolve: async () => new Response('Public notice')
		});
		assert.equal(publicDocument.status, 200);
		db.sqlite.exec('UPDATE users SET privacy_policy_read_version=1');
		assert.equal((await handleFixture(env, actor, '/')).status, 200);
	} finally {
		db.sqlite.close();
	}
});

test('notice acknowledgement is account-bound, validates the checkbox and origin, and records version 1 only once', async () => {
	const db = database();
	try {
		user(db, 'student@test', 'student', null, null, 0);
		user(db, 'other@test', 'student', null, null, 0);
		const env = environment(db);
		const missing = await noticeActions.default(noticeEvent(env, { acknowledgement: null }));
		assert.equal(missing.status, 400);
		await assert.rejects(
			() => noticeActions.default(noticeEvent(env, {}, null)),
			(e) => e.status === 401
		);
		await assert.rejects(
			() => noticeActions.default(noticeEvent(env, {}, undefined, 'https://evil.test')),
			(e) => e.status === 403
		);
		assert.equal(rows(db, 'SELECT * FROM logs').length, 0);
		for (let i = 0; i < 2; i++)
			await assert.rejects(
				() =>
					noticeActions.default(
						noticeEvent(env, { version: '999', email: 'other@test', push: 'yes' })
					),
				(e) => e.status === 303 && e.location === '/admin?from=notice'
			);
		assert.equal(
			rows(db, "SELECT privacy_policy_read_version FROM users WHERE email='student@test'")[0]
				.privacy_policy_read_version,
			PRIVACY_NOTICE_VERSION
		);
		assert.equal(
			rows(db, "SELECT privacy_policy_read_version FROM users WHERE email='other@test'")[0]
				.privacy_policy_read_version,
			0
		);
		assert.equal(rows(db, 'SELECT * FROM logs').length, 1);
		assert.equal(
			rows(db, 'SELECT * FROM logs')[0].action,
			'Acknowledged privacy notice version 1.0.0'
		);
		assert.equal(rows(db, 'SELECT * FROM notifications').length, 0);
	} finally {
		db.sqlite.close();
	}
});

test('onboarding continuation stays within the configured app base and cannot redirect to login loops or external sites', () => {
	for (const value of [
		'https://evil.test',
		'//evil.test',
		'/\\evil.test',
		'/login',
		'/privacy-notice?next=/',
		'/admin\nLocation:evil'
	])
		assert.equal(safeNoticeReturnTo(value), '/');
	assert.equal(
		safeNoticeReturnTo('/admin/users/student%40test?fromLog=3'),
		'/admin/users/student%40test?fromLog=3'
	);
	assert.equal(safeNoticeReturnTo('/accounting/admin?x=1', '/accounting'), '/accounting/admin?x=1');
	for (const value of [
		'/outside',
		'/accounting-other/admin',
		'/accounting/%2e%2e/outside',
		'/accounting/privacy-notice'
	])
		assert.equal(safeNoticeReturnTo(value, '/accounting'), '/accounting/');
});

test('the privacy screen requires an active account, redirects already-read versions, and never acknowledges on GET', async () => {
	const db = database();
	try {
		user(db, 'student@test', 'student', null, null, 0);
		const env = environment(db);
		const headers = {};
		const event = {
			locals: { user: { email: 'student@test' } },
			platform: { env },
			url: new URL('https://app.test/privacy-notice?next=%2Fadmin'),
			setHeaders(values) {
				Object.assign(headers, values);
			}
		};
		const result = await noticeLoad(event);
		assert.match(result.html, /<h2>ประกาศความเป็นส่วนตัว \(Privacy Notice\)<\/h2>/);
		assert.match(result.html, /ประเภทข้อมูลส่วนบุคคลที่ประมวลผล/);
		const policy = policyLoad();
		assert.equal(policyPrerender, true);
		assert.match(policy.html, /ผู้รับผิดชอบและขอบเขต/);
		assert.notEqual(policy.html, result.html);
		assert.equal(result.next, '/admin');
		assert.equal(result.user.email, 'student@test');
		assert.equal(result.pushPublicKey, 'public');
		assert.equal(headers['Cache-Control'], 'no-store');
		assert.equal(
			rows(db, 'SELECT privacy_policy_read_version FROM users')[0].privacy_policy_read_version,
			0
		);
		db.sqlite.exec('UPDATE users SET privacy_policy_read_version=1');
		await assert.rejects(
			() => noticeLoad(event),
			(e) => e.status === 303 && e.location === '/admin'
		);
		db.sqlite.exec('UPDATE users SET left_at=1, privacy_policy_read_version=0');
		await assert.rejects(
			() => noticeActions.default(noticeEvent(env)),
			(e) => e.status === 403
		);
	} finally {
		db.sqlite.close();
	}
});

test('Google login selects the unread notice screen and the same session sees acknowledgement immediately from D1', async () => {
	const db = database(),
		originalVerify = OAuth2Client.prototype.verifyIdToken;
	const { env: publicEnv } = await import('$env/dynamic/public');
	const oldClientId = publicEnv.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
		oldSecret = globalThis.__queueTestEnv.GOOGLE_OAUTH_CLIENT_SECRET;
	try {
		publicEnv.PUBLIC_GOOGLE_OAUTH_CLIENT_ID = 'fixture-client';
		globalThis.__queueTestEnv.GOOGLE_OAUTH_CLIENT_SECRET = 'fixture-secret';
		OAuth2Client.prototype.verifyIdToken = async () => ({
			getPayload: () => ({ email: 'student@tsu.ac.th', email_verified: true })
		});
		user(db, 'student@tsu.ac.th', 'student', null, null, 0);
		const secret = randomBytes(32).toString('base64');
		const env = {
			...environment(db),
			SharedSecrets: {
				async get() {
					return secret;
				}
			}
		};
		let token;
		const event = {
			platform: { env },
			cookies: {
				set(name, value) {
					if (name === 'token') token = value;
				}
			},
			request: new Request('https://app.test/api/auth/google-jwt', {
				method: 'POST',
				body: JSON.stringify({ id_token: 'fixture-token' })
			})
		};
		assert.equal(
			(await (await googleSignIn({ ...event, request: event.request.clone() })).json()).redirectTo,
			'/privacy-notice'
		);
		assert.equal((await verifyJWT(token, env)).privacyPolicyReadVersion, 0);
		db.sqlite.exec('UPDATE users SET privacy_policy_read_version=1');
		assert.equal((await verifyJWT(token, env)).privacyPolicyReadVersion, 1);
		assert.equal((await (await googleSignIn(event)).json()).redirectTo, '/');
	} finally {
		OAuth2Client.prototype.verifyIdToken = originalVerify;
		publicEnv.PUBLIC_GOOGLE_OAUTH_CLIENT_ID = oldClientId;
		globalThis.__queueTestEnv.GOOGLE_OAUTH_CLIENT_SECRET = oldSecret;
		db.sqlite.close();
	}
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

test('both channels deliver independently and email does not require a push subscription', async () => {
	const db = database();
	user(db);
	user(db, 'email-only@test');
	subscription(db, 'student@test', 'one');
	let pushes = 0;
	const emails = [];
	const deps = {
		async sendPush() {
			pushes++;
		},
		resend: () => ({
			emails: {
				async send(mail) {
					emails.push(mail.to);
					return {};
				}
			}
		})
	};
	await processNotification(notification('all', 'all'), 'both', environment(db), deps);
	assert.equal(pushes, 1);
	assert.deepEqual(emails.sort(), ['email-only@test', 'student@test']);
	emails.length = 0;
	await assert.rejects(() =>
		processNotification(
			notification('all', 'all'),
			'missing-push-keys',
			{ ...environment(db), VAPID_PRIVATE_KEY: undefined },
			deps
		)
	);
	assert.deepEqual(emails.sort(), ['email-only@test', 'student@test']);
	db.sqlite.close();
});

test('student notices reach students and admins on both channels while excluding inactive accounts', async () => {
	const db = database();
	const active = ['student@test', 'admin@test', 'bootstrap@test'];
	user(db, active[0], 'student');
	user(db, active[1], 'admin');
	user(db, active[2]);
	user(db, 'deleted@test', 'admin', 1);
	user(db, 'left@test', 'admin', null, 1);
	for (const email of [...active, 'deleted@test', 'left@test']) subscription(db, email, email);
	const pushes = [];
	const emails = [];
	await processNotification(
		notification('students', 'all'),
		'students',
		{ ...environment(db), ADMIN_EMAIL: 'bootstrap@test' },
		{
			async sendPush(sub) {
				pushes.push(sub.endpoint.split('/').at(-1));
			},
			resend: () => ({
				emails: {
					async send(mail) {
						emails.push(mail.to);
						return {};
					}
				}
			})
		}
	);
	assert.deepEqual(pushes.sort(), [...active].sort());
	assert.deepEqual(emails.sort(), [...active].sort());
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
	assert.ok(env.queued.every((message) => message.data.output === 'all'));
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
	assert.ok(env.queued.every((message) => message.data.output === 'all'));
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

test('the hourly trigger handles Sunday creation using the scheduled time, with duplicate and pause guards', async () => {
	const db = database();
	const env = environment(db);
	const sunday = Date.parse('2026-10-18T00:00:00Z');
	await scheduled({ cron: '0 * * * *', scheduledTime: sunday }, env);
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
	await scheduled({ cron: '0 * * * *', scheduledTime: sunday + 7 * 86400000 }, env);
	obligations = rows(db, 'SELECT * FROM obligations');
	assert.equal(obligations.length, 1);
	assert.equal(env.queued.length, 1);
	db.sqlite.close();
});

test('the hourly trigger reminds admins who are students only at 09:00 Bangkok, deducting pending payments', async () => {
	const db = database();
	user(db, 'student@test', 'admin');
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
		ADMIN_EMAIL: 'student@test',
		NotificationQueue: {
			async send(body) {
				sent.push(body);
			}
		}
	};
	const controller = { cron: '0 * * * *', scheduledTime: Date.parse('2026-10-19T02:00:00Z') };
	const reminders = () => sent.filter((message) => message.event?.type === 'reminder');
	await scheduled({ ...controller, scheduledTime: controller.scheduledTime - 3600000 }, env);
	assert.equal(reminders().length, 0);
	await scheduled(controller, env);
	assert.equal(reminders().length, 1);
	assert.equal(reminders()[0].id, 'reminder:2026-10-19:student@test');
	assert.match(reminders()[0].data.body, /30.00/);
	assert.equal(reminders()[0].data.output, 'all');
	await scheduled({ ...controller, scheduledTime: controller.scheduledTime + 3600000 }, env);
	await scheduled({ ...controller, scheduledTime: Date.parse('2026-10-19T17:00:00Z') }, env);
	assert.equal(reminders().length, 1);
	await scheduled({ ...controller, scheduledTime: Date.parse('2026-10-20T02:00:00Z') }, env);
	assert.equal(reminders().length, 2);
	assert.equal(reminders()[1].id, 'reminder:2026-10-20:student@test');
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
	assert.equal(env.queued[0].data.output, 'all');
	assert.equal(rows(db, 'SELECT * FROM transactions')[0].processor, 'Application Approved');
	db.sqlite.close();
});

function manualSlipEvent(env, fields = {}, actor = { email: 'admin@test', admin: true }) {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		email: 'student@test',
		amount: '42.75',
		note: 'Manual payment',
		slip: new File([new Uint8Array([137, 80, 78, 71])], 'slip.png', { type: 'image/png' }),
		...fields
	})) {
		if (Array.isArray(value)) value.forEach((item) => form.append(key, item));
		else if (value !== null) form.set(key, value);
	}
	return {
		locals: { user: actor },
		platform: { env },
		url: new URL('https://app.test/admin/upload-slip'),
		request: new Request('https://app.test/admin/upload-slip?/uploadSlip', {
			method: 'POST',
			body: form
		})
	};
}

test('admin slips enter the dashboard queue with a distinct attributed log and never auto-approve', async () => {
	const db = database();
	const originalFetch = globalThis.fetch;
	try {
		user(db);
		user(db, 'admin@test', 'admin');
		user(db, 'deleted@test', 'user', 1);
		const env = environment(db);
		db.sqlite.exec(
			"INSERT INTO transfer_promptpay VALUES ('MSISDN','0812345678'); INSERT INTO app_settings(key,value) VALUES ('preapprove_with_slips_passed_checks','1') ON CONFLICT(key) DO UPDATE SET value='1'"
		);
		let slipCalls = 0;
		globalThis.fetch = async () => {
			slipCalls++;
			return Response.json(slip());
		};
		for (let i = 0; i < 2; i++) {
			const result = await uploadActions.uploadSlip(manualSlipEvent(env));
			assert.equal(result.ok, true);
			assert.equal(result.transactionId, i + 1);
		}
		assert.equal(slipCalls, 0);
		assert.equal(env.objects.size, 2);
		const transactions = rows(db, 'SELECT * FROM transactions');
		assert.ok(
			transactions.every(
				(t) => t.email === 'student@test' && t.approved === 'pending' && !t.processor
			)
		);
		const logs = rows(db, 'SELECT * FROM logs ORDER BY id');
		assert.equal(logs.length, 2);
		for (let i = 0; i < logs.length; i++) {
			assert.equal(logs[i].email, 'admin@test');
			assert.match(logs[i].action, /manually uploaded slip/);
			assert.match(logs[i].action, /on behalf of student@test/);
			assert.deepEqual(JSON.parse(logs[i].targets), [
				{ type: 'transaction', id: i + 1 },
				{ type: 'user', email: 'student@test' }
			]);
		}
		assert.notEqual(logs[0].action, logs[1].action);
		assert.equal(env.queued.length, 2);
		assert.ok(
			env.queued.every((m) => m.event.type === 'review' && m.data.destination === 'admins')
		);
		const dashboard = await dashboardLoad(manualSlipEvent(env));
		assert.equal(dashboard.allPendingTransactions.length, 2);
		const upload = await uploadLoad(manualSlipEvent(env));
		assert.ok(upload.uploadUsers.every((u) => u.email !== 'deleted@test'));
	} finally {
		globalThis.fetch = originalFetch;
		db.sqlite.close();
	}
});

test('manual upload rejects non-admins and invalid users, amounts, notes, and files without saving', async () => {
	const db = database();
	try {
		user(db);
		user(db, 'deleted@test', 'user', 1);
		const env = environment(db);
		for (const [actor, status] of [
			[null, 401],
			[{ email: 'student@test', admin: false }, 403]
		]) {
			await assert.rejects(
				() => uploadActions.uploadSlip(manualSlipEvent(env, {}, actor)),
				(e) => e.status === status
			);
			await assert.rejects(
				() => uploadLoad(manualSlipEvent(env, {}, actor)),
				(e) => e.status === status
			);
		}
		const png = new File(['png'], 'slip.png', { type: 'image/png' });
		for (const fields of [
			{ email: '' },
			{ email: 'missing@test' },
			{ email: 'deleted@test' },
			{ amount: '-1' },
			{ amount: 'NaN' },
			{ amount: '1.001' },
			{ amount: '10000000000' },
			{ note: '   ' },
			{ note: 'x'.repeat(2001) },
			{ slip: null },
			{ slip: new File([], 'empty.png', { type: 'image/png' }) },
			{ slip: new File(['pdf'], 'slip.pdf', { type: 'application/pdf' }) },
			{ slip: [png, png] }
		]) {
			const result = await uploadActions.uploadSlip(manualSlipEvent(env, fields));
			assert.equal(result.status, 400, JSON.stringify(fields));
			assert.equal(result.data.ok, false);
		}
		const tooLarge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.png', {
			type: 'image/png'
		});
		assert.equal(
			(await uploadActions.uploadSlip(manualSlipEvent(env, { slip: tooLarge }))).status,
			413
		);
		assert.equal(rows(db, 'SELECT * FROM transactions').length, 0);
		assert.equal(rows(db, 'SELECT * FROM logs').length, 0);
		assert.equal(env.objects.size, 0);
		assert.equal(env.queued.length, 0);
	} finally {
		db.sqlite.close();
	}
});

test('admin audit failure rolls back the payment and removes the uploaded receipt', async () => {
	const db = database();
	try {
		user(db);
		const env = environment(db);
		db.sqlite.exec(
			"CREATE TRIGGER fail_admin_audit BEFORE INSERT ON logs BEGIN SELECT RAISE(ABORT, 'Audit unavailable'); END"
		);
		await assert.rejects(() => uploadActions.uploadSlip(manualSlipEvent(env)), /Audit unavailable/);
		assert.equal(rows(db, 'SELECT * FROM transactions').length, 0);
		assert.equal(rows(db, 'SELECT * FROM logs').length, 0);
		assert.equal(env.objects.size, 0);
		assert.equal(env.queued.length, 0);
	} finally {
		db.sqlite.close();
	}
});

test('settled reminders and completed review requests are suppressed before delivery', async () => {
	const db = database();
	user(db);
	const env = environment(db);
	subscription(db, 'student@test', 'one');
	db.sqlite.exec(
		"INSERT INTO obligations(start_date,end_date,amount,description) VALUES (1,2,30,'Current')"
	);
	const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
	await scheduled({ cron: '0 * * * *', scheduledTime: Date.parse(day + 'T02:00:00Z') }, env);
	db.sqlite.exec(
		"INSERT INTO transactions(email,amount,description,date,type) VALUES ('student@test',30,'Pay',1,'payment'); UPDATE transactions SET approved='approved'"
	);
	env.queued.push({ ...notification('admins'), event: { type: 'review', transactionId: 1 } });
	const events = env.queued.filter((message) => message.event);
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
