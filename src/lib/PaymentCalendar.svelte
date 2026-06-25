<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Calendar } from '@fullcalendar/core';
	import dayGridPlugin from '@fullcalendar/daygrid';
	import interactionPlugin from '@fullcalendar/interaction';
	import { currency, formatWeekRange, type AllocatedWeek } from './payments.svelte';

	let { weeks, onselect }: { weeks: AllocatedWeek[]; onselect?: (w: AllocatedWeek) => void } =
		$props();

	let el: HTMLDivElement;
	let calendar: Calendar | undefined;

	const STATUS_CLASS: Record<AllocatedWeek['status'], string> = {
		paid: 'week-paid',
		partial: 'week-partial',
		unpaid: 'week-unpaid',
		waiting_approval: 'week-waiting-approval'
	};

	const STATUS_COLOR: Record<AllocatedWeek['status'], string> = {
		paid: 'var(--color-success)',
		partial: 'var(--color-warning)',
		unpaid: 'var(--color-danger)',
		waiting_approval: 'var(--color-info)'
	};

	function buildEvents(list: AllocatedWeek[]) {
		return list.map((w) => ({
			id: w.id,
			start: w.weekStart,
			end: addDaysLocal(w.weekStart, 8),
			allDay: true,
			title:
				w.status === 'paid'
					? `Paid · ${currency.format(w.cost)}`
					: w.status === 'partial'
						? `Partial · ${currency.format(w.allocated)} / ${currency.format(w.cost)}`
						: w.status === 'waiting_approval'
							? `Waiting approval (${currency.format(w.pendingAllocated)}) · ${currency.format(w.allocated)} + ${currency.format(w.pendingAllocated)} / ${currency.format(w.cost)}`
							: `Unpaid · ${currency.format(w.cost)}`,
			backgroundColor: STATUS_COLOR[w.status],
			borderColor: STATUS_COLOR[w.status],
			textColor: '#fff',
			extendedProps: { week: w }
		}));
	}

	function addDaysLocal(iso: string, days: number) {
		const d = new Date(iso + 'T00:00:00');
		d.setDate(d.getDate() + days);
		return d.toISOString().slice(0, 10);
	}

	// Map each calendar day -> status class for coloring the whole week strip.
	function dayClasses(list: AllocatedWeek[]) {
		const map = new Map<string, string>();
		for (const w of list) {
			for (let i = 0; i < 7; i++) {
				map.set(addDaysLocal(w.weekStart, i), STATUS_CLASS[w.status]);
			}
		}
		return map;
	}

	onMount(() => {
		calendar = new Calendar(el, {
			plugins: [dayGridPlugin, interactionPlugin],
			initialView: 'dayGridMonth',
			height: '100%',
			firstDay: 0,
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: ''
			},
			events: buildEvents(weeks),
			dayCellClassNames: (arg) => {
				const iso = arg.date.toISOString().slice(0, 10);
				const cls = dayClasses(weeks).get(iso);
				return cls ? [cls] : [];
			},
			eventClick: (info) => {
				const week = info.event.extendedProps.week as AllocatedWeek;
				onselect?.(week);
			}
		});
		calendar.render();
	});

	// Re-render when weeks change.
	$effect(() => {
		if (!calendar) return;
		// touch weeks for reactivity
		const list = weeks;
		calendar.removeAllEvents();
		calendar.addEventSource(buildEvents(list));
		calendar.setOption('dayCellClassNames', (arg) => {
			const iso = arg.date.toISOString().slice(0, 10);
			const cls = dayClasses(list).get(iso);
			return cls ? [cls] : [];
		});
	});

	onDestroy(() => calendar?.destroy());
</script>

<div bind:this={el} class="h-full w-full"></div>
