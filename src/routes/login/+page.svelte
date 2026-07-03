<script lang="ts">
	import '$lib/login.css';

	import SignInGoogleButton from '$lib/signInGoogleButton.svelte';
</script>

<main>
	<h1 style="margin-bottom: 5rem;">
		Please sign in with your Google account to continue. (Thaksin University Google accounts only)
	</h1>
	<SignInGoogleButton />
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
