<script lang="ts">
	import '$lib/index.css';

	const builtAt = new Date(__BUILD_DATE).toLocaleString('en-TH', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'Asia/Bangkok'
	});
	let { children, data } = $props();
</script>

<div class="grid min-h-dvh grid-rows-[minmax(0,1fr)_auto] bg-background text-foreground">
	<div class="min-h-0">{@render children()}</div>
	<footer class="border-t border-border bg-card">
		<div
			class="mx-auto grid w-full max-w-7xl grid-flow-col auto-cols-fr items-center gap-3 px-4 py-1.5 text-[10px] leading-tight text-muted-foreground sm:px-6 sm:py-2 sm:text-[11px]"
		>
			<p>Built {builtAt}</p>

			<p class="text-center">
				<span>Edge location </span>
				<span class="font-medium text-foreground">{data.edgeLocation}</span>
				<span> | </span>
				<span>CF ray </span>
				<span class="font-medium text-foreground">{data.cfRay ?? 'unknown'}</span>
			</p>

			<p class="text-right">
				<span>Git commit </span>
				<a
					href={`https://github.com/timelessnesses/accountery/commit/${__GIT_COMMIT}`}
					target="_blank"
					rel="noreferrer"
					class="font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary"
				>
					{__GIT_COMMIT}
				</a>
			</p>
		</div>
	</footer>
</div>
