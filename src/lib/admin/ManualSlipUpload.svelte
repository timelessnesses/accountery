<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	type TargetUser = { email: string; name: string; nickname: string };
	let { users }: { users: TargetUser[] } = $props();
	const readOnly = $derived(page.data.instanceLifecycle?.status === 'closing');
	let search = $state('');
	let selected = $state<TargetUser | null>(null);
	let open = $state(false);
	let activeIndex = $state(-1);
	let uploading = $state(false);
	let message = $state('');
	let failed = $state(false);
	let files = $state<FileList>();
	let preview = $state('');
	let searchInput: HTMLInputElement;
	const matches = $derived(
		users
			.filter((user) =>
				[user.name, user.nickname, user.email].some((value) =>
					value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
				)
			)
			.slice(0, 10)
	);

	$effect(() => {
		const file = files?.[0];
		const url =
			file && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
				? URL.createObjectURL(file)
				: '';
		preview = url;
		return () => {
			if (url) URL.revokeObjectURL(url);
		};
	});

	function select(user: TargetUser) {
		selected = user;
		search = `${user.name}${user.nickname ? ` (${user.nickname})` : ''} · ${user.email}`;
		open = false;
		activeIndex = -1;
	}

	async function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			open = true;
			activeIndex = matches.length
				? activeIndex < 0
					? event.key === 'ArrowDown'
						? 0
						: matches.length - 1
					: (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length
				: -1;
			await tick();
			document
				.getElementById(`slip-target-option-${activeIndex}`)
				?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter' && open) {
			event.preventDefault();
			if (matches[activeIndex]) select(matches[activeIndex]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			open = false;
		}
	}
</script>

<form
	method="POST"
	action="?/uploadSlip"
	enctype="multipart/form-data"
	class="rounded-md border border-border bg-card"
	use:enhance={() => {
		message = '';
		failed = false;
		uploading = true;
		open = false;
		return async ({ result, update }) => {
			try {
				if (result.type === 'error') {
					failed = true;
					message = 'Unable to upload the slip. Please try again.';
					return;
				}
				await update({ reset: result.type === 'success' });
				if (result.type === 'success' || result.type === 'failure') {
					failed = result.type === 'failure';
					message = String(result.data?.message ?? '');
					if (!failed) {
						search = '';
						selected = null;
						files = undefined;
					}
				}
			} finally {
				uploading = false;
			}
		};
	}}
>
	<div class="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4 sm:px-5">
		<div>
			<h2 class="font-semibold">Manual slip upload</h2>
			<p class="mt-1 text-sm text-muted-foreground">Record a payment on behalf of a user.</p>
		</div>
		<span class="rounded-full bg-info/10 px-2.5 py-1 text-xs font-medium text-info"
			>Approval required</span
		>
	</div>
	<fieldset disabled={uploading || readOnly} class="grid min-w-0 gap-4 p-4 sm:grid-cols-2 sm:p-5">
		<div class="relative sm:col-span-2">
			<label for="slip-target" class="mb-1.5 block text-sm font-medium">Target user</label>
			<input
				bind:this={searchInput}
				bind:value={search}
				id="slip-target"
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={open}
				aria-controls="slip-target-options"
				aria-activedescendant={open && activeIndex >= 0
					? `slip-target-option-${activeIndex}`
					: undefined}
				autocomplete="off"
				placeholder="Search by name, nickname, or email"
				required
				class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
				oninput={() => {
					selected = null;
					open = true;
					activeIndex = -1;
				}}
				onfocus={() => {
					if (!selected) open = true;
				}}
				onblur={() => {
					open = false;
				}}
				onkeydown={handleKeydown}
			/>
			<input type="hidden" name="email" value={selected?.email ?? ''} />
			{#if open}
				<div
					id="slip-target-options"
					role="listbox"
					aria-label="Matching users"
					class="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-card p-1 text-card-foreground shadow-lg"
				>
					{#each matches as user, index (user.email)}
						<button
							type="button"
							role="option"
							id={`slip-target-option-${index}`}
							aria-selected={activeIndex === index}
							tabindex={-1}
							class={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${activeIndex === index ? 'bg-muted' : ''}`}
							onpointerdown={(event) => event.preventDefault()}
							onclick={() => {
								select(user);
								searchInput.focus();
							}}
						>
							<span class="block font-medium"
								>{user.name}{user.nickname ? ` (${user.nickname})` : ''}</span
							>
							<span class="block break-all text-xs text-muted-foreground">{user.email}</span>
						</button>
					{:else}
						<p class="px-3 py-3 text-sm text-muted-foreground">No matching users.</p>
					{/each}
				</div>
			{/if}
		</div>
		<label class="space-y-1.5 text-sm">
			<span class="block font-medium">Amount (THB)</span>
			<input
				name="amount"
				type="number"
				min="0.01"
				max="9999999999.99"
				step="0.01"
				inputmode="decimal"
				placeholder="0.00"
				required
				class="w-full rounded-md border border-input bg-background px-3 py-2"
			/>
		</label>
		<label class="space-y-1.5 text-sm">
			<span class="block font-medium">Payment note</span>
			<input
				name="note"
				placeholder="What is this payment for?"
				maxlength={2000}
				required
				class="w-full rounded-md border border-input bg-background px-3 py-2"
			/>
		</label>
		<div class="space-y-3 sm:col-span-2">
			<label class="block rounded-md border border-dashed border-border bg-muted/20 p-4 text-sm">
				<span class="block font-medium">Payment slip</span>
				<span id="slip-file-help" class="mt-1 block text-xs text-muted-foreground"
					>PNG, JPEG, or WebP · Up to 10 MB</span
				>
				<input
					bind:files
					name="slip"
					type="file"
					accept="image/png,image/jpeg,image/webp"
					aria-describedby="slip-file-help"
					required
					class="mt-3 block w-full min-w-0 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm"
				/>
			</label>
			{#if preview}<img
					src={preview}
					alt="Selected payment slip preview"
					class="max-h-64 max-w-full rounded-md border border-border object-contain"
				/>{/if}
		</div>
		<div class="flex flex-wrap items-center justify-between gap-3 sm:col-span-2">
			<p class="max-w-md text-xs text-muted-foreground">
				The payment will wait for approval. Your admin account is recorded in the audit log.
			</p>
			<Button type="submit" disabled={uploading || readOnly || !selected}
				>{uploading ? 'Uploading…' : 'Upload to approval queue'}</Button
			>
		</div>
	</fieldset>
	{#if message}
		<p
			role={failed ? 'alert' : 'status'}
			class={`mx-4 mb-4 rounded-md border p-3 text-sm sm:mx-5 sm:mb-5 ${failed ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success'}`}
		>
			{message}
		</p>
	{/if}
</form>
