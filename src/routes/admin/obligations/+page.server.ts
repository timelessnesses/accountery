import { obligationDates, parseDateInput, unixTimestampToDate } from '$lib/date';
import { buildAllocatedWeeks } from '$lib/paymentAlloc';
import type { AllocatedWeek } from '$lib/payments.svelte';
import type { Obligation, Transaction, User } from '$lib/types/AccountingDatabaseTypes';
import { fail, redirect } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/admin';
import { applicableObligationSql } from '$lib/server/billing';

type StudentWeek = {
	email: string;
	name: string;
	nickname: string;
	allocated: number;
	pendingAllocated: number;
	remaining: number;
	status: AllocatedWeek['status'];
};

type ObligationWeek = AllocatedWeek & {
	amount: number;
	paidStudents: number;
	pendingStudents: number;
	incompleteStudents: number;
	students: StudentWeek[];
};

export const load = async ({ platform }) => {
	const accountingDatabase = platform?.env.AccountingDatabase as D1Database;

	const users = (
		await accountingDatabase
			.prepare('SELECT * FROM users WHERE deleted_at IS NULL ORDER BY email')
			.all<User>()
	).results.map((user) => ({
		...user,
		session_expiry: user.session_expiry ? new Date(user.session_expiry) : null,
		logged_in_when: user.logged_in_when ? new Date(user.logged_in_when) : null,
		deleted_at: user.deleted_at ? new Date(user.deleted_at) : null
	})) as User[];

	const obligations = (
		await accountingDatabase
			.prepare('SELECT * FROM obligations WHERE deleted_at IS NULL ORDER BY start_date, id')
			.all<Obligation>()
	).results.map((obligation) => ({
		...obligation,
		...obligationDates(obligation)
	})) as Obligation[];

	const transactions = (
		await accountingDatabase.prepare('SELECT * FROM transactions ORDER BY date').all<Transaction>()
	).results.map((transaction) => ({
		...transaction,
		date: unixTimestampToDate(transaction.date)
	})) as Transaction[];

	const weeksById = new Map<string, ObligationWeek>();

	for (const obligation of obligations) {
		const id = obligation.id.toString();
		weeksById.set(id, {
			id,
			dayStart: obligation.start_date.toISOString().slice(0, 10),
			dayEnd: obligationDates(obligation).end_date.toISOString().slice(0, 10),
			label: obligation.description,
			cost: obligation.amount,
			amount: obligation.amount,
			allocated: 0,
			pendingAllocated: 0,
			remaining: 0,
			status: 'unpaid',
			paidStudents: 0,
			pendingStudents: 0,
			incompleteStudents: 0,
			students: []
		});
	}

	const eligibleRows = (
		await accountingDatabase
			.prepare(
				`
		SELECT u.email, o.id FROM users u JOIN obligations o ON ${applicableObligationSql}
		WHERE u.deleted_at IS NULL
	`
			)
			.all<{ email: string; id: number }>()
	).results;
	const eligibleIds = new Map<string, Set<number>>();
	for (const row of eligibleRows) {
		if (!eligibleIds.has(row.email)) eligibleIds.set(row.email, new Set());
		eligibleIds.get(row.email)!.add(row.id);
	}
	for (const user of users) {
		const userTransactions = transactions.filter((transaction) => transaction.email === user.email);
		const userObligations = obligations.filter((obligation) =>
			eligibleIds.get(user.email)?.has(obligation.id)
		);
		const allocatedWeeks = buildAllocatedWeeks(userObligations, userTransactions);

		for (const allocatedWeek of allocatedWeeks) {
			const week = weeksById.get(allocatedWeek.id);
			if (!week) continue;

			const student: StudentWeek = {
				email: user.email,
				name: user.name,
				nickname: user.nickname,
				allocated: allocatedWeek.allocated,
				pendingAllocated: allocatedWeek.pendingAllocated,
				remaining: allocatedWeek.remaining,
				status: allocatedWeek.status
			};

			week.students.push(student);
			week.allocated += allocatedWeek.allocated;
			week.pendingAllocated += allocatedWeek.pendingAllocated;

			if (allocatedWeek.status === 'paid') {
				week.paidStudents += 1;
			} else {
				week.incompleteStudents += 1;
			}

			if (allocatedWeek.status === 'waiting_approval') {
				week.pendingStudents += 1;
			}
		}
	}

	const weeks = Array.from(weeksById.values()).map((week) => {
		const remaining = Math.max(week.amount * week.students.length - week.allocated, 0);
		const status: AllocatedWeek['status'] =
			week.incompleteStudents === 0
				? 'paid'
				: week.pendingStudents > 0
					? 'waiting_approval'
					: week.paidStudents > 0
						? 'partial'
						: 'unpaid';

		return {
			...week,
			remaining,
			status,
			students: week.students.sort((a, b) => {
				if (a.status === b.status) return a.email.localeCompare(b.email);
				if (a.status === 'paid') return -1;
				if (b.status === 'paid') return 1;
				return a.status.localeCompare(b.status);
			})
		};
	});

	return {
		totalStudents: users.length,
		weeks
	};
};

export const actions = {
	create: async ({ platform, request, locals }) => {
		requireAdmin(locals.user);
		const values = await readObligationForm(request);

		if (!values.ok) {
			return fail(400, values);
		}

		const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
		await accountingDatabase
			.prepare(
				`
                INSERT INTO obligations (start_date, end_date, amount, description)
                VALUES (?, ?, ?, ?)
            `
			)
			.bind(values.startDate, values.endDate, values.amount, values.description)
			.run();

		throw redirect(303, '/admin/obligations');
	},
	update: async ({ platform, request, locals }) => {
		requireAdmin(locals.user);
		const form = await request.formData();
		const id = Number(form.get('id'));
		const values = parseObligationValues(form);

		if (!Number.isInteger(id)) {
			return fail(400, { ok: false, message: 'Invalid obligation id' });
		}

		if (!values.ok) {
			return fail(400, values);
		}

		const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
		await accountingDatabase
			.prepare(
				`
                UPDATE obligations
                SET start_date = ?,
                    end_date = ?,
                    amount = ?,
                    description = ?
                WHERE id = ? AND deleted_at IS NULL
            `
			)
			.bind(values.startDate, values.endDate, values.amount, values.description, id)
			.run();

		throw redirect(303, '/admin/obligations');
	},
	delete: async ({ platform, request, locals }) => {
		const admin = requireAdmin(locals.user);
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!Number.isSafeInteger(id) || id <= 0) {
			return fail(400, { ok: false, message: 'Invalid obligation id' });
		}
		const database = platform!.env.AccountingDatabase;
		const obligation = await database
			.prepare('SELECT id FROM obligations WHERE id = ? AND deleted_at IS NULL')
			.bind(id)
			.first();
		if (!obligation) return fail(404, { ok: false, message: 'Obligation not found' });
		const now = Math.floor(Date.now() / 1000);
		await database.batch([
			database
				.prepare('UPDATE obligations SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL')
				.bind(now, id),
			database
				.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
				.bind(admin.email, `Deleted obligation #${id}`, now)
		]);
		throw redirect(303, '/admin/obligations');
	}
};

async function readObligationForm(request: Request) {
	return parseObligationValues(await request.formData());
}

function parseObligationValues(form: FormData) {
	const startDateValue = String(form.get('start_date') ?? '');
	const endDateValue = String(form.get('end_date') ?? '');
	const amount = Number(form.get('amount'));
	const description = String(form.get('description') ?? '').trim();
	const startDate = parseDateInput(startDateValue);
	const endDate = parseDateInput(endDateValue);

	if (startDate === null) {
		return { ok: false, message: 'A valid start date is required' } as const;
	}

	if (endDate === null) {
		return { ok: false, message: 'A valid end date is required' } as const;
	}

	if (endDate < startDate) {
		return { ok: false, message: 'End date must be on or after start date' } as const;
	}

	if (!Number.isFinite(amount) || amount <= 0) {
		return { ok: false, message: 'Amount must be greater than zero' } as const;
	}

	if (!description) {
		return { ok: false, message: 'Description is required' } as const;
	}

	return {
		ok: true,
		startDate,
		endDate,
		amount: Math.round(amount),
		description
	} as const;
}
