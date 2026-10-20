<script lang="ts">
	import { onMount } from 'svelte';
	import Bell from '@tabler/icons-svelte/icons/bell';
	import BellOff from '@tabler/icons-svelte/icons/bell-off';
	import {
		notificationStatus,
		registerServiceWorker,
		unregisterServiceWorker,
		supportsNotifications
	} from '$lib/notification';

	let { subscribed = $bindable(false) }: { subscribed?: boolean } = $props();
	let publicKey = $state<string | null>(null);
	let busy = $state(true);
	let message = $state('');
	let supported = $state(true);
	onMount(() => {
		supported = supportsNotifications();
		if (!supported) {
			message =
				'Notifications are unavailable here. On iPhone or iPad, add this app to your Home Screen first.';
			busy = false;
			return;
		}
		void notificationStatus()
			.then((status) => {
				({ subscribed, publicKey } = status);
				if (!publicKey) message = 'Push notifications have not been configured yet.';
			})
			.catch((err) => {
				message = err.message;
			})
			.finally(() => {
				busy = false;
			});
	});

	async function toggle() {
		if (busy) return;
		busy = true;
		message = '';
		try {
			if (subscribed) await unregisterServiceWorker();
			else await registerServiceWorker(publicKey!);
			subscribed = !subscribed;
			message = subscribed
				? 'Notifications enabled on this device.'
				: 'Notifications disabled on this device.';
		} catch (err) {
			message = err instanceof Error ? err.message : 'Unable to update notifications.';
		} finally {
			busy = false;
		}
	}
</script>

<button
	type="button"
	onclick={toggle}
	disabled={busy || !supported || (!publicKey && !subscribed)}
	class="mt-2 flex w-full items-center justify-between gap-2 rounded-2xl px-3 py-2 text-left text-sm font-medium text-card-foreground transition hover:bg-muted disabled:opacity-60"
	aria-busy={busy}
>
	<span
		>{busy
			? 'Checking notifications…'
			: subscribed
				? 'Unsubscribe from notifications'
				: 'Subscribe to notification'}</span
	>
	{#if subscribed}<BellOff class="size-4 shrink-0" />{:else}<Bell class="size-4 shrink-0" />{/if}
</button>
{#if message}<p role="status" class="mb-1 mt-1 px-3 text-xs text-muted-foreground">
		{message}
	</p>{/if}
