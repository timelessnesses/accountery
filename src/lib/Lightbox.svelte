<script lang="ts">
	import { lightbox } from './LightboxManager.svelte';

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') lightbox.close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if lightbox.current}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-label={lightbox.current.alt}
		tabindex="-1"
		onclick={() => lightbox.close()}
		onkeydown={(e) => e.key === 'Enter' && lightbox.close()}
	>
		<button
			class="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-card text-card-foreground shadow-lg transition hover:opacity-90"
			onclick={(e) => {
				e.stopPropagation();
				lightbox.close();
			}}
			aria-label="Close image"
		>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg
			>
		</button>
		<img
			src={lightbox.current.src}
			alt={lightbox.current.alt}
			class="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl"
		/>
	</div>
{/if}
