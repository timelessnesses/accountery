<script lang="ts">
	import { Dialog, Separator } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		confirm: () => void;
		cancel: () => void;
		show: boolean;
		title: string;
		description: string;
		children: Snippet;
	}

	const { confirm, cancel, show, title, children, description }: Props = $props();
</script>

<svelte:head>
	<!-- <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.1.3/dist/css/bootstrap.min.css" integrity="sha384-MCw98/SFnGE8fJT3GXwEOngsV7Zt27NXFoaoApmYm81iuXoPkFOJwJ8ERdknLPMO" crossorigin="anonymous"> -->
</svelte:head>

<Dialog.Root open={show}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm
				data-[state=open]:animate-in
				data-[state=closed]:animate-out"
		/>
		<Dialog.Trigger>
			{@render children()}
		</Dialog.Trigger>

		<Dialog.Content
			class="fixed left-1/2 top-1/2 z-50
				w-[95vw] max-w-md
				-translate-x-1/2 -translate-y-1/2
				rounded-xl border bg-background p-6 shadow-xl"
		>
			<div class="flex gap-4">
				<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
					⚠️
				</div>

				<div class="flex-1">
					<Dialog.Title class="text-lg font-semibold">
						{title}
					</Dialog.Title>

					<Dialog.Description class="mt-2 text-sm text-muted-foreground">
						{description}
					</Dialog.Description>
				</div>
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<Dialog.Close
					class="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
					onclick={cancel}
				>
					Cancel
				</Dialog.Close>

				<Dialog.Close
					class="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
					onclick={confirm}
				>
					Confirm
				</Dialog.Close>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
