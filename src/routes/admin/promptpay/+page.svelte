<script lang="ts">
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { auditFocus } from '$lib/auditFocus';
	import Button from '$lib/components/ui/button/button.svelte';
	import PromptPayQr from '$lib/PromptPayQr.svelte';
	import Lightbox from '$lib/Lightbox.svelte';
	import { parsePromptPayPayload, targetLabels, type PromptPayTarget } from '$lib/promptpay';
	let { data, form } = $props();
	let payload = $state('');
	let extracted = $state<PromptPayTarget | null>(null);
	let image = $state('');
	let fileName = $state('');
	let message = $state('');
	let reading = $state(false);
	let saving = $state(false);
	let savingAutomatic = $state(false);
	let amount = $state<number | undefined>(30);
	let selection = 0;

	async function readImage(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		const current = ++selection;
		payload = '';
		extracted = null;
		message = '';
		image = '';
		fileName = file?.name ?? '';
		if (!file) return;
		if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
			message = 'Choose an image smaller than 10 MB.';
			return;
		}
		reading = true;
		const url = URL.createObjectURL(file);
		try {
			const img = new Image();
			img.src = url;
			await img.decode();
			const { default: jsQR } = await import('jsqr');
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d', { willReadFrequently: true });
			if (!context) throw new Error('Image decoding is unavailable in this browser.');
			let decoded = '';
			for (const maxSize of [1600, 2400]) {
				const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
				canvas.width = Math.round(img.naturalWidth * scale);
				canvas.height = Math.round(img.naturalHeight * scale);
				context.fillStyle = '#ffffff';
				context.fillRect(0, 0, canvas.width, canvas.height);
				context.drawImage(img, 0, 0, canvas.width, canvas.height);
				const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
				decoded = jsQR(pixels.data, pixels.width, pixels.height)?.data ?? '';
				if (decoded) break;
			}
			if (!decoded)
				throw new Error('No QR found. Try a clear screenshot or crop closer to the code.');
			const target = parsePromptPayPayload(decoded);
			if (current !== selection) return;
			extracted = target;
			payload = decoded;
			image = canvas.toDataURL('image/png');
		} catch (err) {
			if (current === selection) message = (err as Error).message;
		} finally {
			URL.revokeObjectURL(url);
			if (current === selection) reading = false;
		}
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="PromptPay"
		description="Import your receiving QR once. Payment codes use the payer?s amount, and slip checks use this saved recipient."
	/>
	<section
		class="rounded-xl border border-border bg-card p-5! sm:p-6!"
		tabindex="-1"
		data-audit-highlight={page.url.searchParams.get('highlightSetting') === 'automatic-slip'
			? ''
			: undefined}
		use:auditFocus={page.url.searchParams.get('highlightSetting') === 'automatic-slip'}
	>
		<h2 class="mb-0! text-base! font-semibold">Automatic slip approval</h2>
		<p class="mt-2 text-sm text-muted-foreground">
			Automatically verify new payments and approve slips that match the saved recipient and amount,
			with no duplicate transfer reference. Failed checks and unavailable bank services leave
			payments pending for review. Verifying a pending slip manually also applies this setting.
		</p>
		<form
			method="POST"
			class="mt-4 flex flex-wrap items-center gap-3"
			use:enhance={() => {
				savingAutomatic = true;
				return async ({ update }) => {
					try {
						await update();
					} finally {
						savingAutomatic = false;
					}
				};
			}}
		>
			<input type="hidden" name="intent" value="automaticSlipProcessing" />
			<input type="hidden" name="enabled" value={data.automaticSlipProcessing ? '0' : '1'} />
			<span class="text-sm font-medium"
				>{data.automaticSlipProcessing ? 'Enabled' : 'Disabled'}</span
			>
			<Button
				type="submit"
				variant="outline"
				disabled={savingAutomatic || (!data.recipient && !data.automaticSlipProcessing)}
			>
				{savingAutomatic
					? 'Saving…'
					: data.automaticSlipProcessing
						? 'Disable automatic approval'
						: 'Enable automatic approval'}
			</Button>
		</form>
	</section>
	<div class="grid items-start gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
		<section
			class="rounded-xl border border-border bg-card p-5! sm:p-6!"
			tabindex="-1"
			data-audit-highlight={page.url.searchParams.get('highlightSetting') === 'promptpay'
				? ''
				: undefined}
			use:auditFocus={page.url.searchParams.get('highlightSetting') === 'promptpay'}
		>
			<div class="mb-5 flex items-center justify-between gap-3">
				<h2 class="mb-0! text-base! font-semibold">Receiving account</h2>
				<span
					class="rounded-full px-2.5 py-1 text-xs font-medium {data.recipient
						? 'bg-success/10 text-success'
						: 'bg-warning/10 text-warning'}">{data.recipient ? 'Configured' : 'Setup needed'}</span
				>
			</div>
			{#if data.recipient}
				<dl class="mb-6 rounded-lg border border-border bg-muted/30 p-4!">
					<dt class="text-xs text-muted-foreground">
						{targetLabels[data.recipient.target_type]}
					</dt>
					<dd class="mt-1 break-all font-mono text-lg tabular-nums">
						{data.recipient.target_info}
					</dd>
				</dl>
			{/if}
			<form
				method="POST"
				use:enhance={() => {
					saving = true;
					return async ({ update, result }) => {
						try {
							await update();
							if (result.type === 'success') {
								payload = '';
								extracted = null;
								image = '';
								fileName = '';
							}
						} finally {
							saving = false;
						}
					};
				}}
				class="space-y-5"
			>
				<label
					class="block rounded-xl border border-dashed border-border bg-background p-5! transition hover:border-primary focus-within:border-primary"
				>
					<span class="block text-sm font-medium"
						>{data.recipient ? 'Replace receiving QR' : 'Upload receiving QR'}</span
					>
					<span class="mt-1 block text-xs leading-relaxed text-muted-foreground"
						>Choose a PromptPay transfer QR from your banking app. Mobile number, national / tax ID,
						and e-wallet QR codes are supported.</span
					>
					<input
						type="file"
						accept="image/*"
						onchange={readImage}
						disabled={saving || reading}
						class="mt-4 block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium file:text-foreground"
					/>
				</label>
				{#if reading}<p role="status" class="text-sm text-muted-foreground">
						Reading QR image…
					</p>{/if}
				{#if message}<p role="alert" class="text-sm text-danger">{message}</p>{/if}
				{#if extracted}
					<div class="flex items-start gap-4 rounded-lg border border-primary/30 bg-primary/5 p-4!">
						<img
							src={image}
							alt="Uploaded receiving QR"
							class="h-20 w-20 rounded-md bg-white object-contain"
						/>
						<div class="min-w-0">
							<p class="text-xs font-medium text-primary">Recipient extracted</p>
							<p class="mt-2 text-xs text-muted-foreground">
								{targetLabels[extracted.target_type]}
							</p>
							<p class="break-all font-mono text-sm">{extracted.target_info}</p>
							<p class="mt-1 break-all text-xs text-muted-foreground">{fileName}</p>
						</div>
					</div>
					<p class="text-xs leading-relaxed text-muted-foreground">
						Check this recipient before saving. Any amount in the uploaded QR is replaced with the
						payer’s amount.
					</p>
				{/if}
				<input type="hidden" name="payload" value={payload} />
				<Button type="submit" disabled={!extracted || reading || saving} class="w-full rounded-lg!"
					>{saving ? 'Saving…' : 'Save receiving account'}</Button
				>
				{#if form?.message}<p
						role="status"
						class="text-sm {form.saved ? 'text-success' : 'text-danger'}"
					>
						{form.message}
					</p>{/if}
			</form>
		</section>
		<section class="rounded-xl border border-border bg-card p-5! sm:p-6!">
			<h2 class="mb-0! text-base! font-semibold">Generate a payment QR</h2>
			<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
				Uses the saved receiving account.
			</p>
			<label class="mb-5! mt-5! block">
				<span class="text-xs font-medium text-muted-foreground">Amount in baht</span>
				<input
					type="number"
					min="0.01"
					max="9999999999.99"
					step="0.01"
					bind:value={amount}
					class="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
				/>
			</label>
			<PromptPayQr {amount} revision={JSON.stringify(data.recipient)} />
		</section>
	</div>
</main>
<Lightbox />
