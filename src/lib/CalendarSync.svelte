<script lang="ts">
	import { resolve } from '$app/paths';

	let expanded = $state(false);
	let subscriptionUrl = $state<string | null>(null);
	let busy = $state(false);
	let message = $state('');
	let copied = $state(false);

	async function subscription(method: 'GET' | 'POST' | 'DELETE') {
		busy = true;
		message = '';
		copied = false;
		try {
			const response = await fetch(resolve('/api/calendar/subscription'), { method });
			if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
				throw new Error('Unable to update calendar subscription. Please try again.');
			}
			const result = (await response.json()) as { url?: string | null };
			subscriptionUrl = result.url ?? null;
		} catch (error) {
			message = error instanceof Error ? error.message : 'Calendar subscription failed.';
		} finally {
			busy = false;
		}
	}

	async function copyLink() {
		if (!subscriptionUrl) return;
		try {
			await navigator.clipboard.writeText(subscriptionUrl);
			copied = true;
		} catch {
			message = 'Select and copy the link below.';
		}
	}
</script>

<div class="text-xs">
	<div class="flex flex-wrap items-center gap-3">
		<a
			href={resolve('/api/calendar.ics')}
			download="obligations.ics"
			class="font-medium text-primary underline-offset-4 hover:underline">Download .ics</a
		>
		<button
			type="button"
			aria-expanded={expanded}
			class="font-medium text-primary underline-offset-4 hover:underline"
			onclick={() => {
				expanded = !expanded;
				if (expanded) void subscription('GET');
			}}>Sync calendar</button
		>
	</div>
	{#if expanded}
		<div class="mt-3 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
			<p class="text-muted-foreground">
				Subscribe to the obligation schedule in Google Calendar (From URL), Apple Calendar, or
				Outlook. Your calendar app controls how often changes refresh.
			</p>
			{#if subscriptionUrl}
				<label class="block space-y-1">
					<span class="font-medium">Private subscription link</span>
					<input
						aria-label="Private subscription link"
						readonly
						value={subscriptionUrl}
						onclick={(event) => event.currentTarget.select()}
						class="w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground"
					/>
				</label>
				<p class="text-muted-foreground">
					Anyone with this link can view the obligation schedule. Revoke it to stop future access.
				</p>
				<div class="flex flex-wrap gap-3">
					<button type="button" onclick={copyLink} class="font-medium text-primary"
						>{copied ? 'Copied' : 'Copy link'}</button
					>
					<button
						type="button"
						disabled={busy}
						onclick={() => subscription('DELETE')}
						class="font-medium text-danger disabled:opacity-50">Revoke link</button
					>
				</div>
			{:else}
				<button
					type="button"
					disabled={busy}
					onclick={() => subscription('POST')}
					class="rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground disabled:opacity-50"
					>{busy ? 'Loading…' : 'Create subscription link'}</button
				>
			{/if}
			{#if message}<p role="alert" class="text-danger">{message}</p>{/if}
		</div>
	{/if}
</div>
