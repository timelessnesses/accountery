import { toISODate, type AllocatedWeek } from './payments.svelte';
import type { Obligation, Transaction } from './types/AccountingDatabaseTypes';

export function buildAllocatedWeeks(
	obligations: Obligation[],
	transactions: Transaction[]
): AllocatedWeek[] {
	const sortedObligations = [...obligations].sort(
		(a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
	);

	let approvedFunds = transactions
		.filter((tx) => tx.approved === 'approved')
		.reduce((sum, tx) => sum + tx.amount, 0);

	let pendingFunds = transactions
		.filter((tx) => tx.approved === 'pending')
		.reduce((sum, tx) => sum + tx.amount, 0);

	return sortedObligations.map((obligation) => {
		const cost = obligation.amount;

		let allocated = 0;
		let pendingAllocated = 0;

		// consume approved funds first
		if (approvedFunds > 0) {
			allocated = Math.min(approvedFunds, cost);
			approvedFunds -= allocated;
		}

		let remaining = cost - allocated;

		// consume pending funds second
		if (remaining > 0 && pendingFunds > 0) {
			pendingAllocated = Math.min(pendingFunds, remaining);

			pendingFunds -= pendingAllocated;
			remaining -= pendingAllocated;
		}

		let status: AllocatedWeek['status'];

		if (remaining === 0 && pendingAllocated === 0) {
			status = 'paid';
		} else if (pendingAllocated > 0) {
			status = 'waiting_approval';
		} else if (allocated > 0) {
			status = 'partial';
		} else {
			status = 'unpaid';
		}

		return {
			id: obligation.id.toString(),
			weekStart: toISODate(new Date(obligation.start_date)),
			label: obligation.description,

			cost,

			allocated: allocated,

			remaining,
			pendingAllocated: pendingAllocated,

			status
		};
	});
}
