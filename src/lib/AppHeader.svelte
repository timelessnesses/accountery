<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { currency } from '$lib/payments.svelte';
	import Sun from '@tabler/icons-svelte/icons/sun';
	import Moon from '@tabler/icons-svelte/icons/moon';
	let {
		user,
		publicObligationsEnabled = false,
		totalPaid = 0,
		totalPending = 0,
		totalOwed = 0,
		showBalances = true,
		admin = false
	}: {
		user: App.Locals['user'];
		publicObligationsEnabled?: boolean;
		totalPaid?: number;
		totalPending?: number;
		totalOwed?: number;
		showBalances?: boolean;
		admin?: boolean;
	} = $props();
	let accountMenuOpen = $state(false);
	let signingOut = $state(false);
	afterNavigate(() => {
		accountMenuOpen = false;
	});
	const userFirstName = $derived(
		(user?.name ?? user?.email ?? 'Account').trim().split(/\s+/)[0] || 'Account'
	);
	const adminDisabled = $derived(!user?.admin);
	async function handleLogout() {
		if (signingOut) return;
		signingOut = true;
		try {
			const response = await fetch('/api/auth/logout', { method: 'POST' });
			if (!response.ok) {
				fetch(`/api/auth/verify-user`, { method: 'GET' }).then((res) => {
					if (!res.ok) {
						goto(resolve('/login'));
					}
				});
				throw new Error('Failed to log out');
			}
			accountMenuOpen = false;
			await goto(resolve('/login'));
		} catch (error) {
			console.error('Logout failed:', error);
			accountMenuOpen = false;
			window.location.href = resolve('/login');
		} finally {
			signingOut = false;
		}
	}
	function toggleTheme() {
		theme = theme === 'dark' ? 'light' : 'dark';
		localStorage.setItem('theme', theme);
		document.documentElement.classList.toggle('dark', theme === 'dark');
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

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') accountMenuOpen = false;
	}}
/>
<header class="app-header border-b border-border bg-card">
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
						Weekly Payments{admin ? ': Admin page' : ''}
					</h1>
					<p class="text-xs text-muted-foreground">Track and clear your weekly obligations</p>
					{#if publicObligationsEnabled}
						<a
							href={resolve('/obligations-owed')}
							class="mt-1 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
							>Obligations Owed: Public Database</a
						>
					{/if}
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
								{user?.name}
							</p>
							<p class="m-0 truncate text-xs text-muted-foreground">{user?.email}</p>
						</div>
						<button
							onclick={toggleTheme}
							class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
						>
							<span>Change Theme</span>
							{#if theme === 'dark'}
								<Sun class="size-4" />
							{:else}
								<Moon class="size-4" />
							{/if}
						</button>
						<button
							onclick={() => {
								accountMenuOpen = false;
								void goto(resolve(admin ? '/' : '/admin'));
							}}
							class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive disabled:cursor-wait disabled:opacity-60 transition hover:bg-muted"
							style={adminDisabled ? 'display: none;' : ''}
							disabled={adminDisabled}
						>
							<span>{admin ? 'My payments' : 'Administrator Access'}</span>
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
			{#if showBalances}
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
			{/if}
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
								{user?.name}
							</p>
							<p class="truncate text-xs text-muted-foreground">{user?.email}</p>
						</div>
						<button
							onclick={toggleTheme}
							class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium text-destructive transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
						>
							<span>Change Theme</span>
							{#if theme === 'dark'}
								<Sun class="size-4" />
							{:else}
								<Moon class="size-4" />
							{/if}
						</button>
						<button
							onclick={() => {
								accountMenuOpen = false;
								void goto(resolve(admin ? '/' : '/admin'));
							}}
							class="mt-2 flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-sm font-medium transition hover:bg-muted"
							style={adminDisabled ? 'display: none;' : ''}
							disabled={adminDisabled}
						>
							<span>{admin ? 'My payments' : 'Administrator Access'}</span>
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
		{#if showBalances}
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
		{/if}
	</div>
</header>
