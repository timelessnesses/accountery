import type { AllocatedWeek } from "$lib/payments.svelte";
import type { Obligation, Transaction } from "$lib/types/AccountingDatabaseTypes";

function toISODate(value: Date | string): string {
    return new Date(value).toISOString().slice(0, 10);
}

function buildAllocatedWeeks(obligations: Obligation[], transactions: Transaction[]): AllocatedWeek[] {
    const sortedObligations = [...obligations].sort(
        (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
    );
    let remainingPayments = transactions.reduce((sum, tx) => sum + tx.amount, 0);

    return sortedObligations.map((obligation) => {
        const allocated = Math.max(0, Math.min(obligation.amount, remainingPayments));
        remainingPayments -= allocated;
        const remaining = obligation.amount - allocated;
        const status = remaining <= 0 ? 'paid' : allocated > 0 ? 'partial' : 'unpaid';

        return {
            id: obligation.id.toString(),
            weekStart: toISODate(obligation.start_date),
            label: obligation.description,
            cost: obligation.amount,
            allocated,
            remaining,
            status
        };
    });
}

export const load = async ({ locals, platform }) => {
    const accountingDatabase = platform?.env.AccountingDatabase as D1Database;
    const allTransactionsFromUser = (await (accountingDatabase.prepare(
        "SELECT * FROM transactions WHERE email = ?"
    ).bind(locals.user.email)).all<Transaction>()).results.map((transaction) => ({
        ...transaction,
        date: new Date(transaction.date)
    })) as Transaction[];
    const allObligations = (await (accountingDatabase.prepare(
        "SELECT * FROM obligations"
    )).all<Obligation>()).results.map((obligation) => ({
        ...obligation,
        start_date: new Date(obligation.start_date),
        end_date: new Date(obligation.end_date)
    })) as Obligation[];
    const allocatedWeeks = buildAllocatedWeeks(allObligations, allTransactionsFromUser);
    const nextDue = allocatedWeeks.find((week) => week.status !== 'paid');

    return {
        user: locals.user,
        transactions: allTransactionsFromUser,
        obligations: allObligations,
        allocatedWeeks,
        nextDue
    };
};