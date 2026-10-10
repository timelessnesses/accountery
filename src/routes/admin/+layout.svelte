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
			</nav>
		</div>
		<div id="admin-content" class="admin-content" tabindex="-1">{@render children()}</div>
	</div>
</div>
