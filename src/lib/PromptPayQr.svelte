<script lang="ts">
	import { resolve } from '$app/paths';
	import { lightbox } from '$lib/LightboxManager.svelte';
	import { currency } from '$lib/payments.svelte';
	import { validateAmount } from '$lib/promptpay';
	let { amount, revision = '' }: { amount: number | null | undefined; revision?: string } =
		$props();
	let qr = $state('');
	let downloadable_qr = $state('');
	let message = $state('');
	let loading = $state(false);
	async function svgToPng(
		svg: string,
		width: number,
		height: number
	): Promise<Blob> {
		const svgBlob = new Blob([svg], {
			type: "image/svg+xml;charset=utf-8"
		});

		const url = URL.createObjectURL(svgBlob);

		try {
			const image = new Image();
			image.src = url;
			await image.decode();

			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;

			const ctx = canvas.getContext("2d")!;

			// Especially useful for QR codes
			ctx.imageSmoothingEnabled = false;

			ctx.drawImage(image, 0, 0, width, height);

			const png = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob(
				blob => blob
				? resolve(blob)
				: reject(new Error("PNG conversion failed")),
				"image/png"
			);
			});

			return png;
		} 
		catch (error) {
			console.error("Error converting SVG to PNG:", error);
			throw error;
		}
		finally {
			URL.revokeObjectURL(url);
		}
	}
	$effect(() => {
		const value = amount;
		void revision;
		qr = '';
		downloadable_qr = '';
		message = '';
		loading = false;
		console.log("hello?")
		try {
			validateAmount(value ?? 0);
		} catch {
			message = 'Enter a positive payment amount to generate your QR code.';
			return;
		}
		const controller = new AbortController();
		let objectUrl = '';
		loading = true;
		const timer = setTimeout(async () => {
			console.log("fetching qr")
			try {
				const response = await fetch(`${resolve('/api/promptpay')}?amount=${value}`, {
					signal: controller.signal
				});
				if (!response.ok) {
					const body = (await response.json().catch(() => null)) as { message?: string } | null;
					throw new Error(body?.message ?? 'Unable to generate payment QR.');
				}
				if (!response.headers.get('content-type')?.includes('image/svg+xml'))
					throw new Error('Sign in again to generate a payment QR.');
				const blob = await response.blob();
				if (controller.signal.aborted) return;
				objectUrl = URL.createObjectURL(blob);
				qr = objectUrl;
				downloadable_qr = URL.createObjectURL(await svgToPng(await blob.text(), 512, 512));
			} catch (err) {
				console.error(err);
				if (!controller.signal.aborted) message = (err as Error).message;
			} finally {
				console.log("finally?")
				if (!controller.signal.aborted) loading = false;
			}
		}, 250);
		console.log("hi?")
		return () => {
			clearTimeout(timer);
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});
</script>

<div class="flex flex-col items-center gap-3" aria-live="polite" aria-busy={loading}>
	{#if qr}
		<button
			type="button"
			onclick={() => lightbox.open(qr, `PromptPay · ${currency.format(amount!)}`)}
			class="overflow-hidden rounded-xl border border-border bg-white p-2 transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
			aria-label="Enlarge PromptPay QR code"
		>
			<img src={qr} alt="PromptPay QR for {currency.format(amount!)}" class="h-52 w-52" />
		</button>
		<p class="text-2xl font-semibold tabular-nums text-foreground">{currency.format(amount!)}</p>
		<!-- QR downloads use a browser-created blob URL, not an application route. -->
		<!-- eslint-disable svelte/no-navigation-without-resolve -->
		<a
			href={downloadable_qr}
			download="promptpay-{amount!.toFixed(2)}.png"
			class="text-xs font-medium text-primary underline underline-offset-4">Download QR</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
		<p class="text-center text-xs leading-relaxed text-muted-foreground">
			Scan with your banking app and confirm the recipient before paying.
		</p>
	{:else}
		<div
			class="flex min-h-52 w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 p-5 text-center text-sm text-muted-foreground"
		>
			{loading ? 'Generating your QR…' : message}
		</div>
	{/if}
</div>
