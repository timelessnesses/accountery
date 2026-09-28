<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Dialog } from 'bits-ui';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { ObligationCreationPause } from '$lib/types/AutomaticObligationTypes';

	const { pauses }: { pauses: ObligationCreationPause[] } = $props();
	const id = $props.id();
	let open = $state(false);
	let editingId = $state<number | null>(null);
	let startDate = $state('');
	let endDate = $state('');
	let reason = $state('');
	let removingId = $state<number | null>(null);
	let saving = $state(false);
	let message = $state('');

	function resetEditor() {
		editingId = null;
		startDate = '';
		endDate = '';
		reason = '';
		removingId = null;
	}

	function edit(pause: ObligationCreationPause) {
		editingId = pause.id;
		startDate = pause.start_date;
		endDate = pause.end_date;
		reason = pause.reason;
		removingId = null;
		message = '';
	}

	const submit: SubmitFunction = () => {
		saving = true;
		message = '';
		return async ({ result, update }) => {
			try {
				if (result.type === 'failure') {
					message =
						typeof result.data?.message === 'string'
							? result.data.message
							: 'Unable to save the change.';
				} else if (result.type === 'error') {
					message = 'Unable to save the change. Please try again.';
					return;
				} else if (result.type === 'success') {
					resetEditor();
				}
				await update({ reset: false });
			} finally {
				saving = false;
			}
		};
	};
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger
		class="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
	>
		Pause automatic creation
		{#if pauses.length > 0}<span class="rounded-full bg-muted px-2 py-0.5 text-xs"
				>{pauses.length}</span
			>{/if}
	</Dialog.Trigger>
	<Dialog.Portal>
		<Dialog.Overlay class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-xl sm:p-6"
		>
			<div class="flex items-start justify-between gap-4">
				<div>
					<Dialog.Title class="text-lg font-semibold">Automatic obligation creation</Dialog.Title>
					<Dialog.Description class="mt-2 text-sm leading-relaxed text-muted-foreground">
						Skip weekly obligations whose start date falls within a saved range. Both the start and
						end dates are included.
					</Dialog.Description>
				</div>
				<Dialog.Close
					disabled={saving}
					class="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
					>Close</Dialog.Close
				>
			</div>
			<p class="mt-4 rounded-md border border-info/20 bg-info/5 p-3 text-sm leading-relaxed">
				Weeks are created in advance. A pause prevents new automatic creation; already-created
				obligations stay in place. Use “Delete selected obligation” to remove an existing charge.
			</p>

			<form
				method="POST"
				action="?/saveCreationPause"
				use:enhance={submit}
				class="mt-5 space-y-4"
				aria-label={editingId === null
					? 'Add automatic creation pause'
					: 'Edit automatic creation pause'}
			>
				<h2 class="text-sm font-semibold">{editingId === null ? 'Add a pause' : 'Edit pause'}</h2>
				{#if editingId !== null}<input type="hidden" name="id" value={editingId} />{/if}
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-1.5">
						<label for={`${id}-start`} class="text-sm font-medium">Start date</label>
						<input
							id={`${id}-start`}
							name="start_date"
							type="date"
							bind:value={startDate}
							max={endDate || undefined}
							required
							disabled={saving}
							class="w-full rounded-md border border-border bg-background px-3 py-2"
						/>
					</div>
					<div class="space-y-1.5">
						<label for={`${id}-end`} class="text-sm font-medium">End date (inclusive)</label>
						<input
							id={`${id}-end`}
							name="end_date"
							type="date"
							bind:value={endDate}
							min={startDate || undefined}
							required
							disabled={saving}
							class="w-full rounded-md border border-border bg-background px-3 py-2"
						/>
					</div>
				</div>
				<div class="space-y-1.5">
					<label for={`${id}-reason`} class="text-sm font-medium"
						>Reason <span class="font-normal text-muted-foreground">(optional)</span></label
					>
					<input
						id={`${id}-reason`}
						name="reason"
						bind:value={reason}
						disabled={saving}
						placeholder="e.g. Semester break"
						class="w-full rounded-md border border-border bg-background px-3 py-2"
					/>
				</div>
				{#if message}<p role="alert" class="text-sm text-danger">{message}</p>{/if}
				<div class="flex justify-end gap-2">
					{#if editingId !== null}<Button
							type="button"
							variant="outline"
							disabled={saving}
							onclick={resetEditor}>Cancel edit</Button
						>{/if}
					<Button type="submit" disabled={saving}
						>{saving ? 'Saving…' : editingId === null ? 'Add pause' : 'Save changes'}</Button
					>
				</div>
			</form>

			<section class="mt-6 border-t border-border pt-4" aria-label="Saved pauses">
				<h2 class="text-sm font-semibold">
					Saved ranges <span class="font-normal text-muted-foreground">({pauses.length})</span>
				</h2>
				{#if pauses.length === 0}
					<p class="mt-3 rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
						No pauses saved. New weekly obligations will be created as usual.
					</p>
				{:else}
					<ul class="mt-3 space-y-3">
						{#each pauses as pause (pause.id)}
							<li class="rounded-md border border-border p-3">
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0">
										<p class="text-sm font-medium tabular-nums">
											{pause.start_date} → {pause.end_date}
										</p>
										{#if pause.reason}<p class="mt-1 break-words text-sm text-muted-foreground">
												{pause.reason}
											</p>{/if}
									</div>
									<div class="flex gap-2">
										<Button
											size="sm"
											variant="outline"
											disabled={saving}
											onclick={() => edit(pause)}>Edit</Button
										>
										<Button
											size="sm"
											variant="ghost"
											disabled={saving}
											onclick={() => (removingId = pause.id)}>Remove</Button
										>
									</div>
								</div>
								{#if removingId === pause.id}
									<form
										method="POST"
										action="?/removeCreationPause"
										use:enhance={submit}
										class="mt-3 space-y-3 border-t border-border pt-3"
										aria-label="Remove automatic creation pause"
									>
										<input type="hidden" name="id" value={pause.id} />
										<p class="text-sm text-muted-foreground">
											Remove this pause? The creator can generate weeks in this range again. Other
											saved pauses still apply.
										</p>
										<div class="flex justify-end gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline"
												disabled={saving}
												onclick={() => (removingId = null)}>Cancel</Button
											>
											<Button type="submit" size="sm" variant="destructive" disabled={saving}
												>{saving ? 'Removing…' : 'Remove pause'}</Button
											>
										</div>
									</form>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
