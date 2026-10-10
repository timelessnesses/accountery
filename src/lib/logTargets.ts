export type LogTarget =
	| { type: 'transaction'; id: number }
	| { type: 'obligation'; id: number }
	| { type: 'user'; email: string }
	| {
			type: 'settings';
			section: 'promptpay' | 'automatic-slip' | 'public-obligations' | 'creation-pauses';
	  };

export function positiveId(value: string | null): number | null {
	if (!value || !/^\d+$/.test(value)) return null;
	const id = Number(value);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validTarget(value: unknown): value is LogTarget {
	if (!value || typeof value !== 'object') return false;
	const target = value as Record<string, unknown>;
	if (target.type === 'transaction' || target.type === 'obligation')
		return typeof target.id === 'number' && Number.isSafeInteger(target.id) && target.id > 0;
	if (target.type === 'user')
		return typeof target.email === 'string' && /^[^\s/@]+@[^\s/@]+$/.test(target.email);
	return (
		target.type === 'settings' &&
		['promptpay', 'automatic-slip', 'public-obligations', 'creation-pauses'].includes(
			String(target.section)
		)
	);
}

/** Older entries have no metadata. Infer only known message prefixes, never arbitrary note text. */
function legacyTargets(action: string): LogTarget[] {
	const transaction = action.match(
		/^(?:Admin \S+ (?:approved|rejected|voided|checked slip for)|Application approved|Checked slip for) transaction(?: with id:)?\s+#?(\d+)\b/i
	);
	if (transaction) return [{ type: 'transaction', id: Number(transaction[1]) }];
	const bulk = action.match(
		/^Admin \S+ (?:approved|rejected|voided) transactions (?:with ids:|selected:)\s*([\d, ]+)/i
	);
	if (bulk) return bulk[1].split(',').map((id) => ({ type: 'transaction', id: Number(id.trim()) }));
	const obligation = action.match(/^(?:Created|Updated|Deleted) obligation #(\d+)\b/);
	if (obligation) return [{ type: 'obligation', id: Number(obligation[1]) }];
	const user = action.match(
		/^(?:Set leaving date for |Admin \S+ (?:changed user permissions for user: |(?:deleted|marked) user with email: ))([^\s;]+)/
	);
	if (user) return [{ type: 'user', email: user[1] }];
	if (/^(?:Enabled|Disabled) automatic slip approval$/.test(action))
		return [{ type: 'settings', section: 'automatic-slip' }];
	if (/^Admin \S+ updated the PromptPay recipient from a QR image$/.test(action))
		return [{ type: 'settings', section: 'promptpay' }];
	if (/^(?:Enabled|Disabled) the public obligations owed page$/.test(action))
		return [{ type: 'settings', section: 'public-obligations' }];
	if (
		/^(?:Updated automatic obligation pause|Paused automatic obligations|Removed automatic obligation pause)/.test(
			action
		)
	)
		return [{ type: 'settings', section: 'creation-pauses' }];
	return [];
}

export function getLogTargets(log: { action: string; targets?: string | null }): LogTarget[] {
	let targets: unknown[] = [];
	if (log.targets) {
		try {
			const parsed: unknown = JSON.parse(log.targets);
			if (Array.isArray(parsed)) targets = parsed;
		} catch {
			/* Preserve readable legacy entries. */
		}
	}
	if (!targets.length) targets = legacyTargets(log.action);
	return [
		...new Map(
			targets.filter(validTarget).map((target) => [JSON.stringify(target), target])
		).values()
	];
}

type LogHref =
	| `/admin/transactions?${string}`
	| `/admin/obligations?${string}`
	| `/admin/promptpay?${string}`
	| `/admin/users/${string}`;

export function logTargetLink(target: LogTarget, logId: number): { label: string; href: LogHref } {
	const source = `fromLog=${logId}`;
	if (target.type === 'transaction')
		return {
			label: `Transaction #${target.id}`,
			href: `/admin/transactions?highlightTransactionId=${target.id}&${source}`
		};
	if (target.type === 'obligation')
		return {
			label: `Obligation #${target.id}`,
			href: `/admin/obligations?highlightObligationId=${target.id}&${source}`
		};
	if (target.type === 'user')
		return {
			label: target.email,
			href: `/admin/users/${encodeURIComponent(target.email)}?${source}`
		};
	const labels = {
		promptpay: 'PromptPay recipient',
		'automatic-slip': 'Automatic slip approval',
		'public-obligations': 'Public balances',
		'creation-pauses': 'Creation pauses'
	};
	const path =
		target.section === 'promptpay' || target.section === 'automatic-slip'
			? 'promptpay'
			: 'obligations';
	return {
		label: labels[target.section],
		href: `/admin/${path}?highlightSetting=${target.section}&${source}`
	};
}
