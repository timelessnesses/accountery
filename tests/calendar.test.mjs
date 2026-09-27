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
			return { url: 'data:text/javascript,export const env = {}', shortCircuit: true };
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
const user = { email: 'test@example.com', name: 'Test', nickname: 'Test', admin: true };
const origin = 'https://accounting.example.com';
function fixture() {
	const sql = new DatabaseSync(':memory:');
	sql.exec(
		`CREATE TABLE users (email TEXT PRIMARY KEY, deleted_at INTEGER); INSERT INTO users VALUES ('test@example.com', NULL); CREATE TABLE obligations (id INTEGER PRIMARY KEY, start_date INTEGER NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL); INSERT INTO obligations VALUES (1, 1798675200, 30, 'Legacy week');`
	);
	sql.exec(readFileSync(resolve(root, 'migrations/0013_ics.sql'), 'utf8'));
	sql.exec(readFileSync(resolve(root, 'migrations/0014_guh.sql'), 'utf8'));
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
					return statement.run(...params);
				}
			};
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
