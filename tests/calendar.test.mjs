import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

// Load the app's TypeScript and SvelteKit aliases without a running Cloudflare server.
const root = resolve(import.meta.dirname, '..');
registerHooks({
	resolve(specifier, context, next) {
		if (specifier === '$env/dynamic/private')
			return {
				url: 'data:text/javascript,export const env = { GOOGLE_OAUTH_CLIENT_SECRET: "test-secret" }',
				shortCircuit: true
			};
		if (specifier === '$env/dynamic/public')
			return {
				url: 'data:text/javascript,export const env = { PUBLIC_GOOGLE_OAUTH_CLIENT_ID: "test-client" }',
				shortCircuit: true
			};
		let path;
		if (specifier.startsWith('$lib/')) path = resolve(root, 'src/lib', specifier.slice(5));
		else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))
			path = fileURLToPath(new URL(specifier, context.parentURL));
		if (path) {
			const candidates = [path, `${path}.ts`, path.replace(/\.js$/, '.ts')];
			const found = candidates.find(
				(candidate) => candidate.endsWith('.ts') && existsSync(candidate)
			);
			if (found) return { url: pathToFileURL(found).href, shortCircuit: true };
		}
		return next(specifier, context);
	},
	load(url, context, next) {
		if (url.startsWith('file:') && url.endsWith('.ts') && !url.includes('node_modules')) {
			return {
				format: 'module',
				source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
					compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext }
				}).outputText,
				shortCircuit: true
			};
		}
		return next(url, context);
	}
});
const { parseDateInput, obligationDates } = await import('../src/lib/date.ts');
const { buildAllocatedWeeks } = await import('../src/lib/paymentAlloc.ts');
const { buildObligationCalendar } = await import('../src/lib/server/obligationCalendar.ts');
const { actions } = await import('../src/routes/admin/obligations/+page.server.ts');
const subscription = await import('../src/routes/api/calendar/subscription/+server.ts');
const feed = await import('../src/routes/api/calendar/[token]/+server.ts');
const download = await import('../src/routes/api/calendar.ics/+server.ts');
const { handle } = await import('../src/hooks.server.ts');
const { verifyJWT } = await import('../src/lib/auth.ts');
const { SignJWT } = await import('jose');
const { requireLoginUser } = await import('../src/lib/server/loginUser.ts');
const { getUserBalances, getUserObligations } = await import('../src/lib/server/billing.ts');
const { load: loadObligations } = await import('../src/routes/admin/obligations/+page.server.ts');
const { load: loadUser } = await import('../src/routes/admin/users/[user]/+page.server.ts');
const { POST: setLeavingDate } =
	await import('../src/routes/admin/users/[user]/leaving-date/+server.ts');
const { POST: deleteUser } = await import('../src/routes/admin/users/[user]/delete/+server.ts');
const { POST: importUsers } = await import('../src/routes/admin/users/import-students/+server.ts');
const googleLogin = await import('../src/routes/api/auth/google-jwt/+server.ts');
const { OAuth2Client } = await import('google-auth-library');
const { newWeeklyObligations } = await import('../accounting-cron/src/obligations.ts');
const { default: obligationWorker } = await import('../accounting-cron/src/index.ts');
const user = { email: 'test@example.com', name: 'Test', nickname: 'Test', admin: true };
const origin = 'https://accounting.example.com';
function fixture() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(
		`PRAGMA foreign_keys = ON;
		CREATE TABLE users (email TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT 'Test', nickname TEXT NOT NULL DEFAULT 'Test',
			role TEXT NOT NULL DEFAULT 'user', session_token TEXT, session_expiry INTEGER, logged_in_when INTEGER, deleted_at INTEGER);
		INSERT INTO users (email, role) VALUES ('test@example.com', 'admin');
		CREATE TABLE obligations (id INTEGER PRIMARY KEY, start_date INTEGER NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL);
		INSERT INTO obligations VALUES (1, 1798675200, 30, 'Legacy week');
		CREATE TABLE transactions (id INTEGER PRIMARY KEY, email TEXT REFERENCES users(email), amount INTEGER, date INTEGER, approved TEXT, description TEXT, type TEXT, image TEXT);
		CREATE TABLE logs (id INTEGER PRIMARY KEY, email TEXT REFERENCES users(email), action TEXT, timestamp INTEGER);`
	);
	sql.exec(readFileSync(resolve(root, 'migrations/0013_ics.sql'), 'utf8'));
	sql.exec(readFileSync(resolve(root, 'migrations/0014_guh.sql'), 'utf8'));
	sql.exec(
		readFileSync(resolve(root, 'migrations/0015_departures_and_obligation_deletion.sql'), 'utf8')
	);
	sql.exec(readFileSync(resolve(root, 'migrations/0016_obligation_creation_pauses.sql'), 'utf8'));
	const database = {
		prepare(query) {
			const statement = sql.prepare(query);
			let params = [];
			return {
				bind(...values) {
					params = values;
					return this;
				},
				async first() {
					return statement.get(...params) ?? null;
				},
				async all() {
					return { results: statement.all(...params) };
				},
				async run() {
					const result = statement.run(...params);
					return { success: true, results: [], meta: { changes: Number(result.changes) } };
				}
			};
		},
		async batch(statements) {
			sql.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.run());
				sql.exec('COMMIT');
				return results;
			} catch (error) {
				sql.exec('ROLLBACK');
				throw error;
			}
		}
	};
	return {
		sql,
		database,
		event: {
			platform: { env: { AccountingDatabase: database } },
			locals: { user },
			url: new URL(origin)
		}
	};
}
function request(method, fields) {
	return new Request(`${origin}/admin/obligations`, {
		method,
		headers: { origin },
		body: fields ? new URLSearchParams(fields) : undefined
	});
}
test('calendar dates reject rollover and support leap days and same-day ranges', () => {
	for (const invalid of ['', '2026-02-29', '2026-02-30', '2026-13-01', '2026-1-01', 'invalid'])
		assert.equal(parseDateInput(invalid), null);
	assert.equal(parseDateInput('2028-02-29'), Date.UTC(2028, 1, 29) / 1000);
	const dates = obligationDates({ start_date: Date.UTC(2026, 11, 30) / 1000 });
	assert.equal(dates.end_date.toISOString().slice(0, 10), '2027-01-05');
});
test('migration backfills populated databases and allows legacy weekly inserts', () => {
	const { sql } = fixture();
	assert.equal(
		sql.prepare('SELECT end_date - start_date AS span FROM obligations').get().span,
		6 * 86400
	);
	sql.exec(
		"INSERT INTO obligations (id, start_date, amount, description) VALUES (2, 1800000000, 30, 'Cron week')"
	);
	assert.equal(sql.prepare('SELECT end_date FROM obligations WHERE id=2').get().end_date, null);
	assert.throws(() => sql.exec('UPDATE obligations SET end_date = start_date - 1 WHERE id=1'));
	sql.close();
});
test('allocation preserves custom dates, order, and approved/pending balances', () => {
	const obligations = [
		{
			id: 2,
			start_date: new Date('2026-10-01Z'),
			end_date: new Date('2026-10-01Z'),
			amount: 30,
			description: 'One day'
		},
		{
			id: 1,
			start_date: new Date('2026-09-28Z'),
			end_date: new Date('2026-10-03Z'),
			amount: 30,
			description: 'Range'
		}
	];
	const weeks = buildAllocatedWeeks(obligations, [
		{ amount: 40, approved: 'approved' },
		{ amount: 5, approved: 'pending' }
	]);
	assert.deepEqual(
		weeks.map((w) => [w.id, w.dayStart, w.dayEnd, w.allocated, w.pendingAllocated, w.remaining]),
		[
			['1', '2026-09-28', '2026-10-03', 30, 0, 0],
			['2', '2026-10-01', '2026-10-01', 10, 5, 15]
		]
	);
});
test('admin actions save and update dates and reject invalid ranges without writes', async () => {
	const { event, sql } = fixture();
	const values = {
		start_date: '2026-09-30',
		end_date: '2026-10-03',
		amount: '30',
		description: 'Custom range'
	};
	await assert.rejects(
		actions.create({ ...event, request: request('POST', values) }),
		(e) => e.status === 303
	);
	const row = sql.prepare("SELECT * FROM obligations WHERE description='Custom range'").get();
	assert.equal(row.end_date, Date.UTC(2026, 9, 3) / 1000);
	await assert.rejects(
		actions.update({
			...event,
			request: request('POST', { ...values, id: String(row.id), end_date: values.start_date })
		}),
		(e) => e.status === 303
	);
	assert.equal(
		sql.prepare('SELECT end_date - start_date AS span FROM obligations WHERE id=?').get(row.id)
			.span,
		0
	);
	for (const end_date of ['2026-09-29', '', '2026-02-30']) {
		const result = await actions.create({
			...event,
			request: request('POST', { ...values, end_date })
		});
		assert.equal(result.status, 400);
	}
	assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM obligations').get().count, 2);
	sql.close();
});
test('ICS includes exclusive ends, escaped descriptions, stable IDs and empty calendars', () => {
	const obligation = {
		id: 7,
		start_date: new Date('2026-12-31Z'),
		end_date: new Date('2027-01-02Z'),
		amount: 30,
		description: 'Trip, fees;\nNext line'
	};
	const value = buildObligationCalendar([obligation], origin);
	assert.match(value, /DTSTART;VALUE=DATE:20261231/);
	assert.match(value, /DTEND;VALUE=DATE:20270103/);
	assert.match(value, /SUMMARY:Trip\\, fees\\;\\nNext line/);
	const updated = buildObligationCalendar(
		[{ ...obligation, end_date: obligation.start_date }],
		origin
	);
	assert.match(updated, /DTEND;VALUE=DATE:20270101/);
	assert.equal(value.match(/UID:[^\r]+/)[0], updated.match(/UID:[^\r]+/)[0]);
	assert.match(buildObligationCalendar([], origin), /BEGIN:VCALENDAR/);
});
test('subscription links work without cookies, update live, revoke, and reject deleted accounts', async () => {
	const { event, sql } = fixture();
	assert.equal((await (await subscription.GET(event)).json()).url, null);
	await assert.rejects(
		subscription.POST({
			...event,
			request: new Request(origin, { method: 'POST', headers: { origin: 'https://other.example' } })
		}),
		(e) => e.status === 403
	);
	const response = await subscription.POST({ ...event, request: request('POST') });
	const { url } = await response.json();
	const token = new URL(url).pathname.split('/').pop();
	assert.match(token, /^[a-f0-9]{64}$/);
	assert.equal(
		(await (await subscription.POST({ ...event, request: request('POST') })).json()).url,
		url
	);
	const feedEvent = { ...event, locals: {}, params: { token } };
	assert.equal(
		(await feed.GET(feedEvent)).headers.get('content-type'),
		'text/calendar; charset=utf-8'
	);
	sql.exec("UPDATE obligations SET description='Updated schedule' WHERE id=1");
	assert.match(await (await feed.GET(feedEvent)).text(), /Updated schedule/);
	assert.match((await download.GET(event)).headers.get('content-disposition'), /attachment/);
	await assert.rejects(download.GET({ ...event, locals: {} }), (e) => e.status === 401);
	sql.exec('UPDATE users SET deleted_at=1');
	await assert.rejects(feed.GET(feedEvent), (e) => e.status === 404);
	sql.exec('UPDATE users SET deleted_at=NULL');
	await subscription.DELETE({ ...event, request: request('DELETE') });
	await assert.rejects(feed.GET(feedEvent), (e) => e.status === 404);
	const replacement = await (
		await subscription.POST({ ...event, request: request('POST') })
	).json();
	assert.notEqual(replacement.url, url);
	sql.close();
});
test('only token feed GETs bypass session authentication', async () => {
	const { event, sql } = fixture();
	const token = 'a'.repeat(64);
	async function run(path, method = 'GET') {
		return handle({
			event: {
				...event,
				locals: {},
				cookies: { get: () => undefined },
				url: new URL(path, origin),
				request: new Request(new URL(path, origin), { method })
			},
			resolve: () => new Response('passed')
		});
	}
	assert.equal(await (await run(`/api/calendar/${token}`)).text(), 'passed');
	for (const path of ['/api/calendar.ics', '/api/calendar/subscription', '/api/calendar/invalid'])
		await assert.rejects(run(path), (e) => e.status === 302);
	await assert.rejects(run(`/api/calendar/${token}`, 'POST'), (e) => e.status === 302);
	sql.close();
});

function departureEvent(event, email, leavingDate) {
	return {
		...event,
		params: { user: email },
		request: new Request(`${origin}/admin/users/${email}/leaving-date`, {
			method: 'POST',
			headers: { origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({ leavingDate })
		})
	};
}
function billingFixture() {
	const fixtureData = fixture();
	fixtureData.sql.exec(`DELETE FROM obligations;
		INSERT INTO users (email) VALUES ('left@tsu.ac.th');
		INSERT INTO obligations (id, start_date, end_date, amount, description) VALUES
			(1, unixepoch('2026-09-01'), unixepoch('2026-10-05'), 30, 'Earlier obligation'),
			(2, unixepoch('2026-09-28'), unixepoch('2026-10-04'), 40, 'On leaving day'),
			(3, unixepoch('2026-10-05'), unixepoch('2026-10-11'), 50, 'Later obligation');
		INSERT INTO transactions (email, amount, approved, date) VALUES
			('left@tsu.ac.th', 20, 'approved', unixepoch('2026-09-01')),
			('left@tsu.ac.th', 5, 'pending', unixepoch('2026-09-02')),
			('left@tsu.ac.th', 999, 'rejected', unixepoch('2026-09-02'));`);
	return fixtureData;
}

test('custom leaving dates preserve earlier debt, exclude same-day charges, and recalculate every admin view', async () => {
	const { sql, database, event } = billingFixture();
	await setLeavingDate(departureEvent(event, 'left@tsu.ac.th', '2026-09-28'));
	const balances = (await getUserBalances(database)).results;
	const left = balances.find((row) => row.email === 'left@tsu.ac.th');
	assert.deepEqual([left.paid, left.owed, left.net], [20, 30, -10]);
	assert.equal(balances.find((row) => row.email === user.email).owed, 120);
	assert.deepEqual(
		(await getUserObligations(database, left.email)).map((o) => o.id),
		[1]
	);
	const detail = await loadUser({ ...event, params: { user: left.email } });
	assert.equal(detail.netUser.owed, 30);
	assert.equal(detail.allTransactionsFromUser.length, 3);
	assert.deepEqual(
		detail.allocatedWeeks.map((w) => [w.id, w.allocated, w.pendingAllocated, w.remaining]),
		[['1', 20, 5, 5]]
	);
	const overview = await loadObligations(event);
	assert.deepEqual(
		overview.weeks.map((w) => [w.students.length, w.remaining]),
		[
			[2, 40],
			[1, 40],
			[1, 50]
		]
	);

	await setLeavingDate(departureEvent(event, left.email, '2026-10-06'));
	assert.equal((await getUserBalances(database, left.email)).results[0].owed, 120);
	await setLeavingDate(departureEvent(event, left.email, '2026-09-01'));
	assert.equal((await getUserBalances(database, left.email)).results[0].owed, 0);
	assert.equal((await loadObligations(event)).weeks[0].students.length, 1);
	// Importers can store millisecond timestamps; the cutoff must still match the calendar.
	sql.exec(
		"UPDATE obligations SET start_date = unixepoch('2026-09-01') * 1000, end_date = unixepoch('2026-09-02') * 1000 WHERE id=1"
	);
	await setLeavingDate(departureEvent(event, left.email, '2026-09-28'));
	assert.equal((await getUserBalances(database, left.email)).results[0].owed, 30);
	assert.equal(
		(await getUserObligations(database, left.email))[0].start_date.toISOString().slice(0, 10),
		'2026-09-01'
	);
	sql.close();
});

test('deleting an obligation removes charges and calendar events, keeps payments, and prevents cron recreation', async () => {
	const { sql, database, event } = billingFixture();
	await assert.rejects(
		actions.delete({ ...event, request: request('POST', { id: '1' }) }),
		(e) => e.status === 303
	);
	assert.ok(sql.prepare('SELECT deleted_at FROM obligations WHERE id=1').get().deleted_at);
	assert.equal((await getUserBalances(database, 'left@tsu.ac.th')).results[0].owed, 90);
	const detail = await loadUser({ ...event, params: { user: 'left@tsu.ac.th' } });
	assert.deepEqual(
		detail.allObligations.map((o) => o.id),
		[2, 3]
	);
	assert.equal(detail.allTransactionsFromUser.length, 3);
	assert.equal(detail.allocatedWeeks[0].allocated, 20);
	assert.deepEqual(
		(await loadObligations(event)).weeks.map((w) => w.id),
		['2', '3']
	);
	assert.doesNotMatch(await (await download.GET(event)).text(), /Earlier obligation/);
	const { url } = await (await subscription.POST({ ...event, request: request('POST') })).json();
	const token = new URL(url).pathname.split('/').pop();
	assert.doesNotMatch(
		await (await feed.GET({ ...event, params: { token } })).text(),
		/Earlier obligation/
	);
	assert.ok(
		sql
			.prepare('SELECT 1 FROM obligations WHERE start_date = ? LIMIT 1')
			.get(parseDateInput('2026-09-01'))
	);
	assert.equal(
		(await actions.delete({ ...event, request: request('POST', { id: '1' }) })).status,
		404
	);
	for (const id of ['2', '3'])
		await assert.rejects(
			actions.delete({ ...event, request: request('POST', { id }) }),
			(e) => e.status === 303
		);
	assert.equal((await loadObligations(event)).weeks.length, 0);
	assert.equal((await getUserBalances(database, 'left@tsu.ac.th')).results[0].net, 20);
	assert.match(await (await download.GET(event)).text(), /BEGIN:VCALENDAR/);
	sql.close();
});

test('departure edits and deletion reject invalid values and non-admin callers without writes', async () => {
	const { sql, event } = billingFixture();
	for (const leavingDate of ['', null, false, 0, '2026-02-30', '2026-13-01']) {
		await assert.rejects(
			setLeavingDate(departureEvent(event, 'left@tsu.ac.th', leavingDate)),
			(e) => e.status === 400
		);
	}
	for (const locals of [{}, { user: { ...user, admin: false } }]) {
		await assert.rejects(
			setLeavingDate(departureEvent({ ...event, locals }, 'left@tsu.ac.th', '2026-09-28')),
			(e) => [401, 403].includes(e.status)
		);
		for (const action of [actions.create, actions.update, actions.delete]) {
			await assert.rejects(
				action({ ...event, locals, request: request('POST', { id: '1' }) }),
				(e) => [401, 403].includes(e.status)
			);
		}
	}
	const foreign = departureEvent(event, 'left@tsu.ac.th', '2026-09-28');
	foreign.request.headers.set('origin', 'https://other.example');
	await assert.rejects(setLeavingDate(foreign), (e) => e.status === 403);
	await assert.rejects(
		setLeavingDate(departureEvent(event, 'missing@tsu.ac.th', '2026-09-28')),
		(e) => e.status === 404
	);
	for (const id of ['', '0', '-1', '1.2', 'no'])
		assert.equal(
			(await actions.delete({ ...event, request: request('POST', { id }) })).status,
			400
		);
	assert.equal(
		sql.prepare("SELECT left_at FROM users WHERE email='left@tsu.ac.th'").get().left_at,
		null
	);
	assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM logs').get().count, 0);
	sql.close();
});

test('marking a departure blocks new logins, existing JWTs, and subscriptions immediately even for future dates', async () => {
	const { sql, database, event } = billingFixture();
	const secretBytes = new TextEncoder().encode('test-signing-secret-with-32-bytes!');
	const secret = Buffer.from(secretBytes).toString('base64');
	const env = {
		AccountingDatabase: database,
		SharedSecrets: { get: async () => secret },
		AUTHENTICATION_METHOD: 'JWT'
	};
	const token = await new SignJWT({ role: 'user', name: 'Test', nickname: 'Test' })
		.setSubject('left@tsu.ac.th')
		.setExpirationTime('1h')
		.setProtectedHeader({ alg: 'HS256' })
		.sign(secretBytes);
	assert.equal((await verifyJWT(token, env)).email, 'left@tsu.ac.th');
	assert.equal((await requireLoginUser(database, 'left@tsu.ac.th')).email, 'left@tsu.ac.th');
	const studentEvent = {
		...event,
		locals: { user: { ...user, email: 'left@tsu.ac.th', admin: false } }
	};
	const { url } = await (
		await subscription.POST({ ...studentEvent, request: request('POST') })
	).json();
	const calendarToken = new URL(url).pathname.split('/').pop();
	sql.exec(
		"UPDATE users SET session_token='old-session', session_expiry=9999999999 WHERE email='left@tsu.ac.th'"
	);
	await setLeavingDate(departureEvent(event, 'left@tsu.ac.th', '2099-01-01'));
	await assert.rejects(requireLoginUser(database, 'left@tsu.ac.th'), (e) => e.status === 403);
	await assert.rejects(verifyJWT(token, env), (e) => e.status === 403);
	await assert.rejects(
		feed.GET({ ...event, params: { token: calendarToken } }),
		(e) => e.status === 404
	);
	await assert.rejects(download.GET(studentEvent), (e) => e.status === 403);
	const saved = sql
		.prepare("SELECT session_token, session_expiry FROM users WHERE email='left@tsu.ac.th'")
		.get();
	assert.equal(saved.session_token, null);
	assert.equal(saved.session_expiry, null);
	const cookies = [];
	await assert.rejects(
		handle({
			event: {
				...event,
				platform: { env },
				locals: {},
				cookies: { get: () => token, set: (...args) => cookies.push(args) },
				url: new URL('/admin/users', origin),
				request: request('GET')
			},
			resolve: () => {
				throw new Error('Blocked user reached the route');
			}
		}),
		(e) => e.status === 302
	);
	assert.equal(cookies[0][0], 'token');
	assert.equal(cookies[0][1], '');
	await setLeavingDate(departureEvent(event, 'left@tsu.ac.th', '2026-09-01'));
	await assert.rejects(verifyJWT(token, env), (e) => e.status === 403);
	sql.close();
});

test('Google login returns an account-left error and does not issue a cookie', async (t) => {
	const { sql, event } = billingFixture();
	await setLeavingDate(departureEvent(event, 'left@tsu.ac.th', '2099-01-01'));
	t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => ({
		getPayload: () => ({ email: 'left@tsu.ac.th', email_verified: true })
	}));
	await assert.rejects(
		googleLogin.POST({
			...event,
			request: new Request(origin, {
				method: 'POST',
				body: JSON.stringify({ id_token: 'mock-google-token' })
			}),
			cookies: {
				set: () => {
					throw new Error('Blocked account received a cookie');
				}
			}
		}),
		(e) => e.status === 403 && /marked as left/.test(e.body.message)
	);
	sql.close();
});

test('deleting and importing a departed user never removes the sign-in block', async () => {
	const { sql, database, event } = billingFixture();
	await setLeavingDate(departureEvent(event, 'left@tsu.ac.th', '2026-09-28'));
	await deleteUser({ ...event, params: { user: 'left@tsu.ac.th' } });
	assert.ok(
		sql.prepare("SELECT deleted_at FROM users WHERE email='left@tsu.ac.th'").get().deleted_at
	);
	const response = await importUsers({
		...event,
		request: new Request(origin, {
			method: 'POST',
			body: JSON.stringify({
				students: [{ id: 'left@tsu.ac.th', name: 'Reimport', nickname: 'Test' }]
			})
		})
	});
	assert.equal(response.status, 200);
	assert.equal(
		sql.prepare("SELECT left_at FROM users WHERE email='left@tsu.ac.th'").get().left_at,
		parseDateInput('2026-09-28')
	);
	await assert.rejects(requireLoginUser(database, 'left@tsu.ac.th'), (e) => e.status === 403);
	sql.close();
});

test('admins can save, edit, list, and remove automatic creation pauses without changing existing charges', async () => {
	const { sql, database, event } = fixture();
	const fields = { start_date: '2026-10-04', end_date: '2026-10-18', reason: 'Semester break' };
	assert.equal(
		(await actions.saveCreationPause({ ...event, request: request('POST', fields) })).ok,
		true
	);
	const pause = sql.prepare('SELECT * FROM obligation_creation_pauses').get();
	assert.equal(pause.start_date, parseDateInput(fields.start_date));
	assert.equal(pause.end_date, parseDateInput(fields.end_date));
	assert.equal(pause.reason, fields.reason);
	assert.deepEqual((await loadObligations(event)).creationPauses, [{ id: pause.id, ...fields }]);
	await actions.saveCreationPause({
		...event,
		request: request('POST', {
			...fields,
			id: String(pause.id),
			end_date: '2026-10-04',
			reason: 'One week'
		})
	});
	assert.equal(
		sql.prepare('SELECT end_date FROM obligation_creation_pauses').get().end_date,
		pause.start_date
	);
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligations').get().n, 1);
	assert.equal((await getUserBalances(database, user.email)).results[0].owed, 30);
	await actions.removeCreationPause({
		...event,
		request: request('POST', { id: String(pause.id) })
	});
	assert.equal((await loadObligations(event)).creationPauses.length, 0);
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM logs').get().n, 3);
	assert.equal(
		(
			await actions.removeCreationPause({
				...event,
				request: request('POST', { id: String(pause.id) })
			})
		).status,
		404
	);
	sql.close();
});

test('automatic creation controls reject invalid dates, invalid ids and non-admin writes', async () => {
	const { sql, event } = fixture();
	const fields = { start_date: '2026-10-04', end_date: '2026-10-18' };
	for (const bad of [
		{ start_date: '' },
		{ end_date: '' },
		{ start_date: '2026-02-30' },
		{ end_date: '2026-10-03' },
		{ id: '0' },
		{ id: '1.5' }
	]) {
		assert.equal(
			(
				await actions.saveCreationPause({
					...event,
					request: request('POST', { ...fields, ...bad })
				})
			).status,
			400
		);
	}
	assert.equal(
		(
			await actions.saveCreationPause({
				...event,
				request: request('POST', { ...fields, id: '999' })
			})
		).status,
		404
	);
	for (const id of ['', '0', '-1', '1.5', 'no'])
		assert.equal(
			(await actions.removeCreationPause({ ...event, request: request('POST', { id }) })).status,
			400
		);
	for (const action of [actions.saveCreationPause, actions.removeCreationPause]) {
		for (const locals of [{}, { user: { ...user, admin: false } }]) {
			await assert.rejects(
				action({ ...event, locals, request: request('POST', { ...fields, id: '1' }) }),
				(e) => [401, 403].includes(e.status)
			);
		}
	}
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligation_creation_pauses').get().n, 0);
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM logs').get().n, 0);
	sql.close();
});

test('creator skips inclusive start-date boundaries and resumes after the paused range', async () => {
	const { sql, database, event } = fixture();
	sql.exec('DELETE FROM obligations');
	await actions.saveCreationPause({
		...event,
		request: request('POST', { start_date: '2026-10-04', end_date: '2026-10-11' })
	});
	assert.equal(await newWeeklyObligations(database, new Date('2026-09-28T12:00:00Z')), false);
	assert.equal(await newWeeklyObligations(database, new Date('2026-10-04T00:00:00Z')), false);
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligations').get().n, 0);
	assert.equal(await newWeeklyObligations(database, new Date('2026-10-12T12:00:00Z')), true);
	const row = sql.prepare('SELECT * FROM obligations').get();
	assert.equal(row.start_date, parseDateInput('2026-10-18'));
	assert.equal(row.end_date, parseDateInput('2026-10-24'));
	assert.equal(row.amount, 30);
	sql.close();
});

test('creator uses obligation start dates rather than execution time or overlap with the rest of a week', async () => {
	const { sql, database, event } = fixture();
	sql.exec('DELETE FROM obligations');
	await actions.saveCreationPause({
		...event,
		request: request('POST', { start_date: '2026-09-28', end_date: '2026-10-03' })
	});
	await actions.saveCreationPause({
		...event,
		request: request('POST', { start_date: '2026-10-05', end_date: '2026-10-10' })
	});
	assert.equal(await newWeeklyObligations(database, new Date('2026-09-28T12:00:00Z')), true);
	assert.equal(
		sql.prepare('SELECT start_date FROM obligations').get().start_date,
		parseDateInput('2026-10-04')
	);
	sql.close();
});

test('editing and removing overlapping pauses updates the next creator run without duplicating or recreating deleted weeks', async () => {
	const { sql, database, event } = fixture();
	sql.exec('DELETE FROM obligations');
	const now = new Date('2026-09-28T12:00:00Z');
	const fields = { start_date: '2026-10-04', end_date: '2026-10-11' };
	for (let i = 0; i < 2; i++)
		await actions.saveCreationPause({ ...event, request: request('POST', fields) });
	await actions.removeCreationPause({ ...event, request: request('POST', { id: '1' }) });
	assert.equal(await newWeeklyObligations(database, now), false);
	await actions.saveCreationPause({
		...event,
		request: request('POST', { id: '2', start_date: '2026-10-05', end_date: '2026-10-11' })
	});
	assert.equal(await newWeeklyObligations(database, now), true);
	assert.equal(await newWeeklyObligations(database, now), false);
	sql.exec('UPDATE obligations SET deleted_at=1');
	assert.equal(await newWeeklyObligations(database, now), false);
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligations').get().n, 1);
	sql.close();
});

test('actual scheduled worker honors a saved pause, then creates only one week after removal', async (t) => {
	const { sql, database, event } = fixture();
	sql.exec('DELETE FROM obligations');
	t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-27T00:00:00Z') });
	await actions.saveCreationPause({
		...event,
		request: request('POST', { start_date: '2026-10-04', end_date: '2026-10-04' })
	});
	await obligationWorker.scheduled({ cron: '0 0 * * SUN' }, { AccountingDatabase: database });
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligations').get().n, 0);
	await actions.removeCreationPause({ ...event, request: request('POST', { id: '1' }) });
	await obligationWorker.scheduled({ cron: '0 0 * * SUN' }, { AccountingDatabase: database });
	assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM obligations').get().n, 1);
	assert.equal(
		sql.prepare('SELECT start_date FROM obligations').get().start_date,
		parseDateInput('2026-10-04')
	);
	sql.close();
});
