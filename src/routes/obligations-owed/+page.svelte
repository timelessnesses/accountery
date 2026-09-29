<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import { currency } from '$lib/payments.svelte';
	import Sun from '@tabler/icons-svelte/icons/sun';
	import Moon from '@tabler/icons-svelte/icons/moon';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let search = $state('');
	let pendingOnly = $state(false);
	let sort = $state('owed');
	let refreshing = $state(false);
	let refreshError = $state('');
	let dark = $state(false);
	const totalOwed = $derived(data.balances.reduce((sum, row) => sum + row.owed, 0));
	const totalPending = $derived(data.balances.reduce((sum, row) => sum + row.pending, 0));
	const peoplePending = $derived(data.balances.filter((row) => row.pendingCount > 0).length);
	const rows = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase();
		const result = data.balances.filter(
			(row) =>
				(!pendingOnly || row.pendingCount > 0) &&
				(!query || `${row.name} ${row.nickname}`.toLocaleLowerCase().includes(query))
		);
		return sort === 'name' ? result.toSorted((a, b) => a.name.localeCompare(b.name)) : result;
	});
	onMount(() => {
		dark = localStorage.getItem('theme') === 'dark';
		document.documentElement.classList.toggle('dark', dark);
	});
	function toggleTheme() {
		dark = !dark;
		localStorage.setItem('theme', dark ? 'dark' : 'light');
		document.documentElement.classList.toggle('dark', dark);
	}
	async function refresh() {
		refreshing = true;
		refreshError = '';
		try {
			await invalidateAll();
		} catch {
			refreshError = 'Unable to refresh balances. Please try again.';
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Obligations Owed: Public Database</title>
	<meta name="robots" content="noindex, noarchive" />
</svelte:head>

<div class="owed-page min-h-full bg-background">
	<header class="border-b border-border bg-card">
		<div
			class="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"
		>
			<div class="flex min-w-0 items-center gap-3">
				<div
					class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"
					aria-hidden="true"
				>
					<svg
						viewBox="0 0 24 24"
						class="size-7"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						><rect x="3" y="4" width="18" height="18" rx="2" /><path
							d="M3 10h18M8 2v4m8-4v4M7 14h4m-4 4h8"
						/></svg
					>
				</div>
				<div>
					<h1>Obligations Owed: Public Database</h1>
					<p class="mt-1 text-xs text-muted-foreground">Weekly Payments · Outstanding balances</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={toggleTheme}
					aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
					>{#if dark}<Sun class="size-4" />{:else}<Moon class="size-4" />{/if}</Button
				>
				<Button variant="outline" size="sm" href={resolve('/')}>My payments</Button>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full min-w-0 max-w-7xl space-y-6 p-4 sm:p-6">
		<section class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Outstanding balance summary">
			<div class="summary-card col-span-2 sm:col-span-1">
				<p class="text-xs text-muted-foreground">Total outstanding</p>
				<p class="summary-value text-danger">{currency.format(totalOwed)}</p>
				<p class="text-xs text-muted-foreground">Before pending payments are approved</p>
			</div>
			<div class="summary-card">
				<p class="text-xs text-muted-foreground">People with a balance</p>
				<p class="summary-value">{data.balances.length}</p>
				<p class="text-xs text-muted-foreground">With unpaid obligations</p>
			</div>
			<div class="summary-card">
				<p class="text-xs text-muted-foreground">Waiting for approval</p>
				<p class="summary-value text-info">{currency.format(totalPending)}</p>
				<p class="text-xs text-muted-foreground">
					From {peoplePending}
					{peoplePending === 1 ? 'person' : 'people'} with a balance
				</p>
			</div>
		</section>
		<section
			class="overflow-hidden rounded-xl border border-border bg-card"
			aria-label="People who owe obligations"
		>
			<div class="space-y-4 border-b border-border p-4 sm:p-5">
				<div class="flex flex-wrap items-start justify-between gap-3">
					<div>
						<h2>Outstanding obligations</h2>
						<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
							Amounts owed include all assigned obligations, less approved payments. Pending
							transactions stay separate until approved.
						</p>
					</div>
					<Button variant="outline" size="sm" disabled={refreshing} onclick={refresh}
						>{refreshing ? 'Refreshing…' : 'Refresh'}</Button
					>
				</div>
				{#if refreshError}<p role="alert" class="text-sm text-danger">{refreshError}</p>{/if}
				<div class="flex flex-wrap items-end gap-3">
					<label class="min-w-0 flex-1 space-y-1 text-xs font-medium"
						><span>Search by name or nickname</span><input
							type="search"
							bind:value={search}
							placeholder="Find someone…"
							class="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
						/></label
					>
					<label class="space-y-1 text-xs font-medium"
						><span>Sort by</span><select
							bind:value={sort}
							class="mt-1 block rounded-lg border border-border bg-background px-3 py-2 text-sm"
							><option value="owed">Most owed</option><option value="name">Name</option></select
						></label
					>
				</div>
				<div class="flex flex-wrap gap-2">
					<Button
						size="sm"
						variant={pendingOnly ? 'outline' : 'default'}
						aria-pressed={!pendingOnly}
						onclick={() => (pendingOnly = false)}>All owing ({data.balances.length})</Button
					>
					<Button
						size="sm"
						variant={pendingOnly ? 'default' : 'outline'}
						aria-pressed={pendingOnly}
						onclick={() => (pendingOnly = true)}>With pending payments ({peoplePending})</Button
					>
				</div>
			</div>
			<Table.Root class="table-fixed">
				<Table.Caption class="sr-only"
					>Outstanding balances and pending payment totals by person</Table.Caption
				>
				<Table.Header
					><Table.Row
						><Table.Head class="w-[55%] pl-4 sm:pl-5">Person</Table.Head><Table.Head
							class="text-right pr-4 sm:pr-5">Amount owed</Table.Head
						></Table.Row
					></Table.Header
				>
				<Table.Body>
					{#each rows as row (row.name)}
						<Table.Row class={row.pendingCount > 0 ? 'border-b-0' : ''}>
							<Table.Cell class="pl-4 py-4 sm:pl-5"
								><p class="break-words font-semibold">{row.name}</p>
								{#if row.nickname}<p class="mt-1 break-words text-xs text-muted-foreground">
										{row.nickname}
									</p>{/if}</Table.Cell
							>
							<Table.Cell class="pr-4 text-right font-semibold tabular-nums text-danger sm:pr-5"
								>{currency.format(row.owed)}</Table.Cell
							>
						</Table.Row>
						{#if row.pendingCount > 0}
							<Table.Row class="bg-info/5"
								><Table.Cell colspan={2} class="px-4 pb-4 pt-2 sm:px-5">
									<div
										class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-l-2 border-info/40 pl-3 text-xs text-info"
									>
										<span
											>{row.pendingCount} pending {row.pendingCount === 1
												? 'transaction'
												: 'transactions'} · waiting for approval</span
										><span class="font-semibold tabular-nums">{currency.format(row.pending)}</span>
									</div>
									<p class="mt-2 pl-3 text-xs text-muted-foreground">
										Amount remaining if approved: {currency.format(
											Math.max(row.owed - row.pending, 0)
										)}
									</p>
								</Table.Cell></Table.Row
							>
						{/if}
					{:else}
						<Table.Row
							><Table.Cell colspan={2} class="px-4 py-12 text-center text-muted-foreground"
								>{data.balances.length === 0
									? 'Everyone is up to date. No outstanding obligations.'
									: 'No people match these filters.'}</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
			<div
				class="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5"
				aria-live="polite"
			>
				Showing {rows.length} of {data.balances.length} people with outstanding balances.
			</div>
		</section>
	</main>
</div>

<style>
	.owed-page h1 {
		margin: 0;
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.4;
	}
	.owed-page h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 650;
	}
	.owed-page p {
		margin-bottom: 0;
	}
	.owed-page :global([data-slot='button']) {
		border-radius: 0.5rem;
		text-decoration: none;
	}
	.owed-page :global(th:last-child) {
		text-align: right;
	}
	.owed-page :global(td) {
		white-space: normal;
	}
	.summary-card {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-card);
		padding: 1rem;
	}
	.summary-value {
		margin: 0.5rem 0;
		font-size: clamp(1.1rem, 3vw, 1.75rem);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
</style>
