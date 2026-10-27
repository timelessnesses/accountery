<script lang="ts">
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import CalendarSync from '$lib/CalendarSync.svelte';
	import PaymentForm from '$lib/PaymentForm.svelte';
	import TransactionLog from '$lib/TransactionLog.svelte';
	import Lightbox from '$lib/Lightbox.svelte';
	import AppHeader from '$lib/AppHeader.svelte';
	import { currency, formatWeekRange, type AllocatedWeek } from '$lib/payments.svelte';
	import { page } from '$app/state';
	const shareMessages: Record<string, string> = {
		submitted: 'Payment submitted using the amount from your slip. It is awaiting review.',
		approved: 'Payment submitted and approved using your verified slip.',
		'missing-file': 'Share one payment slip image at a time.',
		'invalid-image': 'Share a PNG, JPEG, or WebP payment slip.',
		'too-large': 'Your slip image must be at most 10 MB.',
		'not-configured':
			'Automatic shared-slip submission requires SlipOK to be configured. You can submit the payment manually below.',
		'verification-unavailable':
			'Slip verification is unavailable or incorrect. No payment was submitted. Please try again.',
		'invalid-slip': 'The image could not be verified as a payment slip. No payment was submitted.',
		'invalid-amount': 'The slip did not contain a valid payment amount. No payment was submitted.',
		'wrong-recipient':
			'The slip could not be matched to the saved PromptPay recipient. No payment was submitted.',
		duplicate: 'This slip has already been submitted. Check your payment history.',
		'save-failed': 'The payment could not be saved. Please try again.'
	};
	const shareMessage = $derived(shareMessages[page.url.searchParams.get('share') ?? '']);

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
</script>

<div class="flex min-h-full flex-col bg-background">
	<!-- Header -->
	<AppHeader
		user={data.user}
		publicObligationsEnabled={data.publicObligationsEnabled}
		{totalPaid}
		{totalPending}
		{totalOwed}
	/>

	<!-- Body: transaction log + calendar + payment panel on wide screens -->
	{#if shareMessage}
		<div role="status" class="mx-auto mt-4 w-full max-w-7xl px-4 sm:px-6">
			<p class="rounded-xl border border-border bg-card px-4 py-3 text-sm text-card-foreground">
				{shareMessage}
			</p>
		</div>
	{/if}
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
			<div class="mb-3 px-1"><CalendarSync /></div>
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
						<p class="text-xs font-medium text-muted-foreground">Selected obligation</p>
						<button
							onclick={() => (selectedWeek = undefined)}
							class="text-xs text-muted-foreground hover:text-foreground"
							aria-label="Clear selection">Clear</button
						>
					</div>
					<p class="mt-1 text-sm font-semibold text-card-foreground">
						{formatWeekRange(selectedWeek.dayStart, selectedWeek.dayEnd)}
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
			<PaymentForm {selectedWeek} nextDue={data.nextDue} isAutomaticSlipCheckOn={data.isAutomaticSlipCheckOn} />
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
