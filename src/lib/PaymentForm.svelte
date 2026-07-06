<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { currency, type AllocatedWeek } from './payments.svelte';
	import { lightbox } from './LightboxManager.svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';

	// Replace this with your own payment QR image URL.
	const QR_SRC = '/cropped-qr.jpg';

	let { selectedWeek, nextDue }: { selectedWeek?: AllocatedWeek; nextDue?: AllocatedWeek } =
		$props();

	let amount = $state<number | null>(null);
	let note = $state('Paying Obligation');
	let proof = $state<string | undefined>(undefined);
	let proofName = $state('');
	let submitting = $state(false);
	let justSaved = $state(false);

	// Prefill amount with what's needed to clear the next due / selected week.
	onMount(() => {
		const target = selectedWeek ?? nextDue;
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
			const response = await fetch('/api/payments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ amount, note: note.trim() || undefined, proof })
			});

			if (!response.ok) {
				fetch(`/api/auth/verify-user`, { method: 'GET' }).then((res) => {
					if (!res.ok) {
						goto(resolve('/login'));
					}
				});
				throw new Error('Payment save failed');
			}

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

	const target = $derived(selectedWeek ?? nextDue);
</script>

<div class="flex flex-col gap-5">
	<!-- QR -->
	<div class="rounded-xl border border-border bg-card p-5">
		<div class="flex items-center justify-between">
			<h3 class="text-sm font-semibold text-card-foreground">Scan to pay</h3>
			{#if target}
				<span class="text-xs font-medium text-muted-foreground">
					{currency.format(target.remaining)} due
				</span>
			{/if}
		</div>
		<div class="mt-4 flex flex-col items-center gap-3">
			<button
				type="button"
				onclick={() => lightbox.open(QR_SRC, 'Payment QR code')}
				class="flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted transition hover:border-primary"
				aria-label="Enlarge payment QR code"
			>
				<img
					src={QR_SRC}
					alt="Payment QR code"
					class="h-full w-full object-contain"
					onerror={(e) => ((e.currentTarget as HTMLImageElement).style.opacity = '0.25')}
				/>
			</button>
			<p class="text-center text-xs leading-relaxed text-muted-foreground text-balance">
				Tap the code to enlarge, scan it with your banking app, then upload your receipt below.
			</p>
			<p class="text-center text-xs leading-relaxed text-muted-foreground text-balance">
				Bank: Kasikorn Bank<br />
				Account Number: 233-2-85069-8<br />
				Name: MR. TUKKAPOL PONGPUNNAMAI / นาย ตรรกพล พงศ์พรรณมัย
			</p>
		</div>
	</div>

	<!-- Submit proof -->
	<form class="rounded-xl border border-border bg-card p-5" onsubmit={submit}>
		<h3 class="text-sm font-semibold text-card-foreground">Record a payment</h3>

		<div class="mt-4 flex flex-col gap-4">
			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium text-muted-foreground">Amount</span>
				<div class="relative">
					<span
						class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
						>฿</span
					>
					<input
						type="number"
						min="0"
						step="0.01"
						bind:value={amount}
						placeholder="0.00"
						required
						class="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
					/>
				</div>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-xs font-medium text-muted-foreground">Note</span>
				<input
					type="text"
					bind:value={note}
					placeholder="Paying Obligation"
					required
					class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
				/>
			</label>

			<div class="flex flex-col gap-1.5">
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
						class="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-background px-3 py-4 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary"
					>
						<input
							type="file"
							accept="image/*"
							capture="environment"
							class="hidden"
							required
							onchange={onFile}
						/>
						Upload a screenshot or photo
					</label>
				{/if}
			</div>

			<button
				type="submit"
				disabled={submitting || !amount || !note.trim() || !proof}
				class="mt-1 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{justSaved ? 'Payment recorded' : 'Submit payment'}
			</button>
			{#if justSaved}
				<p class="text-center text-xs font-medium text-success">
					Calendar updated with your payment.
				</p>
			{/if}
		</div>
	</form>
</div>
