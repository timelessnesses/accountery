<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import * as Table from './components/ui/table';
	import { SvelteSet } from 'svelte/reactivity';

	type Props = {
		data: T[];
		searchKeys?: (keyof T)[];
		selectable?: boolean;

		header: Snippet;
		row: Snippet<[T]>;

		actions?: Snippet<[T]>;
		bulkActions?: Snippet<[T[], boolean]>;
		detail?: Snippet<[T]>;
	};

	let {
		data,
		searchKeys = [],
		selectable = false,

		header,
		row,
		actions,
		bulkActions,
		detail
	}: Props = $props();

	let search = $state('');
	let selected = $state(new SvelteSet<T>());
	let expanded = $state<T | undefined>();

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
		if (selected.has(index)) {
			selected.delete(index);
		} else {
			selected.add(index);
		}

		selected = new SvelteSet(selected);
	}

	function toggleExpanded(item: T) {
		if (!detail) return;

		expanded = expanded === item ? undefined : item;
	}

	const selectedItems = $derived(
		Array.from(selected)
			.map((index) => filteredData.find((item) => item === index))
			.filter((item): item is T => item !== undefined)
	);
</script>

<div class="space-y-4" style="height: auto;">
	<div class="flex items-center gap-2">
		<input
			bind:value={search}
			placeholder="Search..."
			class="w-full rounded-md border px-3 py-2"
		/>
		{#if bulkActions}
			<div class="shrink-0">
				{@render bulkActions(selectedItems, selectedItems.length === 0)}
			</div>
		{/if}
	</div>
	<div class="overflow-x-auto">
		<div class="rounded-md border">
			<Table.Root class="w-full">
				<Table.Header>
					<Table.Row>
						{#if selectable}
							<Table.Head class="w-10"></Table.Head>
						{/if}

						{@render header()}

						{#if actions}
							<Table.Head class="w-[50px]"></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>

				<Table.Body>
					{#each filteredData as item, index (index)}
						<Table.Row
							class={(index % 2 === 0 ? 'bg-background' : 'bg-muted/20') +
								(detail ? ' cursor-pointer' : '')}
							aria-expanded={detail ? expanded === item : undefined}
							onclick={() => toggleExpanded(item)}
						>
							{#if selectable}
								<Table.Cell onclick={(event) => event.stopPropagation()}>
									<input
										type="checkbox"
										checked={selected.has(item)}
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
						{#if detail && expanded === item}
							<Table.Row class="bg-muted/20">
								<Table.Cell colspan={999} class="p-4">
									{@render detail(item)}
								</Table.Cell>
							</Table.Row>
						{/if}
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</div>
</div>