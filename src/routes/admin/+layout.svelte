<script lang="ts">
	import '$lib/index.css';
	import '$lib/admin.css';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AppHeader from '$lib/AppHeader.svelte';
	let { children, data } = $props();
	const links = [
		{ href: '/admin', label: 'Overview' },
		{ href: '/admin/users', label: 'Users' },
		{ href: '/admin/obligations', label: 'Obligations' },
		{ href: '/admin/transactions', label: 'Transactions' },
		{ href: '/admin/upload-slip', label: 'Upload slip' },
		{ href: '/admin/promptpay', label: 'PromptPay' },
		{ href: '/admin/logs', label: 'Logs' }
	] as const;
	function isActive(href: string) {
		return href === resolve('/admin')
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
	}
</script>

<div>
	<a href="#admin-content" class="admin-skip-link">Skip to content</a>
	<AppHeader user={data.user} showBalances={false} admin />
	<div class="admin-shell">
		<div class="border-b border-border bg-card">
			<nav class="admin-nav" aria-label="Admin navigation">
				{#each links as link (link.href)}
					{@const href = resolve(link.href)}
					<a {href} aria-current={isActive(href) ? 'page' : undefined}>{link.label}</a>
				{/each}
				{#if data.isBootstrapAdministrator}
					<a
						href={resolve('/admin/instance')}
						aria-current={isActive(resolve('/admin/instance')) ? 'page' : undefined}>Instance</a
					>
				{/if}
			</nav>
		</div>
		<div id="admin-content" class="admin-content" tabindex="-1">
			{#if data.instanceLifecycle.status === 'closing'}
				<p role="status" class="mb-6 rounded-md border border-warning/30 bg-warning/10 p-4 text-sm">
					This instance is closed. Administrator access is read-only.
					{#if data.instanceLifecycle.deleteAfter}
						Records and receipt files are scheduled for deletion on
						{new Date(data.instanceLifecycle.deleteAfter * 1000).toLocaleDateString('en-TH', {
							timeZone: 'Asia/Bangkok',
							dateStyle: 'long'
						})}.
					{/if}
				</p>
			{/if}
			{@render children()}
		</div>
	</div>
</div>
