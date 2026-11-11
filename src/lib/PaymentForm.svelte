<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { currency, type AllocatedWeek } from './payments.svelte';
	import { lightbox } from './LightboxManager.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	import PromptPayQr from '$lib/PromptPayQr.svelte';

	let {
		selectedWeek,
		nextDue,
		isAutomaticSlipCheckOn
	}: { selectedWeek?: AllocatedWeek; nextDue?: AllocatedWeek; isAutomaticSlipCheckOn?: boolean } =
		$props();

	let amount = $state<number | null>(null);
	let note = $state('Paying Obligation');
	let proof = $state<string | undefined>(undefined);
	let proofName = $state('');
	let submitting = $state(false);
	let justSaved = $state(false);
	let automaticallyApproved = $state(false);
	const target = $derived(selectedWeek?.status === 'exempt' ? nextDue : (selectedWeek ?? nextDue));

	// Prefill amount with what's needed to clear the next due / selected week.
	onMount(() => {
		if (target && amount === null) {
			amount = target.remaining;
		}
	});

	function onFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		proofName = file.name;
		const reader = new FileReader();
		reader.onload = () => {
			proof = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	function clearProof() {
		proof = undefined;
		proofName = '';
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!amount || amount <= 0) return;
		submitting = true;
		try {
			const response = await fetch(resolve('/api/payments'), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ amount, note: note.trim() || undefined, proof })
			});

			if (!response.ok) {
				fetch(resolve('/api/auth/verify-user'), { method: 'GET' }).then((res) => {
					if (!res.ok) {
						goto(resolve('/login'));
					}
				});
				throw new Error('Payment save failed');
			}
			const result = (await response.json()) as { automaticallyApproved?: boolean };
			automaticallyApproved = result.automaticallyApproved === true;

			amount = null;
			note = 'Paying Obligation';
			clearProof();
			justSaved = true;
			setTimeout(() => (justSaved = false), 2500);
			await invalidateAll();
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto">
	{#if selectedWeek?.status === 'exempt'}
		<div class="rounded-xl border border-border bg-card p-3" role="status">
			<h3 class="m-0! text-sm! font-semibold text-card-foreground">This obligation is exempt</h3>
			<p class="mt-1 text-sm text-muted-foreground">
				It is excluded from your balance and payment allocation. Any payment you submit applies to
				other obligations.
			</p>
		</div>
	{/if}
	<!-- QR -->
	<div class="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-3 max-[480px]:min-h-[120px]! max-[480px]:shrink-0 max-[480px]:p-2!">
		<div class="flex items-center justify-between">
			<h3 class="m-0! text-sm! font-semibold text-card-foreground">Scan to pay</h3>
			{#if target}
				<span class="text-xs font-medium text-muted-foreground max-[480px]:hidden">
					{currency.format(target.remaining)} due
				</span>
			{/if}
		</div>
		<div class="qr-area mt-3 flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 max-[480px]:mt-1! max-[480px]:min-h-[84px] max-[480px]:gap-1!">
			<PromptPayQr {amount} />
		</div>
	</div>

	<!-- Submit proof -->
	<form class="rounded-xl border border-border bg-card p-3 max-[480px]:p-2! max-[340px]:p-1!" onsubmit={submit}>
		<h3 class="m-0! text-sm! font-semibold text-card-foreground">Record a payment</h3>

		<div class="mt-3 flex flex-col gap-3 max-[480px]:mt-1.5! max-[480px]:grid max-[480px]:grid-cols-2 max-[480px]:gap-1.5! max-[340px]:mt-1! max-[340px]:gap-1!">
			<label class="flex min-w-0 flex-col gap-1.5 max-[480px]:gap-1 max-[340px]:gap-0.5">
				<span class="text-xs font-medium text-muted-foreground">Amount</span>
				<div class="relative">
					<span
						class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
						>฿</span
					>
					<!-- 16px+: iOS Safari auto-zooms into inputs smaller than 16px -->
					<input
						type="number"
						min="0.01"
						max="9999999999.99"
						step="0.01"
						bind:value={amount}
						placeholder="0.00"
						required
						class="w-full min-w-0 rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 max-[480px]:pr-2! max-[480px]:pl-7! max-[480px]:py-1.5! max-[340px]:py-1!"
					/>
				</div>
			</label>

			<label class="flex min-w-0 flex-col gap-1.5 max-[480px]:gap-1 max-[340px]:gap-0.5">
				<span class="text-xs font-medium text-muted-foreground">Note</span>
				<!-- 16px+: iOS Safari auto-zooms into inputs smaller than 16px -->
				<input
					type="text"
					bind:value={note}
					placeholder="Paying Obligation"
					required
					class="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 max-[480px]:px-2! max-[480px]:py-1.5! max-[340px]:py-1!"
				/>
			</label>

			<div class="flex min-w-0 flex-col gap-1.5 max-[480px]:col-span-2 max-[480px]:gap-1 max-[340px]:gap-0.5">
				<span class="text-xs font-medium text-muted-foreground">Proof of payment</span>
				{#if proof}
					<div class="flex items-center gap-3 rounded-lg border border-border bg-muted p-2">
						<button
							type="button"
							onclick={() => proof && lightbox.open(proof, 'Payment proof preview')}
							class="shrink-0 overflow-hidden rounded transition hover:opacity-80"
							aria-label="Enlarge payment proof"
						>
							<img src={proof} alt="Payment proof preview" class="h-14 w-14 object-cover" />
						</button>
						<span class="flex-1 truncate text-xs text-muted-foreground">{proofName}</span>
						<button
							type="button"
							onclick={clearProof}
							class="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-muted"
						>
							Remove
						</button>
					</div>
				{:else}
					<label
						class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-3 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary max-[480px]:py-1.5! max-[340px]:py-1!"
					>
						<input type="file" accept="image/*" class="hidden" required onchange={onFile} />
						Upload a screenshot or photo
					</label>
				{/if}
			</div>

			<button
				type="submit"
				disabled={submitting || !amount || !note.trim() || !proof}
				class="mt-1 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 max-[480px]:col-span-2 max-[480px]:mt-0 max-[480px]:py-1.5 max-[340px]:py-1"
			>
				{submitting
					? 'Submitting and checking payment…'
					: justSaved
						? automaticallyApproved
							? 'Payment approved'
							: 'Payment recorded'
						: 'Submit payment'}
			</button>
			{#if justSaved}
				<p class="text-center text-xs font-medium text-success max-[480px]:col-span-3">
					{automaticallyApproved
						? 'Slip verified and payment approved. Your balance has been updated.'
						: 'Payment saved and awaiting review.'}
				</p>
			{/if}
			{#if isAutomaticSlipCheckOn}
				<p class="text-center text-[10px] leading-tight font-medium text-success max-[480px]:col-span-3">
					Your bank slip will be forwarded to SlipOK for automatic verification. Please read the
					privacy policy and notice for details on how your data will be processed.
				</p>
			{/if}
		</div>
	</form>
</div>

<style>
	.qr-area {
		overflow: hidden;
	}
</style>
