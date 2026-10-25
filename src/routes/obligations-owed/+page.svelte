<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/button/button.svelte';
	import { currency } from '$lib/payments.svelte';
	import Sun from '@tabler/icons-svelte/icons/sun';
	import Moon from '@tabler/icons-svelte/icons/moon';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
	let refreshing = $state(false);
	let refreshError = $state('');
	let dark = $state(false);
	const completion = $derived(
		data.summary.totalObligations === 0
			? 0
			: Math.round((data.summary.fulfilledObligations / data.summary.totalObligations) * 100)
	);

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
			refreshError = 'Unable to refresh the summary. Please try again.';
		} finally {
			refreshing = false;
		}
	}
</script>

<svelte:head>
	<title>Public payment summary · Weekly Payments</title>
	<meta name="robots" content="noindex, noarchive" />
</svelte:head>

<div class="summary-page min-h-full bg-background text-foreground">
	<header class="border-b border-border bg-card">
		<div
			class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"
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
					>
						<rect x="3" y="4" width="18" height="18" rx="2" />
						<path d="M3 10h18M8 2v4m8-4v4M7 14h4m-4 4h8" />
					</svg>
				</div>
				<div>
					<h1>Public payment summary</h1>
					<p class="mt-1 text-xs text-muted-foreground">Weekly Payments · Aggregate statistics</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					onclick={toggleTheme}
					aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
				>
					{#if dark}<Sun class="size-4" />{:else}<Moon class="size-4" />{/if}
				</Button>
				<Button variant="outline" size="sm" href={resolve('/')}>My payments</Button>
			</div>
		</div>
	</header>
	<main class="mx-auto w-full min-w-0 max-w-6xl space-y-6 p-4 sm:p-6">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2>Payment overview</h2>
				<p class="mt-1 max-w-2xl text-sm text-muted-foreground">
					Combined totals across assigned obligations. No names, account details, or individual
					balances are published.
				</p>
			</div>
			<Button variant="outline" size="sm" disabled={refreshing} onclick={refresh}
				>{refreshing ? 'Refreshing…' : 'Refresh'}</Button
			>
		</div>
		{#if refreshError}<p role="alert" class="text-sm text-danger">{refreshError}</p>{/if}

		<section
			class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
			aria-label="Payment statistics"
			aria-busy={refreshing}
		>
			<div class="summary-card">
				<h3>Unpaid amount</h3>
				<p class="summary-value text-danger">{currency.format(data.summary.outstandingAmount)}</p>
				<p class="text-xs text-muted-foreground">Total still owed after approved payments.</p>
			</div>
			<div class="summary-card">
				<h3>Obligations unfulfilled</h3>
				<p class="summary-value">{data.summary.unfulfilledObligations}</p>
				<p class="text-xs text-muted-foreground">
					Individual assigned obligations with an unpaid balance.
				</p>
			</div>
			<div class="summary-card">
				<h3>Students with unpaid obligations</h3>
				<p class="summary-value">{data.summary.studentsWithUnpaidObligations}</p>
				<p class="text-xs text-muted-foreground">
					Includes partial payments and payments awaiting approval.
				</p>
			</div>
			<div class="summary-card">
				<h3>Awaiting approval</h3>
				<p class="summary-value text-info">{currency.format(data.summary.pendingAmount)}</p>
				<p class="text-xs text-muted-foreground">
					Pending payments that would cover unpaid obligations.
				</p>
			</div>
		</section>

		<section
			class="rounded-xl border border-border bg-card p-4 sm:p-5"
			aria-label="Obligation completion"
		>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2>Obligation completion</h2>
					<p class="mt-1 text-sm text-muted-foreground">
						{data.summary.fulfilledObligations} of {data.summary.totalObligations} assigned obligations
						are fully paid.
					</p>
				</div>
				{#if data.summary.totalObligations > 0}<span
						class="text-2xl font-semibold tabular-nums text-success">{completion}%</span
					>{/if}
			</div>
			{#if data.summary.totalObligations > 0}
				<progress
					class="completion-progress mt-4"
					max={data.summary.totalObligations}
					value={data.summary.fulfilledObligations}
					aria-label="Assigned obligations fully paid">{completion}%</progress
				>
			{/if}
			{#if data.summary.totalObligations === 0}
				<p class="mt-4 text-sm text-muted-foreground">No obligations to report.</p>
			{:else if data.summary.unfulfilledObligations === 0}
				<p class="mt-4 text-sm font-medium text-success">
					Everyone is up to date. No outstanding obligations.
				</p>
			{/if}
			<div class="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
				<p>
					Pending payments are counted as paid only after approval. If all pending payments are
					approved, the remaining unpaid amount would be <strong
						class="font-semibold text-foreground"
						>{currency.format(data.summary.remainingAfterPending)}</strong
					>.
				</p>
				<p class="mt-2 text-xs">
					Each student's assigned obligations are counted separately. Partial payments remain
					unfulfilled until fully paid. Approved payments cover the oldest obligations first.
				</p>
			</div>
		</section>
	</main>
</div>

<style>
	.summary-page h1,
	.summary-page h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 650;
		line-height: 1.4;
	}
	.summary-page p {
		margin-bottom: 0;
	}
	.summary-page :global([data-slot='button']) {
		border-radius: 0.5rem;
		text-decoration: none;
	}
	.summary-card {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-card);
		padding: 1.25rem;
	}
	.summary-card h3 {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.5;
		color: var(--color-muted-foreground);
	}
	.summary-card .summary-value {
		margin: 0.75rem 0;
		font-size: clamp(1.5rem, 3vw, 2rem);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
	.completion-progress {
		display: block;
		width: 100%;
		height: 0.625rem;
		overflow: hidden;
		border: 0;
		border-radius: 999px;
		background: var(--color-muted);
		color: var(--color-success);
	}
	.completion-progress::-webkit-progress-bar {
		background: var(--color-muted);
		border-radius: 999px;
	}
	.completion-progress::-webkit-progress-value {
		background: var(--color-success);
		border-radius: 999px;
	}
	.completion-progress::-moz-progress-bar {
		background: var(--color-success);
		border-radius: 999px;
	}
</style>
