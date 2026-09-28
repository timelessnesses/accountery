<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	const { enabled }: { enabled: boolean } = $props();
	let saving = $state(false);
	let message = $state('');
</script>

<form
	method="POST"
	action="?/setPublicObligations"
	use:enhance={() => {
		saving = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure' || result.type === 'error') {
					message = 'Unable to change public access. Please try again.';
					return;
				}
				await update();
			} finally {
				saving = false;
			}
		};
	}}
	class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4"
>
	<div class="min-w-0">
		<p class="text-sm font-semibold">Obligations Owed: Public Database</p>
		<p class="mt-1 text-xs text-muted-foreground">
			{enabled
				? 'On — anyone with the link can view names, balances, and pending totals.'
				: 'Off — the public page is unavailable.'}
		</p>
		{#if message}<p role="alert" class="mt-2 text-sm text-danger">{message}</p>{/if}
	</div>
	<div class="flex items-center gap-4">
		{#if enabled}<a
				href={resolve('/obligations-owed')}
				class="text-sm font-medium text-primary underline-offset-4 hover:underline"
				>Open public page</a
			>{/if}
		<input type="hidden" name="enabled" value={enabled ? '0' : '1'} />
		<button
			type="submit"
			role="switch"
			aria-checked={enabled}
			aria-label="Public obligations page"
			disabled={saving}
			class="inline-flex items-center gap-2 rounded-md px-1 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
		>
			<span
				class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {enabled
					? 'bg-primary'
					: 'bg-muted-foreground/40'}"
			>
				<span
					class="h-4 w-4 rounded-full bg-white shadow-sm transition-transform {enabled
						? 'translate-x-6'
						: 'translate-x-1'}"
				></span>
			</span>
			{saving ? 'Saving…' : enabled ? 'On' : 'Off'}
		</button>
	</div>
</form>
