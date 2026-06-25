<script lang="ts">
	import DataTable from '$lib/DataTable.svelte';
	import * as DropDownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button';
	import * as Table from '$lib/components/ui/table';

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
				</DropDownMenu.Content>
			</DropDownMenu.Root>
		{/snippet}

		{#snippet bulkActions(selected)}
			<Button
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
				}}>Reset Session Token</Button
			>
		{/snippet}
	</DataTable>
</div>
