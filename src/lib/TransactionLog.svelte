<script lang="ts">
	import { currency } from '$lib/payments.svelte';
	import { lightbox } from '$lib/LightboxManager.svelte';
	import type { Transaction } from './types/AccountingDatabaseTypes';

	interface Props {
		transactions: Transaction[];
	}

	const { transactions }: Props = $props();

	// Newest first.
	const entries = $derived([...transactions].sort((a, b) => (b.date > a.date ? 1 : -1)));

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const statusClass = {
		approved: 'bg-success/10 text-success',
		pending: 'bg-warning/10 text-warning',
		rejected: 'bg-danger/10 text-danger'
	} as const;
</script>

<div class="flex h-full min-h-0 flex-col rounded-xl border border-border bg-card">
	<div class="flex items-center justify-between border-b border-border px-3 py-2.5">
		<h2 class="text-xs font-semibold text-card-foreground">Transaction log</h2>
		<span class="text-xs text-muted-foreground">{entries.length}</span>
	</div>

	{#if entries.length === 0}
		<p class="px-3 py-6 text-center text-xs text-muted-foreground">No payments yet.</p>
	{:else}
		<ul class="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
			{#each entries as p (p.id)}
				<li class="group flex items-start gap-2 px-3 py-2.5">
					<span
						class={'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' +
							statusClass[p.approved]}
						aria-hidden="true"
					>
						{#if p.approved === 'rejected'}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
							>
						{:else if p.approved === 'pending'}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg
							>
						{:else}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg
							>
						{/if}
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex items-baseline justify-between gap-2">
							<span
								class={'text-sm font-semibold tabular-nums text-card-foreground ' +
									(p.approved === 'approved'
										? 'text-success'
										: p.approved === 'pending'
											? 'text-warning'
											: 'text-danger')}>{currency.format(p.amount)}</span
							>
							<span
								class={'rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ' +
									statusClass[p.approved]}
							>
								{p.approved}
							</span>
						</div>
						<p class="truncate text-xs text-muted-foreground">{formatDate(p.date.toISOString())}</p>
						{#if p.description}
							<p class="truncate text-xs text-muted-foreground/80">{p.description}</p>
						{/if}
						{#if p.image}
							<button
								type="button"
								onclick={() =>
									lightbox.open(p.image!, `Bank slip for ${currency.format(p.amount)}`)}
								class="group/slip mt-1.5 flex items-center gap-2 rounded-md border border-border bg-background p-1 pr-2 transition hover:border-primary"
								aria-label="View bank slip for {currency.format(p.amount)}"
							>
								<img src={p.image} alt="Bank slip thumbnail" class="h-8 w-8 rounded object-cover" />
								<span
									class="text-xs font-medium text-muted-foreground group-hover/slip:text-primary"
									>View slip</span
								>
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
