<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import DataTable from '$lib/DataTable.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import type { Log } from '$lib/types/AccountingDatabaseTypes';
	import { page, navigating } from '$app/state';
	const { data } = $props();
	const logs = $derived(data.logs as Log[]);


	function formatDate(date: Log['date']) {
		return date.toLocaleString('en-TH', {
			dateStyle: 'medium',
			timeStyle: 'short',
			timeZone: 'Asia/Bangkok'
		});
	}
	let selectedStartDate = $state(page.url.searchParams.get('start_date') ?? '');
	let selectedEndDate = $state(page.url.searchParams.get('end_date') ?? '');
	let offset = $state(Number(page.url.searchParams.get('offset') ?? '0') + 1);

	const totalPages = $derived(Math.ceil(data.totalLogsCount / 25));
	$effect(() => {
		selectedEndDate;
		selectedStartDate;
		offset;
		search;
		updateQuery();
	})

	let search = $state('');

	function updateQuery() {
		const url = new URL(window.location.href);
		url.searchParams.set('offset', String(offset - 1));
		if (selectedStartDate) {
			url.searchParams.set('start_date', String(new Date(selectedStartDate).getTime() / 1000));
		} else {
			url.searchParams.delete('start_date');
		}
		if (selectedEndDate) {
			url.searchParams.set('end_date', String(new Date(selectedEndDate).getTime() / 1000));
		} else {
			url.searchParams.delete('end_date');
		}
		if (search.trim()) {
			url.searchParams.set('search', search);
		} else {
			url.searchParams.delete('search');
		}
		const prevUrl = new URL(window.location.href);
		if (prevUrl.searchParams.get('start_date') !== url.searchParams.get('start_date') ||
			prevUrl.searchParams.get('end_date') !== url.searchParams.get('end_date') ||
			prevUrl.searchParams.get('search') !== url.searchParams.get('search')) {
			offset = 1;
			url.searchParams.set('offset', '0');
		}
		goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	function updateSearch(searchString: string) {
			offset = 1;
			search = searchString;
			updateQuery();
		}
</script>

<main class="mx-auto w-full max-w-7xl space-y-4 p-4 sm:p-6">
<div class="flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-lg font-semibold text-foreground">Logs</h1>
	</div>
	<div class="flex flex-wrap items-end gap-3">
		<label class="space-y-1 text-sm">
			<span class="font-medium text-muted-foreground">Log Start Date</span>
			<div class="flex gap-2">
				<input type="date" bind:value={selectedStartDate} class="rounded-md border border-border bg-background px-3 py-2" />
				<Button variant="outline" disabled={!selectedStartDate} onclick={() => (selectedStartDate = '')}>
					Clear
				</Button>
			</div>
		</label>
		<label class="space-y-1 text-sm">
			<span class="font-medium text-muted-foreground">Log End Date</span>
			<div class="flex gap-2">
				<input type="date" bind:value={selectedEndDate} class="rounded-md border border-border bg-background px-3 py-2 text-sm shadow-sm" />
				<Button variant="outline" disabled={!selectedEndDate} onclick={() => (selectedEndDate = '')}>
					Clear
				</Button>
			</div>
		</label>
	</div>
</div>

<div class="flex items-center gap-2 justify-end">
	<Button variant="outline" onclick={() => { offset = Math.max(1, offset - 1); updateQuery(); }}>
		Previous
	</Button>
	<input
		type="text"
		placeholder="Offset"
		class="w-16 rounded-md border border-border bg-background px-1 py-1 text-center"
		bind:value={offset}
	/>
	<span class="text-sm text-muted-foreground">of {totalPages} page{totalPages === 1 ? '' : 's'}</span>
	<Button variant="outline" onclick={() => { offset = Math.min(offset + 1, totalPages); updateQuery(); }}>
		Next
	</Button>
	{#if navigating.complete}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<span class="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
			Loading…
		</div>
	{/if}
</div>

<div class:opacity-50={navigating.complete} class:pointer-events-none={navigating.complete}>
<DataTable data={logs} onSearchFinished={updateSearch} selectable>
		{#snippet header()}
			<Table.Head>ID</Table.Head>
			<Table.Head>User</Table.Head>
			<Table.Head>Date</Table.Head>
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
</div>

</main>
