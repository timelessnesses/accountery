// Domain types + reactive store for weekly payment obligations.
// Persistence: client-side localStorage (mock). No backend.

export type WeekStatus = 'paid' | 'partial' | 'unpaid';

export interface Obligation {
	id: string;
	/** ISO date (yyyy-mm-dd) of the Monday that starts this obligation week. */
	weekStart: string;
	label: string;
	cost: number;
}

export interface Payment {
	id: string;
	/** ISO datetime the payment was recorded. */
	date: string;
	amount: number;
	note?: string;
	/** data URL of the uploaded proof image. */
	proof?: string;
}

export interface AllocatedWeek extends Obligation {
	allocated: number;
	remaining: number;
	status: WeekStatus;
}

const CURRENCY = 'USD';
const STORAGE_KEY = 'weekly-payments-v1';

export const currency = new Intl.NumberFormat('en-US', {
	style: 'currency',
	currency: CURRENCY
});

/* ----------------------------- date helpers ----------------------------- */

export function toISODate(d: Date): string {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x.toISOString().slice(0, 10);
}

/** Monday-based start of the week containing `d`. */
export function startOfWeek(d: Date): Date {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	const day = (x.getDay() + 6) % 7; // 0 = Monday
	x.setDate(x.getDate() - day);
	return x;
}

export function addDays(iso: string, days: number): string {
	const d = new Date(iso + 'T00:00:00');
	d.setDate(d.getDate() + days);
	return toISODate(d);
}

export function formatWeekRange(weekStart: string): string {
	const start = new Date(weekStart + 'T00:00:00');
	const end = new Date(start);
	end.setDate(end.getDate() + 6);
	const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	return `${fmt(start)} – ${fmt(end)}`;
}

/* ------------------------------- seed data ------------------------------- */

function seedObligations(): Obligation[] {
	const thisMonday = startOfWeek(new Date());
	const weeks: Obligation[] = [];
	// 3 past weeks + current + 2 upcoming
	for (let i = -3; i <= 2; i++) {
		const ws = new Date(thisMonday);
		ws.setDate(ws.getDate() + i * 7);
		weeks.push({
			id: crypto.randomUUID(),
			weekStart: toISODate(ws),
			label: `Week of ${formatWeekRange(toISODate(ws))}`,
			cost: 150
		});
	}
	return weeks;
}

function seedPayments(): Payment[] {
	// Enough to fully cover the first ~2 weeks, leaving later weeks open.
	return [
		{
			id: crypto.randomUUID(),
			date: new Date(Date.now() - 18 * 864e5).toISOString(),
			amount: 150,
			note: 'Bank transfer'
		},
		{
			id: crypto.randomUUID(),
			date: new Date(Date.now() - 11 * 864e5).toISOString(),
			amount: 120,
			note: 'Partial — cash'
		}
	];
}

/* ------------------------------ persistence ------------------------------ */

interface Persisted {
	obligations: Obligation[];
	payments: Payment[];
}

function load(): Persisted {
	if (typeof localStorage === 'undefined') {
		return { obligations: [], payments: [] };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) return JSON.parse(raw) as Persisted;
	} catch {
		// ignore corrupt storage
	}
	return { obligations: seedObligations(), payments: seedPayments() };
}

/* -------------------------------- store --------------------------------- */

function createStore() {
	const initial = load();
	let obligations = $state<Obligation[]>(initial.obligations);
	let payments = $state<Payment[]>(initial.payments);

	function persist() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ obligations, payments }));
	}

	const totalPaid = $derived(payments.reduce((s, p) => s + p.amount, 0));
	const totalOwed = $derived(obligations.reduce((s, o) => s + o.cost, 0));

	/** Obligations sorted oldest-first with cumulative allocation applied. */
	const allocated = $derived.by<AllocatedWeek[]>(() => {
		const sorted = [...obligations].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
		let pool = totalPaid;
		return sorted.map((o) => {
			const allocated = Math.max(0, Math.min(o.cost, pool));
			pool -= allocated;
			const remaining = o.cost - allocated;
			const status: WeekStatus =
				remaining <= 0 ? 'paid' : allocated > 0 ? 'partial' : 'unpaid';
			return { ...o, allocated, remaining, status };
		});
	});

	const nextDue = $derived(allocated.find((w) => w.status !== 'paid'));

	return {
		get obligations() {
			return obligations;
		},
		get payments() {
			return payments;
		},
		get allocated() {
			return allocated;
		},
		get totalPaid() {
			return totalPaid;
		},
		get totalOwed() {
			return totalOwed;
		},
		get nextDue() {
			return nextDue;
		},
		addPayment(input: { amount: number; note?: string; proof?: string }) {
			payments = [
				...payments,
				{
					id: crypto.randomUUID(),
					date: new Date().toISOString(),
					amount: input.amount,
					note: input.note,
					proof: input.proof
				}
			];
			persist();
		},
		removePayment(id: string) {
			payments = payments.filter((p) => p.id !== id);
			persist();
		},
		addObligation(input: { weekStart: string; cost: number; label?: string }) {
			obligations = [
				...obligations,
				{
					id: crypto.randomUUID(),
					weekStart: input.weekStart,
					cost: input.cost,
					label: input.label ?? `Week of ${formatWeekRange(input.weekStart)}`
				}
			];
			persist();
		},
		reset() {
			obligations = seedObligations();
			payments = seedPayments();
			persist();
		}
	};
}

export const store = createStore();
