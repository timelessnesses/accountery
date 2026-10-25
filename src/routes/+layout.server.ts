// Private application pages require live authentication and D1. Public document
// routes opt into prerendering explicitly.
export const prerender = false;

export const load = async ({ platform, request }) => {
	if (!platform) {
		return {
			edgeLocation: 'unknown',
			cfRay: 'unknown'
		};
	}
	const edgeLocation = platform.cf ? platform.cf.colo : null;
	const cfRay = request.headers.get('cf-ray');
	return {
		edgeLocation,
		cfRay
	};
};
