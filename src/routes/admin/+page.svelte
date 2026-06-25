<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
</script>

<div class="flex h-dvh flex-col bg-background">
	<!-- Header -->
	<header class="border-b border-border bg-card">
		<div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
			<div class="flex items-center gap-3">
				<div
					class="flex h-15 w-15 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<svg
						width="100"
						height="100"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
						><rect x="3" y="4" width="18" height="18" rx="2" /><path
							d="M3 10h18M8 2v4m8-4v4"
						/></svg
					>
				</div>
				<div>
					<h1 class="text-sm font-semibold leading-tight text-card-foreground">
						Weekly Payments: Admin page
					</h1>
					<p class="text-xs text-muted-foreground">Track and clear your weekly obligations</p>
				</div>
				<div>
					<Button
						onclick={() => (window.location.href = '/admin/users')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Users
					</Button>
					<Button
						onclick={() => (window.location.href = '/admin/obligations')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Obligations
					</Button>
					<Button
						onclick={() => (window.location.href = '/admin/transactions')}
						variant="ghost"
						class="ml-4 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
					>
						Go to Transactions
					</Button>
				</div>
			</div>
		</div>
	</header>
</div>
