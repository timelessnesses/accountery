<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';
	function handleLoginRequest(response: { credential: string }) {
		fetch('/api/auth/google-jwt', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id_token: response.credential
			}),
			credentials: 'include'
		})
			.then((r) => {
				if (!r.ok) throw new Error('Failed to sign in with Google');	
				window.location.href = '/';
			})
			.catch((err) => {
				console.error('Error during Google sign-in:', err);
				alert('Failed to sign in with Google. Please try again.');
			});
	}

	const GSILoader = () => {
		// @ts-expect-error - window.google is there
		if (window.google) {
			if (!env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID) {
				throw new Error('Google OAuth client ID is not set in environment variables.');
			}
			// @ts-expect-error - window.google is there
			window.google.accounts.id.initialize({
				client_id: env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
				callback: handleLoginRequest,
				hd: 'tsu.ac.th'
			});
			// @ts-expect-error - window.google is there
			window.google.accounts.id.renderButton(document.getElementById('google-button')!, {
				theme: 'filled_blue',
				size: 'large',
				text: 'signin_with',
				width: 600,
				height: 200
			});
			// @ts-expect-error - window.google is there
			window.google.accounts.id.prompt();
		}
	};

	onMount(() => {
		const scriptThing = document.getElementById('GSIWaiting') as HTMLScriptElement;
		if (scriptThing) {
			scriptThing.addEventListener('load', GSILoader);
		}
		GSILoader();
		return () => {
			if (scriptThing) {
				scriptThing.removeEventListener('load', GSILoader);
			}
		};
	});
</script>

{#if !env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID}
	<p class="text-red-500">Google OAuth client ID is not set in environment variables.</p>
{:else}
	<div id="google-button"></div>
{/if}
