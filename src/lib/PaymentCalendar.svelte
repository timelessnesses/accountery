<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Calendar } from '@fullcalendar/core';
	import dayGridPlugin from '@fullcalendar/daygrid';
	import interactionPlugin from '@fullcalendar/interaction';
	import { addDays, currency, toISODate, type AllocatedWeek } from './payments.svelte';

	let {
		weeks,
		onselect,
		titleFormat
	}: {
		weeks: AllocatedWeek[];
		onselect?: (w: AllocatedWeek) => void;
		titleFormat?: (w: AllocatedWeek) => string;
	} = $props();

	let el: HTMLDivElement;
	let calendar = $state.raw<Calendar>();

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
		return list.map((w) => {
			const title =
			titleFormat?.(w) ??
			(w.status === 'paid'
				? `Paid · ${currency.format(w.cost)}`
				: w.status === 'partial'
					? `Partial · ${currency.format(w.allocated)} / ${currency.format(w.cost)}`
					: w.status === 'waiting_approval'
						? `Waiting approval (${currency.format(w.pendingAllocated)}) · ${currency.format(w.allocated)} + ${currency.format(w.pendingAllocated)} / ${currency.format(w.cost)}`
						: `Unpaid · ${currency.format(w.cost)}`);
		return {
			id: w.id,
			start: w.dayStart,
			// FullCalendar uses an exclusive end for all-day events.
			end: addDays(w.dayEnd, 1),
			allDay: true,
			title,
			backgroundColor: STATUS_COLOR[w.status],
			borderColor: STATUS_COLOR[w.status],
			textColor: '#fff',
				extendedProps: { week: w }
			};
		});
	}

	// For overlapping ranges, show the most urgent payment status on the day.
	function dayClass(list: AllocatedWeek[], iso: string) {
		const priority = { paid: 0, waiting_approval: 1, partial: 2, unpaid: 3 };
		const matching = list.filter((w) => w.dayStart <= iso && iso <= w.dayEnd);
		matching.sort((a, b) => priority[b.status] - priority[a.status]);
		return matching.length ? [STATUS_CLASS[matching[0].status]] : [];
	}

	onMount(() => {
		calendar = new Calendar(el, {
			plugins: [dayGridPlugin, interactionPlugin],
			initialView: 'dayGridMonth',
			height: '100%',
			expandRows: true,
			firstDay: 0,
			headerToolbar: {
				left: 'prev,next today',
				center: 'title',
				right: ''
			},
			events: buildEvents(weeks),
			dayCellClassNames: (arg) => {
				const iso = toISODate(arg.date);
				return dayClass(weeks, iso);
			},
			eventClick: (info) => {
				const week = info.event.extendedProps.week as AllocatedWeek;
				onselect?.(week);
			}
		});
		calendar.render();
		requestAnimationFrame(() => calendar?.updateSize());
	});

	// Re-render when weeks change.
	$effect(() => {
		if (!calendar) return;
		// touch weeks for reactivity
		const list = weeks;
		calendar.batchRendering(() => {
			calendar!.getEventSources().forEach((source) => source.remove());
			calendar!.addEventSource(buildEvents(list));
			calendar!.setOption('dayCellClassNames', (arg) => dayClass(list, toISODate(arg.date)));
		});
	});

	onDestroy(() => calendar?.destroy());
</script>

<div bind:this={el} class="h-full w-full"></div>
