/** Keep the destination visible and keyboard focus at the record opened from an audit link. */
export function focusAuditElement(node: HTMLElement) {
	node.scrollIntoView({
		block: 'center',
		behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
	});
	node.focus({ preventScroll: true });
}

export function auditFocus(node: HTMLElement, active: boolean) {
	let frame = 0;
	function update(enabled: boolean) {
		cancelAnimationFrame(frame);
		if (enabled) frame = requestAnimationFrame(() => focusAuditElement(node));
	}
	update(active);
	return {
		update,
		destroy() {
			cancelAnimationFrame(frame);
		}
	};
}
