<script lang="ts">
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import PaymentForm from '$lib/PaymentForm.svelte';
	import TransactionLog from '$lib/TransactionLog.svelte';
	import Lightbox from '$lib/Lightbox.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { currency, formatWeekRange, type AllocatedWeek } from '$lib/payments.svelte';
	import Sun from '@tabler/icons-svelte/icons/sun';
	import Moon from '@tabler/icons-svelte/icons/moon';

	let { data } = $props();

	let selectedWeek = $state<AllocatedWeek | undefined>(undefined);
	let accountMenuOpen = $state(false);
	let signingOut = $state(false);
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
	const userFirstName = $derived(
		(data.user?.name ?? data.user?.email ?? 'Account').trim().split(/\s+/)[0] || 'Account'
	);
	const adminDisabled = $derived(
		!data.user?.admin
	);
	async function handleLogout() {
		if (signingOut) return;
		signingOut = true;
		try {
			const response = await fetch('/api/auth/logout', { method: 'POST' });
			if (!response.ok) {
				throw new Error('Failed to log out');
			}
			accountMenuOpen = false;
			await goto(resolve('/login'));
		} catch (error) {
			console.error('Logout failed:', error);
			accountMenuOpen = false;
			window.location.href = '/login';
		} finally {
			signingOut = false;
		}
	}
	let theme = $state('light');

	$effect(() => {
		if (localStorage.getItem('theme') === 'dark') {
			document.documentElement.classList.add('dark');
			theme = 'dark';
		} else {
			document.documentElement.classList.remove('dark');
			theme = 'light';
		}
	});

</script>

<div class="flex min-h-full flex-col bg-background">
	<!-- Header -->
	<header class="border-b border-border bg-card">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6"
		>
			<div class="flex items-start justify-between gap-3 sm:items-center sm:justify-start">
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
						<h1 class="text-sm font-semibold leading-tight text-card-foreground">
							Weekly Payments
						</h1>
						<p class="text-xs text-muted-foreground">Track and clear your weekly obligations</p>
					</div>
				</div>
				<div class="relative sm:hidden">
					<button
						onclick={() => (accountMenuOpen = !accountMenuOpen)}
						class="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm transition hover:bg-muted"
						aria-expanded={accountMenuOpen}
						aria-haspopup="menu"
						aria-label="Open account menu"
					>
						<svg
							class="size-5 transition-transform {accountMenuOpen ? 'rotate-180' : ''}"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
							<path d="M4 20a8 8 0 0 1 16 0" />
						</svg>
					</button>
					{#if accountMenuOpen}
						<div
							class="absolute right-0 z-20 mt-2 w-64 rounded-3xl border border-border bg-card p-2 shadow-xl"
						>
							<div class="rounded-2xl bg-muted px-3 py-2 text-center">
								<p class="m-0 truncate text-base font-semibold text-card-foreground">
									{data.user?.name}
								</p>
								<p class="m-0 truncate text-xs text-muted-foreground">{data.user?.email}</p>
							</div>
							<button
								onclick={() => {
									localStorage.setItem(
										'theme',
										localStorage.getItem('theme') === 'dark' ? 'light' : 'dark'
									);
									document.documentElement.classList.toggle(localStorage.getItem('theme') === 'dark' ? 'dark' : "");
									theme = localStorage.getItem('theme') as string;
								}}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
								style={adminDisabled ? 'display: none;' : ''}
								disabled={adminDisabled}
							>
								<span>Change Theme</span>
								{#if theme === 'dark'}
									<Sun class="size-4" />
								{:else}
									<Moon class="size-4" />
								{/if}
							</button>
							<button
								onclick={() => (window.location.href = '/admin')}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive disabled:cursor-wait disabled:opacity-60 transition hover:bg-muted"
								style={adminDisabled ? 'display: none;' : ''}
								disabled={adminDisabled}
							>
								<span>Administrator Access</span>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12h14" />
									<path d="m12 5 7 7-7 7" />
								</svg>
							</button>
							<button
								onclick={handleLogout}
								disabled={signingOut}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive disabled:cursor-wait disabled:opacity-60 transition hover:bg-muted"
							>
								<span>{signingOut ? 'Logging out...' : 'Logout'}</span>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M10 17l5-5-5-5" />
									<path d="M15 12H3" />
									<path d="M21 3v18" />
								</svg>
							</button>
						</div>
					{/if}
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
				<div class="relative">
					<button
						onclick={() => (accountMenuOpen = !accountMenuOpen)}
						class="hidden items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-left shadow-sm transition hover:bg-muted sm:flex"
						aria-expanded={accountMenuOpen}
						aria-haspopup="menu"
					>
						<div class="min-w-0 flex-1 text-right leading-none">
							<p class="m-0 max-w-[160px] truncate text-sm font-semibold text-foreground">
								{userFirstName}
							</p>
						</div>
						<svg
							class="size-4 shrink-0 text-muted-foreground transition-transform {accountMenuOpen
								? 'rotate-180'
								: ''}"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
							<path d="M4 20a8 8 0 0 1 16 0" />
						</svg>
					</button>
					{#if accountMenuOpen}
						<div
							class="absolute right-0 z-20 mt-2 w-64 rounded-3xl border border-border bg-card p-2 shadow-xl"
						>
							<div class="rounded-2xl bg-muted px-3 py-2 text-center">
								<p class="truncate text-base font-semibold text-card-foreground">
									{data.user?.name}
								</p>
								<p class="truncate text-xs text-muted-foreground">{data.user?.email}</p>
							</div>
							<button
								onclick={() => {
									localStorage.setItem(
										'theme',
										localStorage.getItem('theme') === 'dark' ? 'light' : 'dark'
									);
									if (localStorage.getItem('theme') === 'dark') {
										document.documentElement.classList.add('dark');
									} else {
										document.documentElement.classList.remove('dark');
									}
									theme = localStorage.getItem('theme') as string;
								}}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
								style={adminDisabled ? 'display: none;' : ''}
								disabled={adminDisabled}
							>
								<span>Change Theme</span>
								{#if theme === 'dark'}
									<Sun class="size-4" />
								{:else}
									<Moon class="size-4" />
								{/if}
							</button>
							<button
								onclick={() => (window.location.href = '/admin')}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted"
								style={adminDisabled ? 'display: none;' : ''}
								disabled={adminDisabled}
							>
								<span>Administrator Access</span>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M5 12h14" />
									<path d="m12 5 7 7-7 7" />
								</svg>
							</button>
							<button
								onclick={handleLogout}
								disabled={signingOut}
								class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
							>
								<span>{signingOut ? 'Logging out...' : 'Logout'}</span>
								<svg
									class="size-4"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M10 17l5-5-5-5" />
									<path d="M15 12H3" />
									<path d="M21 3v18" />
								</svg>
							</button>
						</div>
					{/if}
				</div>
			</div>
			<div class="mt-2 grid grid-cols-3 gap-2 sm:hidden" style="margin-bottom: 0 !important;">
				<div class="rounded-2xl border border-border bg-background px-2 py-2 text-center shadow-sm">
					<p
						class="text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
						style="margin-bottom: 0 !important;"
					>
						Net
					</p>
					{#if totalPaid < totalOwed}
						<p
							class="text-xs font-bold leading-tight text-red-500"
							style="margin-bottom: 0 !important;"
						>
							{currency.format(totalPaid - totalOwed)}
						</p>
					{:else}
						<p
							class="text-xs font-bold leading-tight text-success"
							style="margin-bottom: 0 !important;"
						>
							{currency.format(totalPaid - totalOwed)}
						</p>
					{/if}
				</div>
				<div class="rounded-2xl border border-border bg-background px-2 py-2 text-center shadow-sm">
					<p
						class="text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
						style="margin-bottom: 0 !important;"
					>
						Paid
					</p>
					<p
						class="text-xs font-semibold leading-tight text-success"
						style="margin-bottom: 0 !important;"
					>
						{currency.format(totalPaid)}
					</p>
					<p
						class="text-[9px] leading-tight text-muted-foreground"
						style="margin-bottom: 0 !important;"
					>
						+ {currency.format(totalPending)}
					</p>
				</div>
				<div class="rounded-2xl border border-border bg-background px-2 py-2 text-center shadow-sm">
					<p
						class="text-[9px] uppercase tracking-[0.12em] text-muted-foreground"
						style="margin-bottom: 0 !important;"
					>
						Owed
					</p>
					<p
						class="text-xs font-semibold leading-tight text-foreground"
						style="margin-bottom: 0 !important;"
					>
						{currency.format(totalOwed)}
					</p>
				</div>
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
