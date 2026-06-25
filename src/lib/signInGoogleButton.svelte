<script lang="ts">
	import { onMount } from 'svelte';
	import { PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from '$env/static/public';
	function handleLoginRequest(response: { credential: string}) {
		fetch('/api/auth/google-jwt', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				id_token: response.credential
			})
		})
			.then((res) =>
				res.json<{
					token: string;
				}>()
			)
			.then(() => {
				window.location.href = '/';
			})
			.catch((err) => {
				console.error('Error during authentication:', err);
			});
	}

	const GSILoader = () => {
		// @ts-expect-error - window.google is there
		if (window.google) {
			// @ts-expect-error - window.google is there
			window.google.accounts.id.initialize({
				client_id: PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
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

<div id="google-button"></div>
