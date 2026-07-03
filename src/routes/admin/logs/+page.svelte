<script lang="ts">
	import { resolve } from '$app/paths';
	import DataTable from '$lib/DataTable.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import type { Log } from '$lib/types/AccountingDatabaseTypes';

	const { data } = $props();

	let selectedDate = $state('');
	const logs = $derived(data.logs as Log[]);
	const filteredLogs = $derived(
		selectedDate ? logs.filter((log) => toDateInputValue(log.date) === selectedDate) : logs
	);

	function toDateInputValue(date: Log['date']) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	function formatDate(date: Log['date']) {
		return date.toLocaleString('en-TH', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Asia/Bangkok'
		});
	}
</script>

<main class="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
	<div class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold text-foreground">Logs</h1>
		</div>
		<label class="space-y-1 text-sm">
			<span class="font-medium text-muted-foreground">Log date</span>
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
	</div>

	<DataTable data={filteredLogs} searchKeys={['email', 'action', 'id']} selectable>
		{#snippet header()}
			<Table.Head>ID</Table.Head>
			<Table.Head>Date</Table.Head>
			<Table.Head>User</Table.Head>
			<Table.Head>Action</Table.Head>
		{/snippet}

		{#snippet row(log)}
			<Table.Cell class="font-medium">#{log.id}</Table.Cell>
			<Table.Cell>
				<a
					href={resolve(`/admin/users/${log.email}`)}
					class="text-primary underline-offset-4 hover:underline"
					onclick={(event) => event.stopPropagation()}
				>
					{log.email}
				</a>
			</Table.Cell>
			<Table.Cell class="max-w-[320px] truncate">{formatDate(log.date)}</Table.Cell>
			<Table.Cell>{log.action}</Table.Cell>
		{/snippet}
	</DataTable>
</main>
