<script lang="ts">
	const { children } = $props();
</script>

<div class="flex flex-col">
	{@render children()}
</div>
