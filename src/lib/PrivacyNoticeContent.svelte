<script lang="ts">
	let { html }: { html: string } = $props();
</script>

<article lang="th" class="privacy-notice-copy">
	<!-- Trusted HTML rendered server-side from the repository's Markdown documents. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html html}
</article>

<style>
	.privacy-notice-copy {
		color: var(--color-foreground);
		font-size: 0.9375rem;
		line-height: 1.9;
		overflow-wrap: anywhere;
	}
	.privacy-notice-copy :global(h2),
	.privacy-notice-copy :global(h3),
	.privacy-notice-copy :global(h4) {
		margin: 1.75rem 0 0.75rem;
		font-weight: 650;
		line-height: 1.6;
		color: var(--color-foreground);
	}
	.privacy-notice-copy :global(h2) {
		font-size: 1.35rem;
		margin-top: 0;
	}
	.privacy-notice-copy :global(h3) {
		font-size: 1.08rem;
	}
	.privacy-notice-copy :global(h4) {
		font-size: 0.98rem;
	}
	.privacy-notice-copy :global(p) {
		margin: 0 0 1rem;
	}
	.privacy-notice-copy :global(ul),
	.privacy-notice-copy :global(ol) {
		margin: 0 0 1rem;
		padding-left: 1.5rem;
	}
	.privacy-notice-copy :global(ul) {
		list-style: disc;
	}
	.privacy-notice-copy :global(ol) {
		list-style: decimal;
	}
	.privacy-notice-copy :global(li) {
		margin: 0.35rem 0;
	}
	.privacy-notice-copy :global(blockquote) {
		margin: 1rem 0;
		border-left: 3px solid var(--color-primary);
		padding: 0.75rem 1rem;
		background: var(--color-muted);
	}
	.privacy-notice-copy :global(blockquote p:last-child) {
		margin-bottom: 0;
	}
	.privacy-notice-copy :global(strong) {
		font-weight: 650;
	}
</style>
