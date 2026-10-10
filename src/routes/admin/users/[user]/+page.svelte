<script lang="ts">
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import { page } from '$app/state';
	import { auditFocus } from '$lib/auditFocus';
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import TransactionLog from '$lib/TransactionLog.svelte';
	import UserDeparture from '$lib/UserDeparture.svelte';
	import { formatWeekRange, currency, type AllocatedWeek } from '$lib/payments.svelte';

	const { data } = $props();

	let selectedWeekId = $state<string>();
	const selectedWeek = $derived(data.allocatedWeeks.find((week) => week.id === selectedWeekId));

	function handleSelect(week: AllocatedWeek) {
		selectedWeekId = week.id;
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

	const info = $derived(data.user);
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

<main class="admin-page">
	<div
		tabindex="-1"
		class="rounded-lg"
		data-audit-highlight={page.url.searchParams.has('fromLog') ? '' : undefined}
		use:auditFocus={page.url.searchParams.has('fromLog')}
	>
		<AdminPageHeader title={info.name} description={info.email}>
			<UserDeparture user={data.user} />
		</AdminPageHeader>
	</div>
	<dl class="grid grid-cols-2 gap-3 lg:grid-cols-4">
		<div class="admin-panel admin-stat">
			<dt>Approved payments</dt>
			<dd>{currency.format(totalPaid)}</dd>
		</div>
		<div class="admin-panel admin-stat">
			<dt>Pending approval</dt>
			<dd>{currency.format(totalPending)}</dd>
		</div>
		<div class="admin-panel admin-stat">
			<dt>Total owed</dt>
			<dd>{currency.format(totalOwed)}</dd>
		</div>
		<div class="admin-panel admin-stat">
			<dt>Net balance</dt>
			<dd class={totalPaid - totalOwed < 0 ? 'text-danger' : 'text-success'}>
				{currency.format(totalPaid - totalOwed)}
			</dd>
		</div>
	</dl>
	<div class="grid min-w-0 items-start gap-6 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
		<!-- Transaction history -->
		<div class="min-h-0 min-w-0">
			<TransactionLog transactions={data.allTransactionsFromUser} />
		</div>

		<!-- Calendar -->
		<div class="admin-panel">
			<PaymentCalendar weeks={data.allocatedWeeks} onselect={handleSelect} fitContent />
		</div>

		<!-- Details -->
		<div class="admin-panel">
			{#if selectedWeek}
				{@const meta = statusMeta[selectedWeek.status]}

				<p class="text-xs text-muted-foreground">Selected obligation</p>

				<p class="mt-1 font-semibold">
					{formatWeekRange(selectedWeek.dayStart, selectedWeek.dayEnd)}
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
</main>
