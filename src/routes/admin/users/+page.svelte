<script lang="ts">
    import DataTable from "$lib/DataTable.svelte";
	import { type User } from "$lib/types/AccountingDatabaseTypes.js";
    import * as DropDownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import { Button } from "$lib/components/ui/button";

    const { data } = $props();


</script>

<h1>Users</h1>
<DataTable data={data.transactionsFromUser.results} searchKeys={["name", "email"]} selectable={true}>

    {#snippet header()}
        <th>Session Token</th>
        <th>Name</th>
        <th>Email</th>
        <th>Nickname</th>
        <th>Session Expiration</th>
        <th>Paid</th>
        <th>Owed</th>
        <th>Net</th>
    {/snippet}

    {#snippet row(item)}
        <td>{item.session_token}</td>
        <td>{item.name}</td>
        <td>{item.email}</td>
        <td>{item.nickname}</td>
        <td>{new Date(parseInt(item.session_expiry) * 1000).toLocaleString("en-TH", {
            timeZone: "Asia/Bangkok",
        })}</td>
        <td>{item.paid}</td>
        <td>{item.owed}</td>
        <td>{item.net}</td>
    {/snippet}

    {#snippet actions(user)}
        <DropDownMenu.Root>
            <DropDownMenu.Trigger><Button variant="ghost" size="icon">Actions</Button></DropDownMenu.Trigger>
            <DropDownMenu.Content>
                <DropDownMenu.Item onclick={() => {
                    window.open(`/admin/users/${user.email}`, "_blank");
                }}>View Details</DropDownMenu.Item>
                <DropDownMenu.Item onclick={() => {
                    fetch(`/admin/users/${user.email}/reset-session`, {
                        method: "POST"
                    }).then(() => {
                        alert("Session reset successfully");
                    }).catch(() => {
                        alert("Failed to reset session");
                    });
                }}>Reset Session</DropDownMenu.Item>
            </DropDownMenu.Content>
        </DropDownMenu.Root>
    {/snippet}


</DataTable>