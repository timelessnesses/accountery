<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { Dialog } from 'bits-ui';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { User } from '$lib/types/AccountingDatabaseTypes';

	const { user }: { user: Pick<User, 'email' | 'name' | 'left_at' | 'role'> } = $props();
	const inputId = $props.id();
	let open = $state(false);
	let leavingDate = $state('');
	let saving = $state(false);
	let message = $state('');
	const savedDate = $derived(
		user.left_at == null ? '' : new Date(user.left_at * 1000).toISOString().slice(0, 10)
	);

	function edit() {
		leavingDate =
			savedDate ||
			new Intl.DateTimeFormat('en-CA', {
				timeZone: 'Asia/Bangkok',
				year: 'numeric',
				month: '2-digit',
				day: '2-digit'
			}).format(new Date());
		message = '';
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving) return;
		saving = true;
		message = '';
		try {
			const response = await fetch(
				resolve('/admin/users/[user]/leaving-date', { user: user.email }),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ leavingDate })
				}
			);
			if (!response.ok) {
				const result = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(result?.message ?? 'Unable to save the leaving date. Please try again.');
			}
			await invalidateAll();
			open = false;
		} catch (err) {
			message = err instanceof Error ? err.message : 'Unable to save the leaving date.';
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<span
		class="whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium {savedDate
			? 'bg-muted text-muted-foreground'
			: 'bg-success/10 text-success'}"
	>
		{savedDate ? `Left · ${savedDate}` : `Active`}
	</span>
	{#if user.role === "admin"}
		<span class = "whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium bg-success/10 text-info">Admin</span>
	{/if}
	<Dialog.Root bind:open>
		<Dialog.Trigger
			onclick={edit}
			class="whitespace-nowrap rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
		>
			{savedDate ? 'Edit leaving date' : 'Mark as left'}
		</Dialog.Trigger>
		<Dialog.Portal>
			<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
			<Dialog.Content
				class="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl"
			>
				<Dialog.Title class="text-lg font-semibold"
					>{savedDate ? 'Edit leaving date' : 'Mark user as left'}</Dialog.Title
				>
				<Dialog.Description class="mt-2 text-sm text-muted-foreground">
					Choose when new charges stop for {user.name}. Earlier obligations and payment history are
					kept.
				</Dialog.Description>
				<p class="mt-2 break-all text-xs text-muted-foreground">{user.email}</p>
				<form onsubmit={save} class="mt-5 space-y-4">
					<div class="space-y-2">
						<label for={inputId} class="text-sm font-medium">Leaving date</label>
						<input
							id={inputId}
							type="date"
							bind:value={leavingDate}
							required
							disabled={saving}
							aria-describedby={`${inputId}-help`}
							class="w-full rounded-md border border-border bg-background px-3 py-2"
						/>
						<p id={`${inputId}-help`} class="text-xs leading-relaxed text-muted-foreground">
							Obligations starting on or after this date will not be charged. An obligation starting
							earlier still counts in full, even if it ends after this date.
						</p>
					</div>
					<p class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
						Sign-in is permanently disabled as soon as the user is marked as left, including
						existing sessions and calendar subscriptions. Changing the date later only changes
						billing.
					</p>
					{#if message}<p role="alert" class="text-sm text-danger">{message}</p>{/if}
					<div class="flex justify-end gap-2">
						<Button type="button" variant="outline" disabled={saving} onclick={() => (open = false)}
							>Cancel</Button
						>
						<Button type="submit" disabled={saving}
							>{saving ? 'Saving…' : savedDate ? 'Save leaving date' : 'Mark as left'}</Button
						>
					</div>
				</form>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
</div>
