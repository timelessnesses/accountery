<script lang="ts">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page, navigating } from '$app/state';
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import DataTable from '$lib/DataTable.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import type { PageProps } from './$types';
	import { logTargetLink } from '$lib/logTargets';
	let { data }: PageProps = $props();
	let search = $derived(data.filters.search);
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;
	const loading = $derived(navigating.to?.url.pathname === page.url.pathname);
	const firstRow = $derived(data.totalLogsCount ? data.offset * data.pageSize + 1 : 0);
	const lastRow = $derived(Math.min((data.offset + 1) * data.pageSize, data.totalLogsCount));

	// The writable derived restores search on Back/Forward while allowing an in-progress draft.
	beforeNavigate(() => clearTimeout(searchTimeout));
	$effect(() => () => clearTimeout(searchTimeout));

	function queryString(changes: Record<string, string>): '' | `?${string}` {
		const url = new URL(page.url);
		if ('offset' in changes && !('highlightLogId' in changes))
			url.searchParams.delete('highlightLogId');
		for (const [key, value] of Object.entries(changes)) {
			if (value) url.searchParams.set(key, value);
			else url.searchParams.delete(key);
		}
		return url.search as '' | `?${string}`;
	}
	function changeFilters(changes: Record<string, string>) {
		clearTimeout(searchTimeout);
		const query = queryString({ search: search.trim(), ...changes, offset: '0' });
		const href = resolve(`/admin/logs${query}`);
		if (href !== `${page.url.pathname}${page.url.search}`)
			void goto(resolve(`/admin/logs${query}`), { keepFocus: true, noScroll: true });
	}
	function scheduleSearch(event: Event) {
		search = (event.currentTarget as HTMLInputElement).value;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => changeFilters({}), 300);
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Logs"
		description="Follow activity to its source. Record links open and highlight the affected transaction, user, or obligation."
	/>
	<form
		class="admin-panel admin-toolbar"
		onsubmit={(event) => {
			event.preventDefault();
			changeFilters({});
		}}
	>
		<label class="admin-field flex-1 sm:min-w-60">
			<span>Search activity</span>
			<input
				type="search"
				name="search"
				value={search}
				oninput={scheduleSearch}
				placeholder="User, action, record, or log ID"
			/>
		</label>
		<label class="admin-field">
			<span>Start date · Bangkok</span>
			<input
				type="date"
				name="start_date"
				value={data.filters.startDate}
				max={data.filters.endDate || undefined}
				onchange={(event) => changeFilters({ start_date: event.currentTarget.value })}
			/>
		</label>
		<label class="admin-field">
			<span>End date · Bangkok</span>
			<input
				type="date"
				name="end_date"
				value={data.filters.endDate}
				min={data.filters.startDate || undefined}
				onchange={(event) => changeFilters({ end_date: event.currentTarget.value })}
			/>
		</label>
		<Button
			variant="outline"
			disabled={!search && !data.filters.startDate && !data.filters.endDate}
			onclick={() => {
				search = '';
				changeFilters({ start_date: '', end_date: '', search: '' });
			}}>Clear filters</Button
		>
	</form>
	{#if data.highlightedId !== null && !data.highlightedLogFound}
		<p role="status" class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
			Log #{data.highlightedId} is unavailable or excluded by these filters.
		</p>
	{/if}

	<div class="min-w-0 transition-opacity" class:opacity-50={loading} aria-busy={loading}>
		<DataTable
			data={data.logs}
			key={(log) => log.id}
			highlightKey={data.highlightedLogFound ? data.highlightedId : null}
			showSearch={false}
			emptyMessage="No activity matches these filters."
		>
			{#snippet header()}
				<Table.Head>ID</Table.Head><Table.Head class="hidden md:table-cell">Actor</Table.Head
				><Table.Head class="hidden md:table-cell">Date · Bangkok</Table.Head><Table.Head
					>Action</Table.Head
				>
			{/snippet}
			{#snippet row(log)}
				<Table.Cell class="font-medium tabular-nums"
					><a
						href={resolve(
							`/admin/logs${queryString({ offset: '', highlightLogId: String(log.id) })}`
						)}
						class="text-primary hover:underline"
						aria-label={`Permanent link to log ${log.id}`}>#{log.id}</a
					></Table.Cell
				>
				<Table.Cell class="hidden md:table-cell"
					>{#if log.actor_type === 'application'}<span
							class="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium"
							>Application</span
						>{:else}<a
							href={resolve(`/admin/users/${encodeURIComponent(log.email)}?fromLog=${log.id}`)}
							class="text-primary underline-offset-4 hover:underline">{log.email}</a
						>{/if}</Table.Cell
				>
				<Table.Cell class="hidden whitespace-nowrap md:table-cell"
					>{log.date.toLocaleString('en-TH', {
						dateStyle: 'medium',
						timeStyle: 'short',
						timeZone: 'Asia/Bangkok'
					})}</Table.Cell
				>
				<Table.Cell class="min-w-0 whitespace-normal md:min-w-64">
					<div class="mb-2 space-y-1 text-xs text-muted-foreground md:hidden">
						<p>
							{log.date.toLocaleString('en-TH', {
								dateStyle: 'medium',
								timeStyle: 'short',
								timeZone: 'Asia/Bangkok'
							})}
						</p>
						{#if log.actor_type === 'application'}<span class="font-medium">Application</span
							>{:else}<a
								href={resolve(`/admin/users/${encodeURIComponent(log.email)}?fromLog=${log.id}`)}
								class="break-all text-primary hover:underline">{log.email}</a
							>{/if}
					</div>
					<p class="whitespace-pre-wrap [overflow-wrap:anywhere]">{log.action}</p>
					{#if log.links.length}
						<div class="mt-2 flex flex-wrap gap-1.5" aria-label="Affected records">
							{#each log.links as target}
								{@const link = logTargetLink(target, log.id)}
								<a class="audit-target-link" href={resolve(link.href)}
									><span class="min-w-0 [overflow-wrap:anywhere]">{link.label}</span><span
										class="shrink-0"
										aria-hidden="true">↗</span
									></a
								>
							{/each}
						</div>
					{/if}
				</Table.Cell>
			{/snippet}
		</DataTable>
	</div>

	<nav class="flex flex-wrap items-center justify-between gap-3" aria-label="Log pagination">
		<p class="text-xs text-muted-foreground" role="status">
			{loading ? 'Loading activity…' : `${firstRow}–${lastRow} of ${data.totalLogsCount} logs`}
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				href={resolve(`/admin/logs${queryString({ offset: String(data.offset - 1) })}`)}
				disabled={loading || data.offset === 0}>Previous</Button
			>
			<label class="flex items-center gap-2 text-xs text-muted-foreground">
				<span>Page</span>
				<input
					aria-label="Page number"
					type="number"
					min="1"
					max={data.totalPages}
					value={data.offset + 1}
					class="w-16 text-center"
					disabled={loading}
					onchange={(event) => {
						const value = event.currentTarget.valueAsNumber;
						if (Number.isInteger(value) && value >= 1 && value <= data.totalPages)
							void goto(resolve(`/admin/logs${queryString({ offset: String(value - 1) })}`), {
								keepFocus: true,
								noScroll: true
							});
						else event.currentTarget.value = String(data.offset + 1);
					}}
				/>
				<span>of {data.totalPages}</span>
			</label>
			<Button
				variant="outline"
				href={resolve(`/admin/logs${queryString({ offset: String(data.offset + 1) })}`)}
				disabled={loading || data.offset + 1 >= data.totalPages}>Next</Button
			>
		</div>
	</nav>
</main>
