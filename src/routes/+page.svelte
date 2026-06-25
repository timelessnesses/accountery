<script lang="ts">
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import PaymentForm from '$lib/PaymentForm.svelte';
	import TransactionLog from '$lib/TransactionLog.svelte';
	import Lightbox from '$lib/Lightbox.svelte';
	import { currency, formatWeekRange, type AllocatedWeek } from '$lib/payments.svelte';
	import { administrators } from '$lib/whitelisted.js';

	let { data } = $props();

	let selectedWeek = $state<AllocatedWeek | undefined>(undefined);
	// Mobile: which panel is shown via the bottom toolbar.
	let mobilePanel = $state<'calendar' | 'pay' | 'history'>('calendar');

	function handleSelect(w: AllocatedWeek) {
		selectedWeek = w;
		mobilePanel = 'pay';
	}

	const statusMeta = {
		paid: { label: 'Paid', dot: 'bg-success', text: 'text-success' },
		partial: { label: 'Partial', dot: 'bg-warning', text: 'text-warning' },
		unpaid: { label: 'Unpaid', dot: 'bg-danger', text: 'text-danger' },
		waiting_approval: { label: 'Waiting approval', dot: 'bg-info', text: 'text-info' }
	} as const;

	const totalPaid = $derived(
		[...data.transaction]
			.filter((tx) => tx.approved === 'approved')
			.reduce((sum, tx) => sum + tx.amount, 0)
	);
	const totalPending = $derived(
		[...data.transaction]
			.filter((tx) => tx.approved === 'pending')
			.reduce((sum, tx) => sum + tx.amount, 0)
	);
	const totalOwed = $derived(data.obligations.reduce((sum, ob) => sum + ob.amount, 0));
	const adminDisabled = $derived(
		Object.keys(administrators).includes(data.user?.email.split('@')[0] ?? '') === false
	);
</script>

<div class="flex h-dvh flex-col bg-background">
	<!-- Header -->
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<div class="flex items-center gap-3">
				<div
					class="flex h-15 w-15 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<svg
						width="100"
						height="100"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						><rect x="3" y="4" width="18" height="18" rx="2" /><path
							d="M3 10h18M8 2v4m8-4v4"
						/></svg
					>
				</div>
				<div>
					<h1 class="text-sm font-semibold leading-tight text-card-foreground">Weekly Payments</h1>
					<p class="text-xs text-muted-foreground">Track and clear your weekly obligations</p>
				</div>
			</div>
			<div class="hidden items-center gap-6 sm:flex">
				<div class="text-right">
					{#if totalPaid < totalOwed}
						<p class="text-xl text-muted-foreground">Net Balance</p>
						<p class="text-sm font-bold text-red-500">{currency.format(totalPaid - totalOwed)}</p>
					{:else}
						<p class="text-xl text-muted-foreground">Net Balance</p>
						<p class="text-sm font-bold text-success">{currency.format(totalPaid - totalOwed)}</p>
					{/if}
					<p class="text-xs text-muted-foreground">&nbsp;</p>
				</div>
				<div class="text-right">
					<p class="text-xs text-muted-foreground">Paid</p>
					<p class="text-sm font-semibold text-success">{currency.format(totalPaid)}</p>
					<p class="text-xs text-muted-foreground">+ {currency.format(totalPending)}</p>
				</div>
				<div class="text-right">
					<p class="text-xs text-muted-foreground">Owed</p>
					<p class="text-sm font-semibold text-foreground">{currency.format(totalOwed)}</p>
					<p class="text-xs text-muted-foreground">&nbsp;</p>
				</div>
				<button
					onclick={() => (window.location.href = '/admin')}
					class="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					style={adminDisabled ? 'visibility: hidden; pointer-events: none; opacity: 0.5;' : ''}
					disabled={adminDisabled}
				>
					Adminstrator Access
				</button>
			</div>
		</div>
	</header>

	<!-- Body: transaction log + calendar + payment panel on wide screens -->
	<main class="mx-auto flex w-full max-w-7xl flex-1 gap-6 overflow-hidden p-4 sm:px-6 sm:py-6">
		<!-- Transaction log (left of calendar on wide screens, History tab on mobile) -->
		<aside
			class="min-h-0 w-full shrink-0 lg:block lg:w-[240px] {mobilePanel === 'history'
				? 'block'
				: 'hidden'}"
		>
			<TransactionLog transactions={data.transaction} />
		</aside>

		<!-- Calendar panel -->
		<section
			class="min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-3 sm:p-4 {mobilePanel ===
			'calendar'
				? 'flex'
				: 'hidden'} lg:flex"
		>
			<div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
				{#each ['paid', 'partial', 'unpaid'] as const as s (s)}
					<div class="flex items-center gap-1.5">
						<span class="h-2.5 w-2.5 rounded-full {statusMeta[s].dot}"></span>
						<span class="text-xs text-muted-foreground">{statusMeta[s].label}</span>
					</div>
				{/each}
			</div>
			<div class="min-h-0 flex-1">
				<PaymentCalendar weeks={data.allocatedWeeks} onselect={handleSelect} />
			</div>
		</section>

		<!-- Payment panel -->
		<aside
			class="min-h-0 w-full flex-col overflow-y-auto lg:w-[360px] lg:shrink-0 {mobilePanel === 'pay'
				? 'flex'
				: 'hidden'} lg:flex"
		>
			{#if selectedWeek}
				{@const meta = statusMeta[selectedWeek.status]}
				<div class="mb-4 rounded-xl border border-border bg-card p-4">
					<div class="flex items-center justify-between">
						<p class="text-xs font-medium text-muted-foreground">Selected week</p>
						<button
							onclick={() => (selectedWeek = undefined)}
							class="text-xs text-muted-foreground hover:text-foreground"
							aria-label="Clear selection">Clear</button
						>
					</div>
					<p class="mt-1 text-sm font-semibold text-card-foreground">
						{formatWeekRange(selectedWeek.weekStart)}
					</p>
					<div class="mt-3 flex items-center gap-2">
						<span class="h-2 w-2 rounded-full {meta.dot}"></span>
						<span class="text-xs font-medium {meta.text}">{meta.label}</span>
						<span class="ml-auto text-xs text-muted-foreground">
							{currency.format(selectedWeek.allocated) +
								(selectedWeek.status === 'waiting_approval'
									? ' + ' + currency.format(selectedWeek.pendingAllocated)
									: '')} / {currency.format(selectedWeek.cost)}
						</span>
					</div>
				</div>
			{/if}
			<PaymentForm {selectedWeek} nextDue={data.nextDue} />
		</aside>
	</main>

	<!-- Mobile bottom toolbar -->
	<nav class="flex shrink-0 border-t border-border bg-card lg:hidden" aria-label="Panel switcher">
		<button
			onclick={() => (mobilePanel = 'calendar')}
			class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium {mobilePanel ===
			'calendar'
				? 'text-primary'
				: 'text-muted-foreground'}"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4m8-4v4" /></svg
			>
			Calendar
		</button>
		<button
			onclick={() => (mobilePanel = 'history')}
			class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium {mobilePanel ===
			'history'
				? 'text-primary'
				: 'text-muted-foreground'}"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg
			>
			History
		</button>
		<button
			onclick={() => (mobilePanel = 'pay')}
			class="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium {mobilePanel ===
			'pay'
				? 'text-primary'
				: 'text-muted-foreground'}"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
				><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg
			>
			Pay
		</button>
	</nav>
</div>

<Lightbox />
