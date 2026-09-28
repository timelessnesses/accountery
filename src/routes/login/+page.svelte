<script lang="ts">
	import '$lib/login.css';

	import SignInGoogleButton from '$lib/signInGoogleButton.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	const { data }: PageProps = $props();
</script>

<main>
	<h1 style="margin-bottom: 5rem;">
		Please sign in with your Google account to continue. (Thaksin University Google accounts only)
	</h1>
	<SignInGoogleButton />
	{#if data.publicObligationsEnabled}
		<a
			href={resolve('/obligations-owed')}
			class="mt-6 text-sm font-medium text-primary underline-offset-4 hover:underline"
			>Obligations Owed: Public Database</a
		>
	{/if}
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		min-height: 100%;
		text-align: center;
	}
</style>
