<script lang="ts">
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { positiveId } from '$lib/logTargets';
	import Confirmation from '$lib/Confirmation.svelte';
	import DataTable from '$lib/DataTable.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import { currency } from '$lib/payments.svelte';
	import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

	const { data } = $props();

	let updating = $state(false);
	let selectedDate = $state('');
	const highlightedId = $derived(positiveId(page.url.searchParams.get('highlightTransactionId')));
	$effect(() => {
		if (highlightedId !== null) selectedDate = '';
	});
	const transactions = $derived(data.transactions as Transaction[]);
	const filteredTransactions = $derived(
		selectedDate
			? transactions.filter((transaction) => toDateInputValue(transaction.date) === selectedDate)
			: transactions
	);

	function toDateInputValue(date: Transaction['date']) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function formatDate(date: Transaction['date']) {
		return date.toLocaleString('en-TH', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Asia/Bangkok'
		});
	}

	function statusClass(status: Transaction['approved']) {
		return status === 'approved'
			? 'bg-success/10 text-success'
			: status === 'pending'
				? 'bg-warning/10 text-warning'
				: status === 'voided'
					? 'bg-muted text-muted-foreground'
					: 'bg-danger/10 text-danger';
	}

	async function updateTransactions(
		selectedTransactions: Transaction[],
		approved: 'approved' | 'rejected' | 'voided'
	) {
		const eligibleTransactions = selectedTransactions.filter((transaction) => {
			return approved === 'voided'
				? transaction.approved === 'approved' || transaction.approved === 'rejected'
				: transaction.approved === 'pending';
		});
		closeConfirm();

		if (eligibleTransactions.length === 0) {
			alert(
				approved === 'voided'
					? 'Select approved or rejected transactions to void'
					: 'No pending transactions selected'
			);
			return;
		}
		const reason =
			approved === 'voided'
				? window.prompt('Reason for voiding these transactions (required):')
				: approved === 'rejected'
					? window.prompt('Reason for rejection (optional):')
					: '';
		if (reason === null) return;
		if (approved === 'voided' && !reason.trim()) {
			alert('A void reason is required');
			return;
		}

		updating = true;

		try {
			const response = await fetch(resolve('/admin/transactions/bulk-approval'), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					approved,
					reason,
					transactionIds: eligibleTransactions.map((transaction) => transaction.id)
				})
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}
			const result = (await response.json()) as { changed: number };
			if (!result.changed)
				alert('No transactions changed. Their status may have changed; the list will refresh.');

			await invalidateAll();
		} catch (err) {
			console.error(err);
			alert(
				`Failed to ${approved === 'approved' ? 'approve' : approved === 'voided' ? 'void' : 'deny'} selected transactions`
			);
		} finally {
			updating = false;
		}
	}
	let confirm = $state(false);
	function closeConfirm() {
		confirm = false;
		transactionsToUpdate = [];
		approvedStatusToUpdate = 'approved';
	}
	let transactionsToUpdate: Transaction[] = $state([]);
	let approvedStatusToUpdate: 'approved' | 'rejected' | 'voided' = $state('approved');
	function confirmationDoing(
		transactions: Transaction[],
		approved: 'approved' | 'rejected' | 'voided'
	) {
		confirm = true;
		transactionsToUpdate = transactions;
		approvedStatusToUpdate = approved;
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Transactions"
		description={`${filteredTransactions.length} shown ? ${transactions.length} total transactions`}
	>
		<label class="space-y-1 text-sm">
			<span class="font-medium text-muted-foreground">Transaction date</span>
			<div class="flex gap-2">
				<input
					type="date"
					bind:value={selectedDate}
					class="rounded-md border border-border bg-background px-3 py-2"
				/>
				<Button variant="outline" disabled={!selectedDate} onclick={() => (selectedDate = '')}>
					Clear
				</Button>
			</div>
		</label>
	</AdminPageHeader>
	{#if highlightedId !== null}
		<div
			class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm"
			role="status"
		>
			<p>
				{transactions.some((tx) => tx.id === highlightedId)
					? `Transaction #${highlightedId} opened from activity.`
					: `Transaction #${highlightedId} is no longer available.`}
			</p>
			<a href={resolve('/admin/transactions')} class="text-primary hover:underline"
				>Clear highlight</a
			>
		</div>
	{/if}

	<DataTable
		data={filteredTransactions}
		searchKeys={[
			'email',
			'description',
			'type',
			'approved',
			'processor',
			'reject_reason',
			'void_reason'
		]}
		key={(tx) => tx.id}
		highlightKey={highlightedId}
		selectable
	>
		{#snippet header()}
			<Table.Head>ID</Table.Head>
			<Table.Head>User</Table.Head>
			<Table.Head>Description</Table.Head>
			<Table.Head>Type</Table.Head>
			<Table.Head>Date</Table.Head>
			<Table.Head class="text-right">Amount</Table.Head>
			<Table.Head class="text-right">Status</Table.Head>
			<Table.Head>Processed by</Table.Head>
		{/snippet}

		{#snippet row(transaction)}
			<Table.Cell class="font-medium">#{transaction.id}</Table.Cell>
			<Table.Cell>
				<a
					href={resolve(`/admin/users/${transaction.email}`)}
					class="text-primary underline-offset-4 hover:underline"
					onclick={(event) => event.stopPropagation()}
				>
					{transaction.email}
				</a>
			</Table.Cell>
			<Table.Cell class="max-w-[320px] truncate">{transaction.description}</Table.Cell>
			<Table.Cell class="capitalize">{transaction.type}</Table.Cell>
			<Table.Cell>{formatDate(transaction.date)}</Table.Cell>
			<Table.Cell class="text-right font-medium">{currency.format(transaction.amount)}</Table.Cell>
			<Table.Cell class="text-right">
				<span
					class={'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ' +
						statusClass(transaction.approved)}
				>
					{transaction.approved}
				</span>
			</Table.Cell>
			<Table.Cell>
				{#if transaction.processor?.includes('@')}
					<a
						href={resolve(`/admin/users/${transaction.processor}`)}
						class="text-primary hover:underline"
						onclick={(event) => event.stopPropagation()}>{transaction.processor}</a
					>
				{:else}
					{transaction.processor || 'Unassigned'}
				{/if}
			</Table.Cell>
		{/snippet}

		{#snippet detail(transaction)}
			{#if transaction.reject_reason}<p class="mb-3 text-sm">
					<strong>Rejection reason:</strong>
					{transaction.reject_reason}
				</p>{/if}
			{#if transaction.void_reason}<p class="mb-3 text-sm">
					<strong>Void reason:</strong>
					{transaction.void_reason}
				</p>{/if}
			{#if transaction.image}
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
					<a
						href={resolve(transaction.image as `/api/payments/${string}`)}
						target="_blank"
						rel="external noreferrer"
						class="block w-full max-w-sm rounded-md border border-border bg-background p-2 transition hover:border-primary"
					>
						<img
							src={resolve(transaction.image as `/api/payments/${string}`)}
							alt="Bank slip for transaction #{transaction.id}"
							class="max-h-[480px] w-full rounded object-contain"
						/>
					</a>
					<div class="space-y-1 text-sm">
						<p class="font-medium text-foreground">Bank slip</p>
						<p class="text-muted-foreground">
							{transaction.email} · {currency.format(transaction.amount)}
						</p>
						<p class="text-xs text-muted-foreground">Click the image to open the full slip.</p>
					</div>
				</div>
			{:else}
				<p class="text-sm text-muted-foreground">No bank slip was attached to this transaction.</p>
			{/if}
		{/snippet}

		{#snippet actions(transaction)}
			<div class="flex justify-end gap-2">
				<Button
					size="sm"
					class="bg-success text-success-foreground hover:bg-success/80"
					disabled={updating || transaction.approved !== 'pending'}
					onclick={() => updateTransactions([transaction], 'approved')}
				>
					Approve
				</Button>
				<Button
					size="sm"
					variant="destructive"
					disabled={updating || transaction.approved !== 'pending'}
					onclick={() => updateTransactions([transaction], 'rejected')}
				>
					Deny
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={updating ||
						(transaction.approved !== 'approved' && transaction.approved !== 'rejected')}
					onclick={() => confirmationDoing([transaction], 'voided')}>Void</Button
				>
			</div>
		{/snippet}

		{#snippet bulkActions(selected, disabled)}
			<div class="flex flex-wrap gap-2">
				<Button
					size="sm"
					class="bg-success text-success-foreground hover:bg-success/80"
					disabled={updating || disabled}
					onclick={() => confirmationDoing(selected, 'approved')}
				>
					Approve all {selected.length} Transaction{selected.length > 1 ? 's' : ''}
				</Button>
				<Button
					size="sm"
					variant="destructive"
					disabled={updating || disabled}
					onclick={() => confirmationDoing(selected, 'rejected')}
				>
					Deny all {selected.length} Transaction{selected.length > 1 ? 's' : ''}
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={updating ||
						disabled ||
						!selected.some((tx) => tx.approved === 'approved' || tx.approved === 'rejected')}
					onclick={() => confirmationDoing(selected, 'voided')}>Void processed transactions</Button
				>
			</div>
		{/snippet}

		<!-- {/snippet} -->
	</DataTable>
</main>

<Confirmation
	show={confirm}
	title="Confirm"
	description={approvedStatusToUpdate === 'voided'
		? 'Void the selected approved or rejected transactions? They will stop counting toward balances and rejected totals. You will be asked for a reason.'
		: `Set the selected pending transactions to ${approvedStatusToUpdate}?`}
	confirm={() => {
		updateTransactions(transactionsToUpdate, approvedStatusToUpdate);
	}}
	cancel={closeConfirm}
>
	<div></div>
</Confirmation>
