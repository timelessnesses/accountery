import { json } from '@sveltejs/kit';
import { validateAmount } from '$lib/promptpay';
import { submitPayment } from '$lib/server/paymentSubmission';

export const POST = async ({ locals, platform, request }) => {
	const env = platform?.env as Env | undefined;
	const accountingDatabase = env?.AccountingDatabase;

	if (!locals.user || !accountingDatabase) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = (await request.json().catch(() => null)) as {
		amount?: number;
		note?: string;
		proof?: Base64URLString;
	} | null;
	if (!body) return json({ error: 'Invalid payment' }, { status: 400 });
	const amount = Number(body.amount);
	try {
		validateAmount(amount);
	} catch {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

	if (
		!Number.isFinite(amount) ||
		amount <= 0 ||
		typeof body.note !== 'string' ||
		!body.note.trim() ||
		typeof body.proof !== 'string' ||
		!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.proof)
	) {
		return json({ error: 'Invalid amount' }, { status: 400 });
	}

	const imageBytes = dataUrlToBytes(body.proof);
	if (imageBytes.length > 10 * 1024 * 1024)
		return json({ error: 'Image must be at most 10 MB.' }, { status: 413 });
	return json(await submitPayment(env!, locals.user.email, amount, body.note, imageBytes));
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
	const bytes = Buffer.from(dataUrl.split(',')[1], 'base64');
	return new Uint8Array(bytes);
}
