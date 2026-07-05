<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { env } from '$env/dynamic/public';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import { currency } from '$lib/payments.svelte';
	import type { SlipOkResponse } from '$lib/slipOKAPI.js';
	import type { Transaction } from '$lib/types/AccountingDatabaseTypes';

	const { data } = $props();

	const pendingTransactions = $derived(data.allPendingTransactions as Transaction[]);
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
		updatingTransactionId = transaction.id;

		try {
			const response = await fetch(resolve(`/admin/transactions/${transaction.id}/approval`), {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ approved })
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
				throw new Error(await response.text());
			}

			const result = (await response.json()) as SlipOkResponse;
			let message;
			if (result.data && result.data.success) {
				const {
					expectedRecipientThaiName,
					expectedRecipientEnglishName,
					expectedRecipientProxy,
					expectedRecipientProxyValueEnding,
					allChecksPassed
				} = checkingSlipCondition(result);
				message = `
${allChecksPassed ? '✅ All checks passed' : '❌ Some checks failed'}
- Expected Recipient Thai Name: ${expectedRecipientThaiName ? '✅' : '❌'} (EXPECTED: ${env.PUBLIC_RECEPIENT_NAME_THAI}, RECEIVED: ${result.data.receiver.displayName})
- Expected Recipient English Name: ${expectedRecipientEnglishName ? '✅' : '❌'} (EXPECTED: ${env.PUBLIC_RECEPIENT_NAME_ENG}, RECEIVED: ${result.data.receiver.name})
- Expected Recipient Proxy: ${expectedRecipientProxy ? '✅' : '❌'} (EXPECTED: ${env.PUBLIC_RECEPIENT_EXPECTED_PROXY}, RECEIVED: ${result.data.receiver.proxy.type})
- Expected Recipient Proxy Value Ending: ${expectedRecipientProxyValueEnding ? '✅' : '❌'} (EXPECTED: ${env.PUBLIC_RECEPIENT_EXPECTED_PROXY_VALUE_ENDING}, RECEIVED: ${result.data.receiver.proxy.value})
				`.trim();
			} else {
				message = 'Unable to verify this slip';
			}

			slipVerificationMessages = {
				...slipVerificationMessages,
				[transaction.id]: message
			};
		} catch (err) {
			console.error(err);
			slipVerificationMessages = {
				...slipVerificationMessages,
				[transaction.id]: 'Unable to verify this slip'
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
	function checkingSlipCondition(slipOkResponse: SlipOkResponse): {
		expectedRecipientThaiName: boolean;
		expectedRecipientEnglishName: boolean;
		expectedRecipientProxy: boolean;
		expectedRecipientProxyValueEnding: boolean;
		allChecksPassed: boolean;
	} {
		if (!slipOkResponse.data || !slipOkResponse.data.success) {
			return {
				expectedRecipientThaiName: false,
				expectedRecipientEnglishName: false,
				expectedRecipientProxy: false,
				expectedRecipientProxyValueEnding: false,
				allChecksPassed: false
			};
		}
		const expectedRecipientThaiName =
			slipOkResponse.data.receiver.displayName === env.PUBLIC_RECEPIENT_NAME_THAI;
		const expectedRecipientEnglishName =
			slipOkResponse.data.receiver.name === env.PUBLIC_RECEPIENT_NAME_ENG;
		const expectedRecipientProxy =
			slipOkResponse.data.receiver.proxy.type === env.PUBLIC_RECEPIENT_EXPECTED_PROXY;
		const expectedRecipientProxyValueEnding = slipOkResponse.data.receiver.proxy.value.endsWith(
			env.PUBLIC_RECEPIENT_EXPECTED_PROXY_VALUE_ENDING
		);
		return {
			expectedRecipientThaiName,
			expectedRecipientEnglishName,
			expectedRecipientProxy,
			expectedRecipientProxyValueEnding,
			allChecksPassed:
				expectedRecipientThaiName &&
				expectedRecipientEnglishName &&
				expectedRecipientProxy &&
				expectedRecipientProxyValueEnding
		};
	}
</script>

<div class="flex min-h-dvh flex-col bg-background">
	<!-- Header -->
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<div class="flex items-center gap-3">
				<div
					class="flex h-15 w-15 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<svg
						width="100"
						height="100"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						><rect x="3" y="4" width="18" height="18" rx="2" /><path
							d="M3 10h18M8 2v4m8-4v4"
						/></svg
					>
				</div>
				<div>
					<h1 class="text-sm font-semibold leading-tight text-card-foreground">
						Weekly Payments: Admin page
					</h1>
					<p class="text-xs text-muted-foreground">Track and clear your weekly obligations</p>
				</div>
				<div>
					<Button
						href={resolve('/admin/users')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Users
					</Button>
					<Button
						href={resolve('/admin/obligations')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Obligations
					</Button>
					<Button
						href={resolve('/admin/transactions')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Transactions
					</Button>
					<Button
						href={resolve('/admin/logs')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Logs
					</Button>
				</div>
			</div>
		</div>
	</header>

	<main class="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 py-6 sm:px-6">
		<div class="flex items-center justify-between gap-4">
			<div>
				<h2 class="text-lg font-semibold text-foreground">Pending Transactions</h2>
				<p class="text-sm text-muted-foreground">
					{pendingTransactions.length}
					{pendingTransactions.length === 1 ? 'transaction needs' : 'transactions need'} review
				</p>
			</div>
		</div>

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
										{transaction.email}
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
											disabled={updatingTransactionId === transaction.id}
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
											disabled={updatingTransactionId === transaction.id}
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
														src={transaction.image}
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
															disabled={verifyingTransactionId === transaction.id}
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
</div>
