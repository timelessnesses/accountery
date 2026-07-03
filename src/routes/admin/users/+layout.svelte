<script lang="ts">
	const { children } = $props();
</script>

<div class="h-screen flex flex-col">
	{@render children()}
</div>
