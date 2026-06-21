<script lang="ts">
	import { onMount } from "svelte";
    import { PUBLIC_GOOGLE_OAUTH_CLIENT_ID } from "$env/static/public";
    function handleLoginRequest(response: any) {
        console.log(response);
        fetch(
            "/api/auth/google-jwt",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    id_token: response.credential
                })
            }
        ).then(res => res.json()).then(data => {
            console.log("Received session token:", data.token);
            document.cookie = `token=${data.token}; path=/; max-age=3600; secure; samesite=strict`;
            window.location.href = "/";
        }).catch(err => {
            console.error("Error during authentication:", err);
        });
    }

    onMount(() => {
        console.log("PUBLIC_GOOGLE_OAUTH_CLIENT_ID", PUBLIC_GOOGLE_OAUTH_CLIENT_ID);
        while (!window.google) {
            console.log("Waiting for Google API to load...");
        }
        if (window.google) {
            window.google.accounts.id.initialize({
                client_id: PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
                callback: handleLoginRequest,
                hd: "tsu.ac.th"
            });
            window.google.accounts.id.renderButton(
                document.getElementById("google-button")!,
                { theme: "filled_blue", size: "large", text: "signin_with", width: 600, height: 200 }
            );
            window.google.accounts.id.prompt();
        }
    })
</script>
<div id="google-button"></div>