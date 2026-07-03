import { unixTimestampToDate } from '$lib/date';
import { buildAllocatedWeeks } from '$lib/paymentAlloc';
import { toISODate, type AllocatedWeek } from '$lib/payments.svelte';
import type { Obligation, Transaction, User } from '$lib/types/AccountingDatabaseTypes';
import { linkedUserAccountWithInfo } from '$lib/whitelisted.js';
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

	const users = (await accountingDatabase.prepare('SELECT * FROM users ORDER BY email').all<User>())
		.results;

	const obligations = (
		await accountingDatabase
			.prepare('SELECT * FROM obligations ORDER BY start_date')
			.all<Obligation>()
	).results.map((obligation) => ({
		...obligation,
		start_date: new Date(Number(obligation.start_date) * 1000)
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
			weekStart: toISODate(obligation.start_date),
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
		const info =
			linkedUserAccountWithInfo[
				user.email.split('@')[0] as unknown as keyof typeof linkedUserAccountWithInfo
			];

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
                INSERT INTO obligations (start_date, amount, description)
                VALUES (?, ?, ?)
            `
			)
			.bind(values.startDate, values.amount, values.description)
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
                    amount = ?,
                    description = ?
                WHERE id = ?
            `
			)
			.bind(values.startDate, values.amount, values.description, id)
			.run();

		throw redirect(303, '/admin/obligations');
	}
};

async function readObligationForm(request: Request) {
	return parseObligationValues(await request.formData());
}

function parseObligationValues(form: FormData) {
	const startDateValue = String(form.get('start_date') ?? '');
	const amount = Number(form.get('amount'));
	const description = String(form.get('description') ?? '').trim();
	const startDate = Math.floor(new Date(`${startDateValue}T00:00:00`).getTime() / 1000);

	if (!startDateValue || !Number.isFinite(startDate)) {
		return { ok: false, message: 'Start date is required' } as const;
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
		amount: Math.round(amount),
		description
	} as const;
}
