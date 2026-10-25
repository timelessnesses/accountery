<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import PrivacyNoticeContent from '$lib/PrivacyNoticeContent.svelte';
	import { PRIVACY_NOTICE_LABEL } from '$lib/privacyNotice';
	import Button from '$lib/components/ui/button/button.svelte';
	import {
		notificationStatus,
		registerServiceWorker,
		unregisterServiceWorker,
		supportsNotifications
	} from '$lib/notification';
	import type { PageProps } from './$types';

	const { data, form }: PageProps = $props();
	let acknowledged = $state(false);
	let pushEnabled = $state(false);
	let supported = $state(false);
	let checkingPush = $state(true);
	let pushBusy = $state(false);
	let saving = $state(false);
	let signingOut = $state(false);
	let pushMessage = $state('');
	let errorMessage = $state('');

	onMount(() => {
		let mounted = true;
		supported = supportsNotifications();
		if (!supported || !data.pushPublicKey) {
			checkingPush = false;
			pushMessage = !supported
				? 'อุปกรณ์หรือเบราว์เซอร์นี้ยังไม่รองรับ Push คุณสามารถดำเนินการต่อได้โดยไม่เปิดการแจ้งเตือน'
				: 'ระบบยังไม่ได้เปิดให้ใช้ Push คุณสามารถดำเนินการต่อได้ตามปกติ';
			return;
		}
		void notificationStatus()
			.then((status) => {
				if (mounted) pushEnabled = status.subscribed;
			})
			.catch((err) => {
				if (mounted)
					pushMessage = err instanceof Error ? err.message : 'Unable to check notifications.';
			})
			.finally(() => {
				if (mounted) checkingPush = false;
			});
		return () => {
			mounted = false;
		};
	});

	async function changePush(event: Event) {
		const requested = (event.currentTarget as HTMLInputElement).checked;
		pushBusy = true;
		pushMessage = '';
		try {
			// This starts on the checkbox click so the browser permission prompt
			// stays within an explicit user gesture, before any network work.
			if (requested) await registerServiceWorker(data.pushPublicKey!);
			else await unregisterServiceWorker();
			pushEnabled = requested;
			pushMessage = requested
				? 'เปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว'
				: 'ปิดการแจ้งเตือนบนอุปกรณ์นี้แล้ว';
		} catch (err) {
			pushEnabled = requested
				? false
				: ((await notificationStatus().catch(() => null))?.subscribed ?? true);
			pushMessage = err instanceof Error ? err.message : 'Unable to update notifications.';
		} finally {
			pushBusy = false;
		}
	}

	async function signOut() {
		signingOut = true;
		errorMessage = '';
		try {
			await unregisterServiceWorker().catch(() => {});
			const response = await fetch(resolve('/api/auth/logout'), { method: 'POST' });
			if (!response.ok) throw new Error('Unable to sign out. Please try again.');
			window.location.href = resolve('/login');
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Unable to sign out.';
			signingOut = false;
		}
	}
</script>

<svelte:head
	><title>Privacy notice · Accountery</title><meta
		name="robots"
		content="noindex, noarchive"
	/></svelte:head
>

<main class="notice-screen mx-auto w-full max-w-7xl px-4 py-6 text-foreground sm:px-6 sm:py-10">
	<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div>
			<p class="text-xs font-medium tracking-widest text-primary">ACCOUNTERY · ก่อนเริ่มใช้งาน</p>
			<h1 class="mt-2 text-2xl font-semibold">ประกาศความเป็นส่วนตัว</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				โปรดอ่านประกาศฉบับ {PRIVACY_NOTICE_LABEL} ก่อนดำเนินการต่อ
			</p>
		</div>
		<a
			href={resolve('/privacy')}
			target="_blank"
			rel="noreferrer"
			class="text-sm font-medium text-primary underline underline-offset-4"
			>อ่านนโยบายความเป็นส่วนตัว</a
		>
	</header>
	<div class="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
		<section
			class="overflow-hidden rounded-xl border border-border bg-card"
			aria-label="Privacy notice version 1.0.0"
		>
			<div class="border-b border-border px-5 py-3 text-xs text-muted-foreground">
				ประกาศความเป็นส่วนตัว · เวอร์ชัน {PRIVACY_NOTICE_LABEL}
			</div>
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (The scrollable notice needs keyboard focus so it can be read without a pointer.) -->
			<div
				tabindex="0"
				role="region"
				aria-label="Privacy notice text"
				class="notice-reader max-h-[55dvh] overflow-y-auto overscroll-contain p-5 focus-visible:outline-2 focus-visible:outline-primary sm:p-7 lg:max-h-[68dvh]"
			>
				<PrivacyNoticeContent html={data.html} />
			</div>
		</section>
		<form
			method="POST"
			class="notice-controls space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6"
			use:enhance={() => {
				saving = true;
				errorMessage = '';
				return async ({ result, update }) => {
					try {
						if (result.type === 'error')
							errorMessage =
								result.error.message ?? 'Unable to save acknowledgement. Please try again.';
						else await update({ reset: false });
					} finally {
						saving = false;
					}
				};
			}}
		>
			<div>
				<h2 class="text-base font-semibold">รับทราบประกาศ</h2>
				<p class="mt-2 text-xs text-muted-foreground">บัญชีที่เข้าสู่ระบบ</p>
				<p class="mt-1 break-all text-sm font-medium">{data.user.email}</p>
			</div>
			<input type="hidden" name="next" value={data.next} />
			<label
				class="notice-choice flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm"
			>
				<input
					type="checkbox"
					name="acknowledgement"
					value="yes"
					bind:checked={acknowledged}
					required
					disabled={saving || signingOut}
					class="mt-1 size-4 shrink-0 accent-primary"
				/>
				<span>ฉันได้อ่านและรับทราบประกาศความเป็นส่วนตัวฉบับนี้แล้ว</span>
			</label>
			<div class="border-t border-border pt-5">
				<label class="notice-choice flex items-start gap-3 text-sm">
					<input
						type="checkbox"
						bind:checked={pushEnabled}
						onchange={changePush}
						aria-label="Enable push notifications (optional)"
						disabled={checkingPush ||
							pushBusy ||
							saving ||
							signingOut ||
							!supported ||
							!data.pushPublicKey}
						aria-describedby="push-notice-help"
						class="mt-1 size-4 shrink-0 accent-primary"
					/>
					<span class="font-medium"
						>เปิดรับการแจ้งเตือนแบบ Push บนอุปกรณ์นี้ <span
							class="font-normal text-muted-foreground">(ไม่บังคับ)</span
						></span
					>
				</label>
				<p id="push-notice-help" class="mt-2 text-xs leading-relaxed text-muted-foreground">
					เลือกเพื่อขออนุญาตผ่านเบราว์เซอร์ คุณสามารถใช้ระบบได้โดยไม่เปิด Push
					และเปลี่ยนตัวเลือกได้จากเมนูบัญชี การปิด Push ไม่ได้ปิดอีเมลด้านบัญชี
				</p>
				{#if checkingPush || pushBusy}<p role="status" class="mt-2 text-xs text-muted-foreground">
						{pushBusy ? 'กำลังเปลี่ยนการแจ้งเตือน…' : 'กำลังตรวจสอบการแจ้งเตือน…'}
					</p>{/if}
				{#if pushMessage}<p
						role="status"
						class="mt-2 text-xs leading-relaxed text-muted-foreground"
					>
						{pushMessage}
					</p>{/if}
			</div>
			<p class="text-xs leading-relaxed text-muted-foreground">
				การรับทราบประกาศนี้ไม่ใช่การยินยอมให้ประมวลผลข้อมูลทุกกรณี และแยกจากการเลือกเปิด Push
			</p>
			{#if errorMessage || form?.message}<p role="alert" class="text-sm text-danger">
					{errorMessage || form?.message}
				</p>{/if}
			<div class="flex flex-col gap-2">
				<Button type="submit" disabled={!acknowledged || saving || pushBusy || signingOut}
					>{saving ? 'กำลังบันทึก…' : 'รับทราบและดำเนินการต่อ'}</Button
				>
				<Button
					type="button"
					variant="ghost"
					disabled={saving || pushBusy || signingOut}
					onclick={signOut}>{signingOut ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ'}</Button
				>
			</div>
		</form>
	</div>
</main>

<style>
	.notice-screen :is(h1, h2, p) {
		margin-bottom: 0;
	}
	.notice-screen .notice-choice {
		display: flex;
		width: 100%;
		max-width: 100%;
		line-height: 1.75;
	}
	.notice-screen .notice-choice input {
		min-height: 1rem;
	}
	.notice-screen :global([data-slot='button']) {
		border-radius: 0.5rem;
		text-decoration: none;
	}
	@media (min-width: 1024px) {
		.notice-controls {
			position: sticky;
			top: 1.5rem;
		}
	}
</style>
