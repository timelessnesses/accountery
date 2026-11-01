<script lang="ts">
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { positiveId } from '$lib/logTargets';
	import { auditFocus } from '$lib/auditFocus';
	import type { PageProps } from './$types';
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import CalendarSync from '$lib/CalendarSync.svelte';
	import AutomaticObligationControl from '$lib/AutomaticObligationControl.svelte';
	import PublicObligationsSwitch from '$lib/PublicObligationsSwitch.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Table from '$lib/components/ui/table';
	import { currency, formatWeekRange, type AllocatedWeek } from '$lib/payments.svelte';

	type StudentWeek = {
		email: string;
		name: string;
		nickname: string;
		allocated: number;
		pendingAllocated: number;
		remaining: number;
		status: AllocatedWeek['status'];
	};

	type ObligationWeek = AllocatedWeek & {
		amount: number;
		paidStudents: number;
		pendingStudents: number;
		incompleteStudents: number;
		students: StudentWeek[];
	};

	const { data, form }: PageProps = $props();
	const readOnly = $derived(data.instanceLifecycle.status === 'closing');

	const weeks = $derived(data.weeks as ObligationWeek[]);
	const highlightedId = $derived(positiveId(page.url.searchParams.get('highlightObligationId')));
	const highlightedSetting = $derived(page.url.searchParams.get('highlightSetting'));
	let selectedId = $derived(highlightedId === null ? undefined : String(highlightedId));
	const selectedWeek = $derived(
		weeks.find((week) => week.id === selectedId) ??
			(highlightedId !== null && selectedId === String(highlightedId) ? undefined : weeks[0])
	);
	let showCreateForm = $state(false);
	let showEditForm = $state(false);
	let deleteWeek = $state<ObligationWeek | null>(null);
	let deleting = $state(false);
	let createStart = $state('');
	let createEnd = $state('');
	let editStart = $derived(selectedWeek?.dayStart ?? '');
	let editEnd = $derived(selectedWeek?.dayEnd ?? '');
	type TargetUser = { email: string; name: string; nickname: string };
	let exceptionSearch = $state('');
	let exceptionUser = $state<TargetUser | null>(null);
	let exceptionReason = $state('');
	let exceptionOpen = $state(false);
	let exceptionActiveIndex = $state(-1);
	let exceptionSubmitting = $state(false);
	let voidingExceptionEmail = $state('');
	let exceptionMessage = $state('');
	let exceptionFailed = $state(false);
	let exceptionInput: HTMLInputElement;
	const exceptionMatches = $derived(
		data.users
			.filter((user: TargetUser) =>
				[user.name, user.nickname, user.email].some((value) =>
					value.toLocaleLowerCase().includes(exceptionSearch.trim().toLocaleLowerCase())
				)
			)
			.filter(
				(user: TargetUser) =>
					!data.exceptions.some(
						(exception: { obligation_id: number; email: string }) =>
							exception.obligation_id === Number(selectedWeek?.id) && exception.email === user.email
					)
			)
			.slice(0, 10)
	);
	const selectedExceptions = $derived(
		data.exceptions.filter(
			(exception: { obligation_id: number }) => exception.obligation_id === Number(selectedWeek?.id)
		)
	);

	const selectedPaidStudents = $derived(
		selectedWeek?.students.filter((student) => student.status === 'paid') ?? []
	);
	const selectedIncompleteStudents = $derived(
		selectedWeek?.students.filter(
			(student) => student.status !== 'paid' && student.status !== 'exempt'
		) ?? []
	);
	const selectedExemptStudents = $derived(
		selectedWeek?.students.filter((student) => student.status === 'exempt') ?? []
	);

	function selectWeek(week: AllocatedWeek) {
		selectObligation(week.id);
	}

	function selectObligation(id: string) {
		if (selectedId !== id) {
			exceptionSearch = '';
			exceptionUser = null;
			exceptionReason = '';
			exceptionMessage = '';
		}
		selectedId = id;
	}

	function calendarTitle(week: AllocatedWeek) {
		const w = week as ObligationWeek;
		const total = w.eligibleStudents;
		const exempt = w.students.filter((student) => student.status === 'exempt').length;
		const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
		if (total === 0) return exempt > 0 ? `${people(exempt)} exempt` : 'No students';
		const paidPart = `${w.paidStudents} / ${total} ${total === 1 ? 'person' : 'people'} paid`;
		const title =
			w.pendingStudents > 0
				? `${paidPart} (${people(w.pendingStudents)} waiting to be approved)`
				: paidPart;
		return exempt > 0 ? `${title} · ${people(exempt)} exempt` : title;
	}

	function handleWeekRowKeydown(event: KeyboardEvent, week: ObligationWeek) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		selectObligation(week.id);
	}

	function statusClass(status: AllocatedWeek['status']) {
		return status === 'paid'
			? 'bg-success/10 text-success'
			: status === 'waiting_approval'
				? 'bg-info/10 text-info'
				: status === 'partial'
					? 'bg-warning/10 text-warning'
					: status === 'exempt'
						? 'bg-muted text-muted-foreground'
						: 'bg-danger/10 text-danger';
	}

	function selectExceptionUser(user: TargetUser) {
		exceptionUser = user;
		exceptionSearch = `${user.name}${user.nickname ? ` (${user.nickname})` : ''} · ${user.email}`;
		exceptionOpen = false;
		exceptionActiveIndex = -1;
	}

	async function handleExceptionKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			exceptionOpen = true;
			exceptionActiveIndex = exceptionMatches.length
				? exceptionActiveIndex < 0
					? event.key === 'ArrowDown'
						? 0
						: exceptionMatches.length - 1
					: (exceptionActiveIndex +
							(event.key === 'ArrowDown' ? 1 : -1) +
							exceptionMatches.length) %
						exceptionMatches.length
				: -1;
			await tick();
			document
				.getElementById(`obligation-exception-option-${exceptionActiveIndex}`)
				?.scrollIntoView({ block: 'nearest' });
		} else if (event.key === 'Enter' && exceptionOpen) {
			event.preventDefault();
			if (exceptionMatches[exceptionActiveIndex])
				selectExceptionUser(exceptionMatches[exceptionActiveIndex]);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			exceptionOpen = false;
		}
	}

	async function grantException() {
		if (!selectedWeek || !exceptionUser || !exceptionReason.trim() || exceptionSubmitting) return;
		exceptionSubmitting = true;
		exceptionMessage = '';
		exceptionFailed = false;
		try {
			const response = await fetch(resolve(`/admin/obligations/${selectedWeek.id}/exempt`), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					users: [{ email: exceptionUser.email }],
					grant_reason: exceptionReason
				})
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error ?? 'Unable to grant this exception.');
			exceptionMessage = `Exception granted to ${exceptionUser.email}.`;
			exceptionSearch = '';
			exceptionUser = null;
			exceptionReason = '';
			await invalidateAll();
		} catch (error) {
			exceptionFailed = true;
			exceptionMessage = error instanceof Error ? error.message : 'Unable to grant this exception.';
		} finally {
			exceptionSubmitting = false;
		}
	}

	async function voidException(email: string) {
		if (!selectedWeek || voidingExceptionEmail) return;
		if (
			!window.confirm(`Void the exception for ${email}? The user will owe this obligation again.`)
		)
			return;
		voidingExceptionEmail = email;
		exceptionMessage = '';
		exceptionFailed = false;
		try {
			const response = await fetch(resolve(`/admin/obligations/${selectedWeek.id}/exempt`), {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error ?? 'Unable to void this exception.');
			exceptionMessage = `Exception for ${email} voided.`;
			await invalidateAll();
		} catch (error) {
			exceptionFailed = true;
			exceptionMessage = error instanceof Error ? error.message : 'Unable to void this exception.';
		} finally {
			voidingExceptionEmail = '';
		}
	}
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Obligations"
		description={`${weeks.length} obligations ? ${data.totalStudents} students`}
	>
		<div class="flex flex-wrap gap-2">
			<div
				tabindex="-1"
				data-audit-highlight={highlightedSetting === 'creation-pauses' ? '' : undefined}
				use:auditFocus={highlightedSetting === 'creation-pauses'}
			>
				<fieldset disabled={readOnly}>
					<AutomaticObligationControl pauses={data.creationPauses} />
				</fieldset>
			</div>
			<Button disabled={readOnly} onclick={() => (showCreateForm = !showCreateForm)}
				>Create new obligation</Button
			>
			<Button
				variant="outline"
				disabled={readOnly || !selectedWeek}
				onclick={() => (showEditForm = !showEditForm)}
			>
				Edit selected obligation
			</Button>
			<Button
				variant="destructive"
				disabled={readOnly || !selectedWeek}
				onclick={() => (deleteWeek = selectedWeek ?? null)}
			>
				Delete selected obligation
			</Button>
		</div>
	</AdminPageHeader>

	<div
		tabindex="-1"
		data-audit-highlight={highlightedSetting === 'public-obligations' ? '' : undefined}
		use:auditFocus={highlightedSetting === 'public-obligations'}
	>
		<fieldset disabled={readOnly}>
			<PublicObligationsSwitch enabled={data.publicObligationsEnabled} />
		</fieldset>
	</div>
	{#if highlightedId !== null && !weeks.some((week) => week.id === String(highlightedId))}
		<p role="status" class="rounded-lg border border-border bg-muted/30 p-3 text-sm">
			Obligation #{highlightedId} has been deleted or is no longer available. Its audit history is retained.
		</p>
	{/if}

	{#if form && !form.ok}
		<p role="alert" class="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
			{form.message}
		</p>
	{/if}

	{#if deleteWeek}
		<form
			method="POST"
			action="?/delete"
			use:enhance={() => {
				deleting = true;
				return async ({ update, result }) => {
					try {
						await update();
						if (result.type === 'redirect' || result.type === 'success') {
							deleteWeek = null;
							showEditForm = false;
						}
					} finally {
						deleting = false;
					}
				};
			}}
			class="rounded-md border border-danger/30 bg-danger/5 p-4"
			aria-label="Confirm obligation deletion"
		>
			<input type="hidden" name="id" value={deleteWeek.id} />
			<h2 class="font-semibold">Delete obligation #{deleteWeek.id}?</h2>
			<p class="mt-1 text-sm">
				{deleteWeek.label} · {formatWeekRange(deleteWeek.dayStart, deleteWeek.dayEnd)} · {currency.format(
					deleteWeek.amount
				)}
			</p>
			<p class="mt-2 text-sm text-muted-foreground">
				This removes the charge for all users and recalculates their balances. Payment records are
				kept and applied to the remaining obligations.
			</p>
			<div class="mt-4 flex justify-end gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={deleting}
					onclick={() => (deleteWeek = null)}>Cancel</Button
				>
				<Button type="submit" variant="destructive" disabled={deleting}
					>{deleting ? 'Deleting…' : 'Delete obligation'}</Button
				>
			</div>
		</form>
	{/if}

	{#if showCreateForm}
		<form
			method="POST"
			action="?/create"
			use:enhance
			class="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[170px_170px_120px_1fr_auto]"
		>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Start date</span>
				<input
					name="start_date"
					type="date"
					bind:value={createStart}
					max={createEnd || undefined}
					required
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">End date (inclusive)</span>
				<input
					name="end_date"
					type="date"
					bind:value={createEnd}
					min={createStart || undefined}
					required
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Amount</span>
				<input
					name="amount"
					type="number"
					min="1"
					required
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Description</span>
				<input
					name="description"
					required
					value="Weekly Obligations"
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<div class="flex items-end">
				<Button type="submit">Create</Button>
			</div>
		</form>
	{/if}

	{#if showEditForm && selectedWeek}
		<form
			method="POST"
			action="?/update"
			use:enhance
			class="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[170px_170px_120px_1fr_auto]"
		>
			<input type="hidden" name="id" value={selectedWeek.id} />
			<label class="space-y-1 text-sm">
				<span class="font-medium">Start date</span>
				<input
					name="start_date"
					type="date"
					required
					bind:value={editStart}
					max={editEnd || undefined}
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">End date (inclusive)</span>
				<input
					name="end_date"
					type="date"
					bind:value={editEnd}
					min={editStart || undefined}
					required
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Amount</span>
				<input
					name="amount"
					type="number"
					min="1"
					required
					value={selectedWeek.amount}
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<label class="space-y-1 text-sm">
				<span class="font-medium">Description</span>
				<input
					name="description"
					required
					value={selectedWeek.label}
					class="w-full rounded-md border px-3 py-2"
				/>
			</label>
			<div class="flex items-end">
				<Button type="submit">Update</Button>
			</div>
		</form>
	{/if}

	<CalendarSync />

	<section
		aria-label="Obligation payment progress calendar"
		class="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4"
	>
		<p class="mb-4 text-sm text-muted-foreground">
			Payment progress excludes users with an active exception. Pending approvals appear in
			parentheses.
		</p>
		<PaymentCalendar {weeks} onselect={selectWeek} titleFormat={calendarTitle} fitContent />
	</section>

	<section class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
		<div class="min-w-0 overflow-hidden rounded-md border border-border bg-card">
			<Table.Root class="w-full">
				<Table.Header>
					<Table.Row>
						<Table.Head>ID</Table.Head>
						<Table.Head>Date range</Table.Head>
						<Table.Head>Description</Table.Head>
						<Table.Head class="text-right">Amount</Table.Head>
						<Table.Head class="text-right">Paid</Table.Head>
						<Table.Head class="text-right">Incomplete</Table.Head>
						<Table.Head class="text-right">Status</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each weeks as week (week.id)}
						<Table.Row
							data-audit-highlight={week.id === String(highlightedId) ? '' : undefined}
							tabindex={0}
							role="button"
							aria-pressed={selectedWeek?.id === week.id}
							class={(selectedWeek?.id === week.id ? 'bg-info/10 ' : '') +
								'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none'}
							onclick={() => selectObligation(week.id)}
							onkeydown={(event) => handleWeekRowKeydown(event, week)}
						>
							<Table.Cell>
								<span class="font-medium text-primary underline-offset-4">
									#{week.id}
								</span>
							</Table.Cell>
							<Table.Cell>{formatWeekRange(week.dayStart, week.dayEnd)}</Table.Cell>
							<Table.Cell class="max-w-[260px] truncate">{week.label}</Table.Cell>
							<Table.Cell class="text-right">{currency.format(week.amount)}</Table.Cell>
							<Table.Cell class="text-right">
								{week.paidStudents} / {week.eligibleStudents}
							</Table.Cell>
							<Table.Cell class="text-right">{week.incompleteStudents}</Table.Cell>
							<Table.Cell class="text-right">
								<span
									class={'inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ' +
										statusClass(week.status)}
								>
									{week.status.replace('_', ' ')}
								</span>
							</Table.Cell>
						</Table.Row>
					{:else}
						<Table.Row
							><Table.Cell colspan={7} class="h-24 text-center text-muted-foreground"
								>No obligations. Create an obligation to get started.</Table.Cell
							></Table.Row
						>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<aside
			class="rounded-md border border-border bg-card"
			tabindex="-1"
			data-audit-highlight={selectedWeek?.id === String(highlightedId) ? '' : undefined}
			use:auditFocus={selectedWeek?.id === String(highlightedId)}
		>
			{#if selectedWeek}
				<div class="border-b border-border p-4">
					<p class="text-xs font-medium text-muted-foreground">Selected obligation</p>
					<h2 class="mt-1 text-base font-semibold">#{selectedWeek.id} · {selectedWeek.label}</h2>
					<p class="text-sm text-muted-foreground">
						{formatWeekRange(selectedWeek.dayStart, selectedWeek.dayEnd)}
					</p>
					<div class="mt-3 grid grid-cols-3 gap-2 text-sm">
						<div class="rounded-md bg-success/10 p-2 text-success">
							<p class="text-xs">Paid</p>
							<p class="font-semibold">{selectedPaidStudents.length}</p>
						</div>
						<div class="rounded-md bg-danger/10 p-2 text-danger">
							<p class="text-xs">Incomplete</p>
							<p class="font-semibold">{selectedIncompleteStudents.length}</p>
						</div>
						<div class="rounded-md bg-muted p-2 text-muted-foreground">
							<p class="text-xs">Exempt</p>
							<p class="font-semibold">{selectedExemptStudents.length}</p>
						</div>
					</div>
				</div>

				<div class="border-b border-border p-4">
					<h3 class="text-sm font-semibold">User exceptions</h3>
					<p class="mt-1 text-xs text-muted-foreground">
						An exception removes this obligation from the selected user’s balance.
					</p>
					{#if selectedExceptions.length}
						<ul class="mt-3 space-y-2">
							{#each selectedExceptions as exception (exception.email)}
								<li class="rounded-md border border-border p-2 text-xs">
									<div class="flex items-start justify-between gap-2">
										<div class="min-w-0">
											<p class="break-all font-medium">
												{exception.nickname || exception.name} · {exception.email}
											</p>
											<p class="mt-0.5 text-muted-foreground">{exception.grant_reason}</p>
										</div>
										<Button
											variant="destructive"
											type="button"
											disabled={readOnly || !!voidingExceptionEmail}
											aria-label={`Void exception for ${exception.email}`}
											onclick={() => voidException(exception.email)}
										>
											{voidingExceptionEmail === exception.email ? 'Voiding…' : 'Void'}
										</Button>
									</div>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="mt-2 text-xs text-muted-foreground">No user exceptions.</p>
					{/if}
					<form
						class="mt-3 space-y-3"
						onsubmit={(event) => {
							event.preventDefault();
							void grantException();
						}}
					>
						<fieldset disabled={readOnly || exceptionSubmitting} class="space-y-3">
							<div class="relative">
								<label for="obligation-exception-user" class="mb-1 block text-xs font-medium"
									>Add exception for</label
								>
								<input
									bind:this={exceptionInput}
									bind:value={exceptionSearch}
									id="obligation-exception-user"
									role="combobox"
									aria-autocomplete="list"
									aria-expanded={exceptionOpen}
									aria-controls="obligation-exception-options"
									aria-activedescendant={exceptionOpen && exceptionActiveIndex >= 0
										? `obligation-exception-option-${exceptionActiveIndex}`
										: undefined}
									autocomplete="off"
									placeholder="Search by name, nickname, or email"
									class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
									oninput={() => {
										exceptionUser = null;
										exceptionOpen = true;
										exceptionActiveIndex = -1;
									}}
									onfocus={() => {
										if (!exceptionUser) exceptionOpen = true;
									}}
									onblur={() => {
										exceptionOpen = false;
									}}
									onkeydown={handleExceptionKeydown}
								/>
								{#if exceptionOpen}
									<div
										id="obligation-exception-options"
										role="listbox"
										aria-label="Matching users"
										class="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg"
									>
										{#each exceptionMatches as user, index (user.email)}
											<button
												type="button"
												role="option"
												id={`obligation-exception-option-${index}`}
												aria-selected={exceptionActiveIndex === index}
												tabindex={-1}
												class={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${exceptionActiveIndex === index ? 'bg-muted' : ''}`}
												onpointerdown={(event) => event.preventDefault()}
												onclick={() => {
													selectExceptionUser(user);
													exceptionInput.focus();
												}}
											>
												<span class="block font-medium"
													>{user.name}{user.nickname ? ` (${user.nickname})` : ''}</span
												>
												<span class="block break-all text-xs text-muted-foreground"
													>{user.email}</span
												>
											</button>
										{:else}
											<p class="px-3 py-2 text-xs text-muted-foreground">No matching users.</p>
										{/each}
									</div>
								{/if}
							</div>
							<label class="block space-y-1">
								<span class="text-xs font-medium">Reason</span>
								<textarea
									bind:value={exceptionReason}
									maxlength="500"
									required
									rows="2"
									class="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
									placeholder="Why is this user exempt?"
								/>
							</label>
							<Button
								type="submit"
								disabled={!exceptionUser ||
									!exceptionReason.trim() ||
									readOnly ||
									exceptionSubmitting}
							>
								{exceptionSubmitting ? 'Saving…' : 'Grant exception'}
							</Button>
						</fieldset>
					</form>
					{#if exceptionMessage}
						<p
							role={exceptionFailed ? 'alert' : 'status'}
							class={`mt-3 rounded-md border p-2 text-xs ${exceptionFailed ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/10 text-success'}`}
						>
							{exceptionMessage}
						</p>
					{/if}
				</div>

				<div class="max-h-[620px] divide-y divide-border overflow-y-auto">
					<div class="p-4">
						<h3 class="mb-2 text-xs font-semibold text-success">Paid students</h3>
						{#if selectedPaidStudents.length === 0}
							<p class="text-sm text-muted-foreground">
								No students have completed this obligation.
							</p>
						{:else}
							<ul class="space-y-2">
								{#each selectedPaidStudents as student (student.email)}
									<li class="rounded-md border border-border p-2">
										<a
											href={resolve(`/admin/users/${student.email}`)}
											class="text-sm font-medium text-primary underline-offset-4 hover:underline"
										>
											{student.nickname || student.name}
										</a>
										<p class="text-xs text-muted-foreground">{student.email}</p>
										<p class="text-xs text-success">
											{currency.format(student.allocated)} accounted
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="p-4">
						<h3 class="mb-2 text-xs font-semibold text-muted-foreground">Exempt students</h3>
						{#if selectedExemptStudents.length === 0}
							<p class="text-sm text-muted-foreground">No users are exempt from this obligation.</p>
						{:else}
							<ul class="space-y-2">
								{#each selectedExemptStudents as student (student.email)}
									<li class="rounded-md border border-border p-2">
										<a
											href={resolve(`/admin/users/${student.email}`)}
											class="text-sm font-medium text-primary underline-offset-4 hover:underline"
										>
											{student.nickname || student.name}
										</a>
										<p class="text-xs text-muted-foreground">{student.email}</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>

					<div class="p-4">
						<h3 class="mb-2 text-xs font-semibold text-danger">Incomplete students</h3>
						{#if selectedIncompleteStudents.length === 0}
							<p class="text-sm text-muted-foreground">
								All non-exempt users have completed this obligation.
							</p>
						{:else}
							<ul class="space-y-2">
								{#each selectedIncompleteStudents as student (student.email)}
									<li class="rounded-md border border-border p-2">
										<div class="flex items-start justify-between gap-2">
											<div>
												<a
													href={resolve(`/admin/users/${student.email}`)}
													class="text-sm font-medium text-primary underline-offset-4 hover:underline"
												>
													{student.nickname || student.name}
												</a>
												<p class="text-xs text-muted-foreground">{student.email}</p>
											</div>
											<span
												class={'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
													statusClass(student.status)}
											>
												{student.status.replace('_', ' ')}
											</span>
										</div>
										<p class="mt-1 text-xs text-muted-foreground">
											{currency.format(student.allocated)}
											{student.pendingAllocated > 0
												? ` + ${currency.format(student.pendingAllocated)} pending`
												: ''}
											· {currency.format(student.remaining)} remaining
										</p>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			{:else}
				<p class="p-4 text-sm text-muted-foreground">
					Select an obligation to view student status.
				</p>
			{/if}
		</aside>
	</section>
</main>
