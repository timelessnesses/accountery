<!-- src/routes/+error.svelte -->
<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="flex min-h-screen flex-col items-center justify-center text-center">
	<h1 class="text-8xl font-bold">{page.status}</h1>
	<p class="text-muted-foreground mt-2">
		{page.error?.message}
	</p>
</div>
