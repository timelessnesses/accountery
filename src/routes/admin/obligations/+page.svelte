<script lang="ts">
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';
	import PaymentCalendar from '$lib/PaymentCalendar.svelte';
	import CalendarSync from '$lib/CalendarSync.svelte';
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

	const weeks = $derived(data.weeks as ObligationWeek[]);
	let selectedId = $state<string>();
	const selectedWeek = $derived(weeks.find((week) => week.id === selectedId) ?? weeks[0]);
	let showCreateForm = $state(false);
	let showEditForm = $state(false);
	let createStart = $state('');
	let createEnd = $state('');
	let editStart = $derived(selectedWeek?.dayStart ?? '');
	let editEnd = $derived(selectedWeek?.dayEnd ?? '');

	const selectedPaidStudents = $derived(
		selectedWeek?.students.filter((student) => student.status === 'paid') ?? []
	);
	const selectedIncompleteStudents = $derived(
		selectedWeek?.students.filter((student) => student.status !== 'paid') ?? []
	);

	function selectWeek(week: AllocatedWeek) {
		selectedId = week.id;
	}

	function handleWeekRowKeydown(event: KeyboardEvent, week: ObligationWeek) {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		selectedId = week.id;
	}

	function statusClass(status: AllocatedWeek['status']) {
		return status === 'paid'
			? 'bg-success/10 text-success'
			: status === 'waiting_approval'
				? 'bg-info/10 text-info'
				: status === 'partial'
					? 'bg-warning/10 text-warning'
					: 'bg-danger/10 text-danger';
	}
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-lg font-semibold text-foreground">Obligations</h1>
			<p class="text-sm text-muted-foreground">
				{weeks.length} obligations · {data.totalStudents} students
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button onclick={() => (showCreateForm = !showCreateForm)}>Create new obligation</Button>
			<Button
				variant="outline"
				disabled={!selectedWeek}
				onclick={() => (showEditForm = !showEditForm)}
			>
				Edit selected obligation
			</Button>
		</div>
	</div>

	{#if form && !form.ok}
		<p role="alert" class="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
			{form.message}
		</p>
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

	<section class="h-[620px] rounded-md border border-border bg-card p-4">
		<PaymentCalendar {weeks} onselect={selectWeek} />
	</section>

	<section class="grid gap-6 lg:grid-cols-[1fr_360px]">
		<div class="overflow-hidden rounded-md border border-border bg-card">
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
							tabindex={0}
							role="button"
							aria-pressed={selectedWeek?.id === week.id}
							class={(selectedWeek?.id === week.id ? 'bg-info/10 ' : '') +
								'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none'}
							onclick={() => (selectedId = week.id)}
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
								{week.paidStudents} / {data.totalStudents}
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
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<aside class="rounded-md border border-border bg-card">
			{#if selectedWeek}
				<div class="border-b border-border p-4">
					<p class="text-xs font-medium text-muted-foreground">Selected obligation</p>
					<h2 class="mt-1 text-base font-semibold">#{selectedWeek.id} · {selectedWeek.label}</h2>
					<p class="text-sm text-muted-foreground">
						{formatWeekRange(selectedWeek.dayStart, selectedWeek.dayEnd)}
					</p>
					<div class="mt-3 grid grid-cols-2 gap-2 text-sm">
						<div class="rounded-md bg-success/10 p-2 text-success">
							<p class="text-xs">Paid</p>
							<p class="font-semibold">{selectedPaidStudents.length}</p>
						</div>
						<div class="rounded-md bg-danger/10 p-2 text-danger">
							<p class="text-xs">Incomplete</p>
							<p class="font-semibold">{selectedIncompleteStudents.length}</p>
						</div>
					</div>
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
						<h3 class="mb-2 text-xs font-semibold text-danger">Incomplete students</h3>
						{#if selectedIncompleteStudents.length === 0}
							<p class="text-sm text-muted-foreground">Everyone has completed this obligation.</p>
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
