<script lang="ts">
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import TransactionLog from '$lib/TransactionLog.svelte';
	import { formatWeekRange, currency, type AllocatedWeek } from '$lib/payments.svelte';
	import { linkedUserAccountWithInfo } from '$lib/whitelisted.js';

	const { data } = $props();
    if (!data) {
        alert('No data found. Please check the server logs for more information.');
        window.location.href = '/admin/users';
    }

	let selectedWeek = $state<AllocatedWeek | undefined>();

	function handleSelect(week: AllocatedWeek) {
		selectedWeek = week;
	}

	const statusMeta = {
		paid: { label: 'Paid', dot: 'bg-success', text: 'text-success' },
		partial: { label: 'Partial', dot: 'bg-warning', text: 'text-warning' },
		unpaid: { label: 'Unpaid', dot: 'bg-danger', text: 'text-danger' },
		waiting_approval: {
			label: 'Waiting approval',
			dot: 'bg-info',
			text: 'text-info'
		}
	} as const;

	if (!data.allTransactionsFromUser || !data.allocatedWeeks || !data.allObligations) {
		throw new Error('Required data not found');
	}

	const info =
		linkedUserAccountWithInfo[
			data.user?.email.split('@')[0] as unknown as keyof typeof linkedUserAccountWithInfo
		] ?? {};
	const totalPaid = $derived(
		[...data.allTransactionsFromUser]
			.filter((tx) => tx.approved === 'approved')
			.reduce((sum, tx) => sum + tx.amount, 0)
	);
	const totalPending = $derived(
		[...data.allTransactionsFromUser]
			.filter((tx) => tx.approved === 'pending')
			.reduce((sum, tx) => sum + tx.amount, 0)
	);
	const totalOwed = $derived(data.allObligations.reduce((sum, ob) => sum + ob.amount, 0));
</script>

<h2 class="text-center">
	User {info.name} ({data.user.email})
	<span>Paid: {totalPaid} + {totalPending} = {totalPaid + totalPending}</span>
	Owned: {totalOwed} Net: {totalPaid - totalOwed}
</h2>
<div class="mt-6 grid gap-6 lg:grid-cols-[280px_1fr_360px]" style="height: 100%">
	<!-- Transaction history -->
	<div class="min-h-0">
		<TransactionLog transactions={data.allTransactionsFromUser} />
	</div>

	<!-- Calendar -->
	<div class="rounded-xl border border-border bg-card p-4">
		<PaymentCalendar weeks={data.allocatedWeeks} onselect={handleSelect} />
	</div>

	<!-- Details -->
	<div class="rounded-xl border border-border bg-card p-4">
		{#if selectedWeek}
			{@const meta = statusMeta[selectedWeek.status]}

			<p class="text-xs text-muted-foreground">Selected week</p>

			<p class="mt-1 font-semibold">
				{formatWeekRange(selectedWeek.weekStart)}
			</p>

			<div class="mt-3 flex items-center gap-2">
				<span class="h-2 w-2 rounded-full {meta.dot}"></span>
				<span class={meta.text}>
					{meta.label}
				</span>
			</div>

			<div class="mt-4 space-y-2 text-sm">
				<div class="flex justify-between">
					<span>Cost</span>
					<span>{currency.format(selectedWeek.cost)}</span>
				</div>

				<div class="flex justify-between">
					<span>Approved</span>
					<span>{currency.format(selectedWeek.allocated)}</span>
				</div>

				<div class="flex justify-between">
					<span>Pending</span>
					<span>{currency.format(selectedWeek.pendingAllocated)}</span>
				</div>

				<div class="flex justify-between font-semibold">
					<span>Remaining</span>
					<span>{currency.format(selectedWeek.remaining)}</span>
				</div>
			</div>
		{:else}
			<div class="flex h-full items-center justify-center text-sm text-muted-foreground">
				Select a week on the calendar
			</div>
		{/if}
	</div>
</div>
