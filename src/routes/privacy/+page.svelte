<script lang="ts">
	import { resolve } from '$app/paths';
	import PrivacyNoticeContent from '$lib/PrivacyNoticeContent.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<svelte:head><title>Privacy policy · Accountery</title></svelte:head>
<main class="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
	<header class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-xl font-semibold">Privacy policy</h1>
		<a href={resolve('/')} class="text-sm font-medium text-primary underline underline-offset-4"
			>กลับหน้าหลัก</a
		>
	</header>
	<div class="rounded-xl border border-border bg-card p-5 sm:p-8">
		<PrivacyNoticeContent html={data.html} />
	</div>
</main>
