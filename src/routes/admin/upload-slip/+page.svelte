<script lang="ts">
	import { resolve } from '$app/paths';
	import AdminPageHeader from '$lib/admin/AdminPageHeader.svelte';
	import ManualSlipUpload from '$lib/admin/ManualSlipUpload.svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<main class="admin-page">
	<AdminPageHeader
		title="Upload slip"
		description="Submit a payment slip on behalf of a user for approval."
	>
		<Button href={resolve('/admin')} variant="outline">View approval queue</Button>
	</AdminPageHeader>
	<div class="w-full max-w-3xl">
		<ManualSlipUpload users={data.uploadUsers} />
	</div>
</main>
