<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		description,
		children
	}: { title: string; description?: string; children?: Snippet } = $props();
</script>

<svelte:head><title>{title} · Admin · Accountery</title></svelte:head>
<div class="admin-page-header">
	<div class="min-w-0">
		<p class="admin-eyebrow">Administration</p>
		<h1>{title}</h1>
		{#if description}<p class="admin-description">{description}</p>{/if}
	</div>
	{#if children}<div class="admin-page-actions">{@render children()}</div>{/if}
</div>
