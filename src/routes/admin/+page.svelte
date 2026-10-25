<script lang="ts">
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import { currency } from '$lib/payments.svelte';
	import type { SlipOkResponse } from '$lib/slipOKAPI.js';
	import type { SlipVerification } from '$lib/types/SlipVerification';
	import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

	const { data } = $props();

	const pendingTransactions = $derived(data.allPendingTransactions);
	const readOnly = $derived(data.instanceLifecycle.status === 'closing');
	let updatingTransactionId = $state<number | undefined>();
	let expandedTransactionId = $state<number | undefined>();
	let verifyingTransactionId = $state<number | undefined>();
	let slipVerificationMessages = $state<Record<number, string>>({});

	function formatDate(date: Transaction['date']) {
		return date.toLocaleString('en-TH', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Asia/Bangkok'
		});
	}

	async function updateTransaction(transaction: Transaction, approved: 'approved' | 'rejected') {
		const reason = approved === 'rejected' ? window.prompt('Reason for rejection (optional):') : '';
		if (reason === null) return;
		updatingTransactionId = transaction.id;

		try {
			const response = await fetch(resolve(`/admin/transactions/${transaction.id}/approval`), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ approved, reason })
			});

			if (!response.ok) {
				throw new Error(await response.text());
			}

			await invalidateAll();
		} catch (err) {
			console.error(err);
			alert(`Failed to ${approved === 'approved' ? 'approve' : 'reject'} transaction`);
		} finally {
			updatingTransactionId = undefined;
		}
	}

	async function verifySlip(transaction: Transaction) {
		verifyingTransactionId = transaction.id;
		slipVerificationMessages = {
			...slipVerificationMessages,
			[transaction.id]: 'Verifying slip...'
		};

		try {
			const response = await fetch(resolve(`/admin/transactions/${transaction.id}/verify-slip`), {
				method: 'POST'
			});

			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: string } | null;
				throw new Error(body?.message ?? 'Unable to verify this slip');
			}

			const result = (await response.json()) as SlipOkResponse & {
				verification: SlipVerification;
				automaticallyApproved: boolean;
			};
			const checks = result.verification;
			const status = (passed: boolean) => (passed ? 'Passed' : 'Failed');
			const message =
				result.success && result.data?.success
					? `${checks.allChecksPassed ? 'All checks passed' : 'Some checks failed'}
- Saved recipient type: ${status(checks.recipientTypeMatches)} (${result.data.receiver.proxy?.type ?? 'Unavailable'})
- Saved recipient identifier: ${status(checks.recipientValueMatches)} (${result.data.receiver.proxy?.value ?? 'Unavailable'})
- Payment amount: ${status(checks.amountMatches)} (${currency.format(result.data.amount)})
- No duplicate slip: ${status(!checks.duplicateSlip)}${checks.recipientValueMasked ? '\nRecipient identifier is masked by the bank; only visible digits were checked.' : ''}`
					: `Unable to verify this slip${!result.success && result.message ? ': ' + result.message : ''}`;

			slipVerificationMessages = {
				...slipVerificationMessages,
				[transaction.id]: message
			};
			if (result.automaticallyApproved) await invalidateAll();
		} catch (err) {
			console.error(err);
			slipVerificationMessages = {
				...slipVerificationMessages,
				[transaction.id]: err instanceof Error ? err.message : 'Unable to verify this slip'
			};
		} finally {
			verifyingTransactionId = undefined;
		}
	}

	function toggleTransaction(transaction: Transaction) {
		expandedTransactionId = expandedTransactionId === transaction.id ? undefined : transaction.id;
	}

	function handleRowKeydown(event: KeyboardEvent, transaction: Transaction) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		toggleTransaction(transaction);
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Overview"
		description={`${pendingTransactions.length} ${pendingTransactions.length === 1 ? 'transaction needs' : 'transactions need'} review.`}
	>
		{#if !readOnly}<Button href={resolve('/admin/upload-slip')}>Upload slip</Button>{/if}
		{#if data.isBootstrapAdministrator}
			<Button href={resolve('/admin/instance')} variant="outline">Instance settings</Button>
		{/if}
	</AdminPageHeader>

	<h2 class="text-lg font-semibold">Waiting for approval</h2>
	<div class="overflow-hidden rounded-md border border-border bg-card">
		<Table.Root class="w-full">
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-[120px]">ID</Table.Head>
					<Table.Head>User</Table.Head>
					<Table.Head>Description</Table.Head>
					<Table.Head>Type</Table.Head>
					<Table.Head>Date</Table.Head>
					<Table.Head class="text-right">Amount</Table.Head>
					<Table.Head class="text-right">Status</Table.Head>
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if pendingTransactions.length === 0}
					<Table.Row>
						<Table.Cell colspan={8} class="h-24 text-center text-sm text-muted-foreground">
							No pending transactions.
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each pendingTransactions as transaction (transaction.id)}
						<Table.Row
							tabindex={0}
							role="button"
							aria-expanded={expandedTransactionId === transaction.id}
							class={(String(transaction.id) === data.focusedTransactionId ? 'bg-info/10 ' : '') +
								'cursor-pointer hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'}
							onclick={() => toggleTransaction(transaction)}
							onkeydown={(event) => handleRowKeydown(event, transaction)}
						>
							<Table.Cell class="font-medium">#{transaction.id}</Table.Cell>
							<Table.Cell>
								<a
									href={resolve(`/admin/users/${transaction.email}`)}
									class="text-primary underline-offset-4 hover:underline"
									onclick={(event) => event.stopPropagation()}
								>
									{transaction.user_name}({transaction.email})
								</a>
							</Table.Cell>
							<Table.Cell class="max-w-[320px] truncate">{transaction.description}</Table.Cell>
							<Table.Cell class="capitalize">{transaction.type}</Table.Cell>
							<Table.Cell>{formatDate(transaction.date)}</Table.Cell>
							<Table.Cell class="text-right font-medium">
								{currency.format(transaction.amount)}
							</Table.Cell>
							<Table.Cell class="text-right">
								<span
									class="inline-flex items-center rounded-full bg-info/10 px-2 py-1 text-xs font-medium text-info"
								>
									{transaction.approved}
								</span>
							</Table.Cell>
							<Table.Cell class="text-right">
								<div class="flex justify-end gap-2">
									<Button
										size="sm"
										class="bg-success text-success-foreground hover:bg-success/80"
										disabled={readOnly || updatingTransactionId === transaction.id}
										onclick={(event) => {
											event.stopPropagation();
											updateTransaction(transaction, 'approved');
										}}
									>
										Approve
									</Button>
									<Button
										size="sm"
										variant="destructive"
										disabled={readOnly || updatingTransactionId === transaction.id}
										onclick={(event) => {
											event.stopPropagation();
											updateTransaction(transaction, 'rejected');
										}}
									>
										Reject
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
						{#if expandedTransactionId === transaction.id}
							<Table.Row class="bg-muted/20">
								<Table.Cell colspan={8} class="p-4">
									{#if transaction.image}
										<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
											<a
												href={resolve(transaction.image as `/api/payments/${string}`)}
												target="_blank"
												rel="noreferrer"
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
												<div class="flex flex-wrap items-center gap-2 pt-2">
													<Button
														size="sm"
														variant="outline"
														disabled={readOnly || verifyingTransactionId === transaction.id}
														onclick={() => verifySlip(transaction)}
													>
														Verify slip
													</Button>
													<p class="text-xs text-muted-foreground">
														Click the image to open the full slip.
													</p>
												</div>
												{#if slipVerificationMessages[transaction.id]}
													<p class="text-xs font-medium text-info whitespace-pre-wrap">
														{slipVerificationMessages[transaction.id]}
													</p>
												{/if}
											</div>
										</div>
									{:else}
										<p class="text-sm text-muted-foreground">
											No bank slip was attached to this transaction.
										</p>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</main>
