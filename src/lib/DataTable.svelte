<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import * as Table from './components/ui/table';
	import { SvelteSet } from 'svelte/reactivity';
	import { tick, untrack } from 'svelte';
	import { focusAuditElement } from '$lib/auditFocus';

	type Props = {
		data: T[];
		searchKeys?: (keyof T)[];
		onSearchFinished?: (search: string) => void;
		key: (item: T) => string | number;
		selectable?: boolean;
		showSearch?: boolean;
		emptyMessage?: string;
		highlightKey?: string | number | null;

		header: Snippet;
		row: Snippet<[T]>;

		actions?: Snippet<[T]>;
		bulkActions?: Snippet<[T[], boolean]>;
		detail?: Snippet<[T]>;
	};

	let {
		data,
		searchKeys = [],
		onSearchFinished,
		selectable = false,
		showSearch = true,
		emptyMessage = 'No matching records.',
		highlightKey = null,
		key,

		header,
		row,
		actions,
		bulkActions,
		detail
	}: Props = $props();

	let search = $state('');
	let selected = new SvelteSet<ReturnType<typeof key>>();
	let expanded = $state<ReturnType<typeof key> | undefined>();
	let container: HTMLDivElement;
	$effect(() => {
		const target = highlightKey;
		if (target === null) return;
		search = '';
		expanded = untrack(() => (detail ? target : undefined));
		let cancelled = false;
		void tick().then(() => {
			if (cancelled || !container) return;
			const row = Array.from(container.querySelectorAll<HTMLElement>('[data-record-key]')).find(
				(node) => node.dataset.recordKey === String(target)
			);
			if (row) focusAuditElement(row);
		});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const value = search;
		const timeout = setTimeout(() => {
			onSearchFinished?.(value);
		}, 300);

		return () => {
			clearTimeout(timeout);
		};
	});

	const filteredData = $derived.by(() => {
		if (!search.trim() || searchKeys.length === 0) return data;

		const query = search.toLowerCase();

		return data.filter((item) =>
			searchKeys.some((key) =>
				String(item[key] ?? '')
					.toLowerCase()
					.includes(query)
			)
		);
	});

	function toggleRow(index: T) {
		console.log('toggleRow called with index:', index, 'key:', key(index));
		const id = key(index);
		if (!id) return;
		if (selected.has(id)) {
			console.log('Removing id from selected:', id);
			selected.delete(id);
		} else {
			console.log('Adding id to selected:', id);
			selected.add(id);
		}
	}

	function toggleExpanded(item: T) {
		if (!detail) return;
		const id = key(item);
		if (!id) return;
		expanded = expanded === id ? undefined : id;
	}

	const selectedItems = $derived(
		Array.from(selected)
			.map((index) => filteredData.find((item) => key(item) === index))
			.filter((item): item is T => item !== undefined)
	);
	let selectAll = $state(false);

	$effect(() => {
		if (selectAll) {
			filteredData.forEach((item) => selected.add(key(item)));
		} else {
			selected.clear();
		}
	});
</script>

<div class="min-w-0 space-y-4" bind:this={container}>
	{#if showSearch || bulkActions}
		<div class="flex flex-wrap items-center gap-2">
			{#if showSearch}<input
					aria-label="Search records"
					bind:value={search}
					placeholder="Search records…"
					class="min-w-0 flex-1 rounded-md border bg-background px-3 py-2"
				/>{/if}
			{#if bulkActions}
				<div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">
					{@render bulkActions(selectedItems, selectedItems.length === 0)}
				</div>
			{/if}
		</div>
	{/if}
	<div class="min-w-0 overflow-x-auto">
		<div class="overflow-hidden rounded-xl border bg-card">
			<Table.Root class="w-full">
				<Table.Header>
					<Table.Row>
						{#if selectable}
							<Table.Head class="w-10">
								<input type="checkbox" aria-label="Select all records" bind:checked={selectAll} />
							</Table.Head>
						{/if}

						{@render header()}

						{#if actions}
							<Table.Head class="w-[50px]"></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>

				<Table.Body>
					{#each filteredData as item, index (key(item))}
						<Table.Row
							data-record-key={String(key(item))}
							data-audit-highlight={String(key(item)) === String(highlightKey) ? '' : undefined}
							tabindex={String(key(item)) === String(highlightKey) ? -1 : undefined}
							class={(index % 2 === 0 ? 'bg-background' : 'bg-muted/20') +
								(detail ? ' cursor-pointer' : '')}
							aria-expanded={detail ? expanded === key(item) : undefined}
							onclick={() => toggleExpanded(item)}
						>
							{#if selectable}
								<Table.Cell onclick={(event) => event.stopPropagation()}>
									<input
										type="checkbox"
										aria-label={`Select record ${key(item)}`}
										checked={selected.has(key(item))}
										onchange={() => toggleRow(item)}
									/>
								</Table.Cell>
							{/if}

							{@render row(item)}

							{#if actions}
								<Table.Cell class="text-right" onclick={(event) => event.stopPropagation()}>
									{@render actions(item)}
								</Table.Cell>
							{/if}
						</Table.Row>
						{#if detail && key(item) === expanded}
							<Table.Row class="bg-muted/20">
								<Table.Cell colspan={999} class="p-4">
									{@render detail(item)}
								</Table.Cell>
							</Table.Row>
						{/if}
					{:else}
						<Table.Row
							><Table.Cell colspan={999} class="h-32 text-center text-muted-foreground"
								>{emptyMessage}</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</div>
</div>
