// Domain types + reactive store for weekly payment obligations.
// Persistence: client-side localStorage (mock). No backend.

export type WeekStatus = 'paid' | 'partial' | 'unpaid' | 'waiting_approval';

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
	pendingAllocated: number;
	status: WeekStatus;
}

const CURRENCY = 'THB';

export const currency = new Intl.NumberFormat('th-TH', {
	style: 'currency',
	currency: CURRENCY
});

/* ----------------------------- date helpers ----------------------------- */

export function toISODate(d: Date): string {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	const year = x.getFullYear();
	const month = String(x.getMonth() + 1).padStart(2, '0');
	const day = String(x.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
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
