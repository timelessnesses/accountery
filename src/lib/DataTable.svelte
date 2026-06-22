<script lang="ts" generics="T">
	import type { Snippet } from "svelte";

	type Props = {
		data: T[];
		searchKeys?: (keyof T)[];
		selectable?: boolean;

		header: Snippet;
		row: Snippet<[T]>;

		actions?: Snippet<[T]>;
	};

	let {
		data,
		searchKeys = [],
		selectable = false,

		header,
		row,
		actions
	}: Props = $props();

	let search = $state("");
	let selected = $state(new Set<number>());

	const filteredData = $derived.by(() => {
		if (!search.trim() || searchKeys.length === 0)
			return data;

		const query = search.toLowerCase();

		return data.filter((item) =>
			searchKeys.some((key) =>
				String(item[key] ?? "")
					.toLowerCase()
					.includes(query)
			)
		);
	});

	function toggleRow(index: number) {
		if (selected.has(index)) {
			selected.delete(index);
		} else {
			selected.add(index);
		}

		selected = new Set(selected);
	}
</script>

<div class="space-y-4">
	<input
		bind:value={search}
		placeholder="Search..."
		class="w-full rounded-md border px-3 py-2"
	/>

	<div class="rounded-md border">
		<table class="w-full">
			<thead>
				<tr>
					{#if selectable}
						<th class="w-10"></th>
					{/if}

					{@render header()}

					{#if actions}
						<th class="w-[50px]"></th>
					{/if}
				</tr>
			</thead>

			<tbody>
				{#each filteredData as item, index}
					<tr class="border-t hover:bg-muted/50">
						{#if selectable}
							<td>
								<input
									type="checkbox"
									checked={selected.has(index)}
									onchange={() => toggleRow(index)}
								/>
							</td>
						{/if}

						{@render row(item)}

						{#if actions}
							<td class="text-right">
								{@render actions(item)}
							</td>
						{/if}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>