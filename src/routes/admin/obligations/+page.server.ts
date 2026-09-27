import { obligationDates, parseDateInput, unixTimestampToDate } from '$lib/date';
import { buildAllocatedWeeks } from '$lib/paymentAlloc';
import type { AllocatedWeek } from '$lib/payments.svelte';
import type { Obligation, Transaction, User } from '$lib/types/AccountingDatabaseTypes';
import { fail, redirect } from '@sveltejs/kit';

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
			.prepare('SELECT * FROM obligations ORDER BY start_date')
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
			remaining: obligation.amount * users.length,
			status: 'unpaid',
			paidStudents: 0,
			pendingStudents: 0,
			incompleteStudents: 0,
			students: []
		});
	}

	for (const user of users) {
		const userTransactions = transactions.filter((transaction) => transaction.email === user.email);
		const allocatedWeeks = buildAllocatedWeeks(obligations, userTransactions);
		const info = await accountingDatabase
			.prepare('SELECT name, nickname FROM users WHERE email = ? AND deleted_at IS NULL')
			.bind(user.email)
			.first<{ name: string; nickname: string }>();

		for (const allocatedWeek of allocatedWeeks) {
			const week = weeksById.get(allocatedWeek.id);
			if (!week) continue;

			const student: StudentWeek = {
				email: user.email,
				name: info?.name ?? user.name,
				nickname: info?.nickname ?? user.nickname,
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
		const remaining = Math.max(week.amount * users.length - week.allocated, 0);
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
	create: async ({ platform, request }) => {
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
	update: async ({ platform, request }) => {
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
                WHERE id = ?
            `
			)
			.bind(values.startDate, values.endDate, values.amount, values.description, id)
			.run();

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
