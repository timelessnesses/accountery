<script lang="ts">
	import DataTable from '$lib/DataTable.svelte';
	import * as DropDownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';
	import * as XLSX from "xlsx";
	import { Dialog } from 'bits-ui';
	import Confirmation from '$lib/Confirmation.svelte';

	const { data } = $props();

	type TransformedUser = {
		email: string;
		name: string;
		nickname: string;
		paid: number;
		owed: number;
		net: number;
		session_expiry: string;
		session_token: string;
	};

	type StudentRow = {
		id: string;
		name: string;
		nickname: string;
	};

	let fileInput: HTMLInputElement;
	let ask = $state(false);
	let importing = $state(false);

	let sheetRows = $state<unknown[][]>([]);

	let idColumn = $state('');
	let nameColumn = $state('');
	let nicknameColumn = $state('');

	function columnToIndex(value: string): number {
		const trimmed = value.trim();
		if (!trimmed) return -1;

		if (/^\d+$/.test(trimmed)) {
			return parseInt(trimmed, 10) - 1;
		}

		let index = 0;
		for (const char of trimmed.toUpperCase()) {
			if (char < 'A' || char > 'Z') return -1;
			index = index * 26 + (char.charCodeAt(0) - 64);
		}
		return index - 1;
	}

	function fileChange(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const result = e.target?.result;
			if (!result) return;

			const workbook = XLSX.read(result, { type: 'array' });
			const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
			sheetRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as unknown[][];

			idColumn = '';
			nameColumn = '';
			nicknameColumn = '';
			ask = true;
		};
		reader.readAsArrayBuffer(file);
	}

	const previewStudents = $derived.by<StudentRow[]>(() => {
		const idIdx = columnToIndex(idColumn);
		const nameIdx = columnToIndex(nameColumn);
		const nicknameIdx = columnToIndex(nicknameColumn);

		if (idIdx < 0 || nameIdx < 0 || sheetRows.length === 0) return [];

		return sheetRows
			.map((row) => ({
				id: String(row[idIdx] ?? '').trim(),
				name: String(row[nameIdx] ?? '').trim(),
				nickname: nicknameIdx >= 0 ? String(row[nicknameIdx] ?? '').trim() : ''
			}))
			.filter((student) => student.id && student.name);
	});

	function closeDialog() {
		ask = false;
		sheetRows = [];
		if (fileInput) fileInput.value = '';
	}

	function confirmImport() {
		if (previewStudents.length === 0) return;
		importing = true;

		fetch('/admin/users/import-students', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ students: previewStudents })
		})
			.then(() => {
				alert(`Imported ${previewStudents.length} student${previewStudents.length > 1 ? 's' : ''} successfully`);
				closeDialog();
				window.location.reload();
			})
			.catch(() => {
				alert('Failed to import student data');
			})
			.finally(() => {
				importing = false;
			});
	}
	let confirm = $state(false);
	let userToChange: TransformedUser | null = null;
	let changeToAdmin = $state(false);

	function makeAdmin(user: TransformedUser, changeToAdmin: boolean) {
		fetch(`/admin/users/${user.email}/change-permissions`, {
								method: 'POST',
								body: JSON.stringify({
									admin: changeToAdmin
								})
							})
								.then(() => {
									alert('User permissions updated successfully');
									window.location.reload();
								})
								.catch(() => {
									alert('Failed to update user permissions');
								});
	}
</script>

<h1>Users</h1>
<div style="height: 100%">
	<DataTable
		data={data.transactionsFromUser.results}
		searchKeys={['name', 'email']}
		selectable={true}
	>
		{#snippet header()}
			<Table.Head>Session Token</Table.Head>
			<Table.Head>Name</Table.Head>
			<Table.Head>Email</Table.Head>
			<Table.Head>Nickname</Table.Head>
			<Table.Head>Session Expiration</Table.Head>
			<Table.Head>Paid</Table.Head>
			<Table.Head>Owed</Table.Head>
			<Table.Head>Net</Table.Head>
		{/snippet}

		{#snippet row(item)}
			<Table.Cell>{item.session_token ? item.session_token.substring(0, 6) : 'None'}...</Table.Cell>
			<Table.Cell>{item.name}</Table.Cell>
			<Table.Cell>{item.email}</Table.Cell>
			<Table.Cell>{item.nickname}</Table.Cell>
			<Table.Cell
				>{item.session_expiry
					? new Date(parseInt(item.session_expiry) * 1000).toLocaleString('en-TH', {
							timeZone: 'Asia/Bangkok'
						})
					: 'None'}</Table.Cell
			>
			<Table.Cell>{item.paid}</Table.Cell>
			<Table.Cell>{item.owed}</Table.Cell>
			<Table.Cell>{item.net}</Table.Cell>
		{/snippet}

		{#snippet actions(user)}
			<DropDownMenu.Root>
				<DropDownMenu.Trigger
					><Button variant="ghost" size="sm">Actions</Button></DropDownMenu.Trigger
				>
				<DropDownMenu.Content class="bg-card border shadow-lg">
					<DropDownMenu.Item
						class="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
						onclick={() => {
							window.open(`/admin/users/${user.email}`, '_blank');
						}}>View Details</DropDownMenu.Item
					>
					<DropDownMenu.Item
						class="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
						onclick={() => {
							fetch(`/admin/users/${user.email}/reset-session`, {
								method: 'POST'
							})
								.then(() => {
									alert('Session reset successfully');
								})
								.catch(() => {
									alert('Failed to reset session');
								});
						}}>Reset Session</DropDownMenu.Item
					>
					<DropDownMenu.Item 
						class="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
						onclick={() => {
							confirm = true;
							userToChange = user;
							changeToAdmin = true;
					}}>
						Make Admin
					</DropDownMenu.Item>
					<DropDownMenu.Item
						class="cursor-pointer data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
						onclick={() => {
							confirm = true;
							userToChange = user;
							changeToAdmin = false;
						}}>Remove Admin</DropDownMenu.Item>

				</DropDownMenu.Content>
			</DropDownMenu.Root>
		{/snippet}

		{#snippet bulkActions(selected, disabled)}
			<Button
				{disabled}
				onclick={() => {
					const emails = selected.map((user: TransformedUser) => user.email);
					Promise.all(
						emails.map((email) => {
							return fetch(`/admin/users/${email}/reset-session`, {
								method: 'POST'
							});
						})
					)
						.then(() => {
							alert('Session reset successfully for selected users');
							window.location.reload();
						})
						.catch(() => {
							alert('Failed to reset session for selected users');
						});
				}}>Reset {selected.length} Session Token{selected.length > 1 ? 's' : ''}</Button
			>
			<Button
				onclick={() => {
					fileInput.click();
				}}
			>Import Student Data</Button>
		{/snippet}
	</DataTable>
</div>

<input
	type="file"
	accept=".csv,.json,.xlsx"
	class="hidden"
	onchange={fileChange}
	bind:this={fileInput}
/>

<Dialog.Root open={ask} onOpenChange={(open) => !open && closeDialog()}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm
				data-[state=open]:animate-in data-[state=open]:fade-in
				data-[state=closed]:animate-out data-[state=closed]:fade-out"
		/>

		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50
				w-[95vw] max-w-2xl
				-translate-x-1/2 -translate-y-1/2
				rounded-xl border bg-background p-6 shadow-xl
				data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95
				data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95"
		>
			<Dialog.Title class="text-lg font-semibold">Import Student Data</Dialog.Title>
			<Dialog.Description class="mt-1 text-sm text-muted-foreground">
				Tell us which column holds each field. Use a column letter (A, B, C…) or number (1, 2, 3…).
			</Dialog.Description>

			<div class="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Student ID column</span>
					<input
						type="text"
						bind:value={idColumn}
						placeholder="e.g. A"
						class="rounded-md border bg-background px-3 py-2 text-sm shadow-sm
							placeholder:text-muted-foreground
							focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Student name column</span>
					<input
						type="text"
						bind:value={nameColumn}
						placeholder="e.g. B"
						class="rounded-md border bg-background px-3 py-2 text-sm shadow-sm
							placeholder:text-muted-foreground
							focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
					/>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">Student nickname column</span>
					<input
						type="text"
						bind:value={nicknameColumn}
						placeholder="e.g. C (optional)"
						class="rounded-md border bg-background px-3 py-2 text-sm shadow-sm
							placeholder:text-muted-foreground
							focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
					/>
				</label>
			</div>

			{#if idColumn.trim() && nameColumn.trim()}
				<div class="mt-5">
					<p class="mb-2 text-sm font-medium">
						Preview — {previewStudents.length} student{previewStudents.length === 1 ? '' : 's'} found
					</p>
					<div class="max-h-64 overflow-y-auto rounded-md border">
						<DataTable data={previewStudents.slice(0, 50)} selectable={false}>
							{#snippet header()}
								<Table.Head>Student ID</Table.Head>
								<Table.Head>Name</Table.Head>
								<Table.Head>Nickname</Table.Head>
							{/snippet}
							{#snippet row(student: StudentRow)}
								<Table.Cell>{student.id}</Table.Cell>
								<Table.Cell>{student.name}</Table.Cell>
								<Table.Cell>{student.nickname || '—'}</Table.Cell>
							{/snippet}
						</DataTable>
					</div>
					{#if previewStudents.length > 50}
						<p class="mt-1 text-xs text-muted-foreground">
							Showing first 50 of {previewStudents.length} rows.
						</p>
					{/if}
				</div>
			{/if}

			<div class="mt-6 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
					onclick={closeDialog}
				>
					Cancel
				</Dialog.Close>
				<button
					class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
						hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
					disabled={previewStudents.length === 0 || importing}
					onclick={confirmImport}
				>
					{importing ? 'Importing…' : `Import ${previewStudents.length || ''} student${previewStudents.length === 1 ? '' : 's'}`}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<Confirmation show={confirm} title="Confirm" description="Are you sure you want to make {userToChange?.name} ({userToChange?.email}) {changeToAdmin ? 'admin' : 'not admin'}?" confirm={() => {
	makeAdmin(userToChange!, changeToAdmin);
}} cancel={() => {
	confirm = false;
	userToChange = null;
	changeToAdmin = false;
}}>
<div></div>
</Confirmation>