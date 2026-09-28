import { fail, type Actions } from '@sveltejs/kit';
import { parseDateInput, unixTimestampToDate } from '$lib/date';
import { requireAdmin } from './admin';
import type { ObligationCreationPause } from '$lib/types/AutomaticObligationTypes';

type PauseRow = Omit<ObligationCreationPause, 'start_date' | 'end_date'> & {
	start_date: number;
	end_date: number;
};

export async function getObligationCreationPauses(
	database: D1Database
): Promise<ObligationCreationPause[]> {
	const { results } = await database
		.prepare(
			'SELECT id, start_date, end_date, reason FROM obligation_creation_pauses ORDER BY start_date, end_date, id'
		)
		.all<PauseRow>();
	return results.map((pause) => ({
		...pause,
		start_date: unixTimestampToDate(pause.start_date).toISOString().slice(0, 10),
		end_date: unixTimestampToDate(pause.end_date).toISOString().slice(0, 10)
	}));
}

function parsePause(form: FormData) {
	const startDate = parseDateInput(String(form.get('start_date') ?? ''));
	const endDate = parseDateInput(String(form.get('end_date') ?? ''));
	if (startDate === null || endDate === null) {
		return { ok: false, message: 'Valid start and end dates are required.' } as const;
	}
	if (endDate < startDate) {
		return { ok: false, message: 'End date must be on or after the start date.' } as const;
	}
	return { ok: true, startDate, endDate, reason: String(form.get('reason') ?? '').trim() } as const;
}

function parseId(form: FormData) {
	const id = Number(form.get('id'));
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export const obligationCreationActions = {
	saveCreationPause: async ({ platform, request, locals }) => {
		const admin = requireAdmin(locals.user);
		const form = await request.formData();
		const values = parsePause(form);
		if (!values.ok) return fail(400, values);
		const editing = form.has('id');
		const id = editing ? parseId(form) : null;
		if (editing && id === null)
			return fail(400, { ok: false, message: 'Invalid pause id.' } as const);
		const database = platform!.env.AccountingDatabase;
		if (
			editing &&
			!(await database
				.prepare('SELECT id FROM obligation_creation_pauses WHERE id = ?')
				.bind(id)
				.first())
		) {
			return fail(404, { ok: false, message: 'This pause no longer exists.' } as const);
		}
		const now = Math.floor(Date.now() / 1000);
		const statement = editing
			? database
					.prepare(
						'UPDATE obligation_creation_pauses SET start_date = ?, end_date = ?, reason = ? WHERE id = ?'
					)
					.bind(values.startDate, values.endDate, values.reason, id)
			: database
					.prepare(
						'INSERT INTO obligation_creation_pauses (start_date, end_date, reason, created_at) VALUES (?, ?, ?, ?)'
					)
					.bind(values.startDate, values.endDate, values.reason, now);
		await database.batch([
			statement,
			database
				.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
				.bind(
					admin.email,
					`${editing ? `Updated automatic obligation pause #${id}` : 'Paused automatic obligations'}: ${form.get('start_date')} through ${form.get('end_date')}${values.reason ? ` (${values.reason})` : ''}`,
					now
				)
		]);
		return { ok: true } as const;
	},
	removeCreationPause: async ({ platform, request, locals }) => {
		const admin = requireAdmin(locals.user);
		const id = parseId(await request.formData());
		if (id === null) return fail(400, { ok: false, message: 'Invalid pause id.' } as const);
		const database = platform!.env.AccountingDatabase;
		const pause = await database
			.prepare('SELECT start_date, end_date FROM obligation_creation_pauses WHERE id = ?')
			.bind(id)
			.first<{ start_date: number; end_date: number }>();
		if (!pause) return fail(404, { ok: false, message: 'This pause no longer exists.' } as const);
		await database.batch([
			database.prepare('DELETE FROM obligation_creation_pauses WHERE id = ?').bind(id),
			database
				.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
				.bind(
					admin.email,
					`Removed automatic obligation pause #${id} (${unixTimestampToDate(pause.start_date).toISOString().slice(0, 10)} through ${unixTimestampToDate(pause.end_date).toISOString().slice(0, 10)})`,
					Math.floor(Date.now() / 1000)
				)
		]);
		return { ok: true } as const;
	}
} satisfies Actions;
