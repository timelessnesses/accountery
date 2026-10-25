<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import { currency } from '$lib/payments.svelte';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Bangkok',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	let closingDate = $state(today);
	let confirming = $state(false);
	let confirmation = $state('');
	let acknowledged = $state(false);
	let saving = $state(false);
	let destroyed = $state(false);
	let message = $state('');
	const needsRetention = $derived(data.unpaid.unpaidStudents > 0);
	const deletionDate = $derived(
		closingDate
			? new Date(new Date(`${closingDate}T00:00:00+07:00`).getTime() + 90 * 86400 * 1000)
			: null
	);
	function formatDate(value: Date | number) {
		return new Date(value).toLocaleDateString('en-TH', {
			timeZone: 'Asia/Bangkok',
			dateStyle: 'long'
		});
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Instance settings"
		description="Only the bootstrapped administrator can close or destroy this installation."
	/>
	{#if destroyed}
		<section role="status" class="rounded-md border border-border bg-card p-5">
			<h2 class="font-semibold">Instance destroyed</h2>
			<p class="mt-2 text-sm">
				All application records and receipt files have been deleted. This installation is disabled.
			</p>
		</section>
	{:else if data.lifecycle.status === 'closing'}
		<section class="max-w-3xl rounded-md border border-border bg-card p-5">
			<h2 class="font-semibold">Destruction scheduled</h2>
			<p class="mt-2 text-sm">
				Member access is closed. Administrators can review retained records without changing them.
			</p>
			<dl class="mt-5 grid gap-4 sm:grid-cols-2">
				<div>
					<dt class="text-xs text-muted-foreground">Closing date</dt>
					<dd class="mt-1 font-medium">
						{data.lifecycle.closedAt ? formatDate(data.lifecycle.closedAt * 1000) : '—'}
					</dd>
				</div>
				<div>
					<dt class="text-xs text-muted-foreground">Deletion date · 90 days after closing</dt>
					<dd class="mt-1 font-medium">
						{data.lifecycle.deleteAfter ? formatDate(data.lifecycle.deleteAfter * 1000) : '—'}
					</dd>
				</div>
			</dl>
			<p class="mt-5 text-sm text-muted-foreground">
				The hourly cleanup will permanently delete application records and all receipt files on or
				after the deletion date. The retention period cannot be bypassed.
			</p>
		</section>
	{:else}
		<section class="max-w-3xl rounded-md border border-danger/40 bg-card">
			<div class="border-b border-danger/20 p-5">
				<h2 class="font-semibold text-danger">Destroy this instance</h2>
				<p class="mt-2 text-sm text-muted-foreground">
					Permanently erase all users, transactions, obligations, audit logs, settings,
					subscriptions, and every file in this installation's receipt bucket. Cloudflare resources
					and shared secrets stay in place.
				</p>
			</div>
			<div class="space-y-4 p-5">
				{#if data.lifecycle.status === 'destroying'}
					<p class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
						Cleanup is incomplete and the instance is locked. Retry below, or the next hourly
						cleanup will resume it.
					</p>
				{:else if needsRetention}
					<p class="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
						<strong
							>{data.unpaid.unpaidStudents} students still have unpaid obligations ({currency.format(
								data.unpaid.outstandingAmount
							)}).</strong
						> Confirming closes member access and stops changes. Administrators retain read-only access
						for 90 days after the closing date, then records and files are deleted.
					</p>
				{:else}
					<p class="text-sm">
						There are no unpaid obligations. Confirming will delete the data and receipt files
						immediately.
					</p>
				{/if}
				{#if !confirming}
					<Button
						variant="destructive"
						onclick={() => {
							confirming = true;
							message = '';
						}}>Destroy this instance</Button
					>
				{:else}
					<form
						method="POST"
						action="?/destroy"
						class="space-y-4"
						use:enhance={() => {
							saving = true;
							message = '';
							return async ({ result, update }) => {
								try {
									if (result.type === 'error') {
										message =
											result.error.message ?? 'Cleanup failed. Retry to finish destruction.';
										await invalidateAll();
									} else if (result.type === 'success' && result.data?.destroyed) {
										destroyed = true;
									} else {
										await update({ reset: false });
									}
								} finally {
									saving = false;
								}
							};
						}}
					>
						<input type="hidden" name="retention" value={needsRetention ? '90' : '0'} />
						{#if data.lifecycle.status !== 'destroying'}
							<label class="block space-y-1.5 text-sm"
								><span class="block font-medium">Closing date (Bangkok)</span><input
									type="date"
									name="closingDate"
									bind:value={closingDate}
									max={today}
									required
									disabled={saving}
									class="rounded-md border border-border bg-background px-3 py-2"
								/></label
							>
							{#if needsRetention && deletionDate}<p class="text-sm font-medium">
									Scheduled deletion: {formatDate(deletionDate)}
								</p>{/if}
						{/if}
						<label
							class="flex items-start gap-3 rounded-md border border-danger/30 bg-danger/5 p-3 text-sm"
						>
							<input
								type="checkbox"
								name="acknowledgement"
								value="yes"
								bind:checked={acknowledged}
								required
								disabled={saving}
								class="mt-1 shrink-0"
							/>
							<span
								>I understand what I am doing. {needsRetention &&
								data.lifecycle.status !== 'destroying'
									? 'This closes member access now and permanently deletes records and receipt files 90 days after the closing date.'
									: 'This permanently deletes all application records and receipt files now.'} This cannot
								be undone.</span
							>
						</label>
						<label class="block space-y-1.5 text-sm"
							><span class="block font-medium">Type DESTROY THIS INSTANCE to confirm</span><input
								name="confirmation"
								bind:value={confirmation}
								autocomplete="off"
								spellcheck="false"
								required
								disabled={saving}
								class="w-full rounded-md border border-border bg-background px-3 py-2"
							/></label
						>
						<div class="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								disabled={saving}
								onclick={() => {
									confirming = false;
									acknowledged = false;
									confirmation = '';
								}}>Cancel</Button
							>
							<Button
								type="submit"
								variant="destructive"
								disabled={saving || !acknowledged || confirmation !== 'DESTROY THIS INSTANCE'}
								>{saving
									? 'Processing…'
									: data.lifecycle.status === 'destroying'
										? 'Retry destruction'
										: needsRetention
											? 'Close and schedule destruction'
											: 'Permanently destroy instance'}</Button
							>
						</div>
					</form>
				{/if}
				{#if message || (form && !form.ok)}<p role="alert" class="text-sm text-danger">
						{message || form?.message}
					</p>{/if}
			</div>
		</section>
	{/if}
</main>
