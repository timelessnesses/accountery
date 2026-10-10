<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
</script>

<main class="admin-page">
	<AdminPageHeader title={`User unavailable (${page.status})`} description={page.error?.message} />
	<div><Button href={resolve('/admin/users')} variant="outline">Back to users</Button></div>
</main>
