import crc16ccitt from 'crc/calculators/crc16ccitt';
import { encode, parse, type TLVTag } from 'promptparse';
import { anyId, ProxyType } from 'promptparse/generate';

export type PromptPayTarget = {
	target_type: 'MSISDN' | 'NATID' | 'EWALLETID';
	target_info: string;
};

export const targetLabels = {
	MSISDN: 'Mobile number',
	NATID: 'National / tax ID',
	EWALLETID: 'E-wallet ID'
};

const proxyTags = {
	MSISDN: ProxyType.MSISDN,
	NATID: ProxyType.NATID,
	EWALLETID: ProxyType.EWALLETID
} as const;
const aid = 'A000000677010111';

export function normalizeMobile(value: string): string {
	if (value.startsWith('0066')) return '0' + value.slice(4);
	if (value.startsWith('+66')) return '0' + value.slice(3);
	if (value.startsWith('66')) return '0' + value.slice(2);
	return value;
}

export function validateTarget(target: PromptPayTarget): PromptPayTarget {
	const value =
		target.target_type === 'MSISDN' ? normalizeMobile(target.target_info) : target.target_info;
	const patterns = { MSISDN: /^0[689]\d{8}$/, NATID: /^\d{13}$/, EWALLETID: /^\d{15}$/ };
	if (!patterns[target.target_type]?.test(value))
		throw new Error('Invalid PromptPay recipient identifier.');
	return { target_type: target.target_type, target_info: value };
}

// CRC-16/CCITT-FALSE over UTF-8, including the final 6304 header.
export function crc16(payload: string): string {
	return crc16ccitt(new TextEncoder().encode(payload), 0xffff)
		.toString(16)
		.toUpperCase()
		.padStart(4, '0');
}

export function validateAmount(amount: number): string {
	if (
		!Number.isFinite(amount) ||
		amount <= 0 ||
		amount > 9999999999.99 ||
		Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001
	) {
		throw new Error(
			'Enter a positive amount with at most two decimal places (maximum 9,999,999,999.99 baht).'
		);
	}
	return amount.toFixed(2);
}

export function createPromptPayPayload(recipient: PromptPayTarget, amount?: number): string {
	const target = validateTarget(recipient);
	if (amount !== undefined) validateAmount(amount);
	return anyId({ type: target.target_type, target: target.target_info, amount });
}

function validateFields(tags: TLVTag[], payload: string): void {
	if (
		new Set(tags.map((tag) => tag.id)).size !== tags.length ||
		tags.some((tag) => !/^\d{2}$/.test(tag.id) || !tag.length || tag.length !== tag.value.length) ||
		encode(tags) !== payload
	)
		throw new Error('Malformed QR fields.');
}

export function parsePromptPayPayload(payload: string): PromptPayTarget {
	if (!payload || payload.length > 4096 || !/6304[\dA-Fa-f]{4}$/.test(payload)) {
		throw new Error('Invalid QR checksum. Upload an original, clear PromptPay QR image.');
	}
	// Signed lengths can stall PromptParse's permissive decoder.
	if (/[+-]\d/.test(payload)) throw new Error('Malformed QR fields.');
	const qr = parse(payload, true);
	if (!qr) throw new Error('Invalid QR checksum. Upload an original, clear PromptPay QR image.');
	validateFields(qr.getTags(), payload);
	if (
		qr.getTagValue('00') !== '01' ||
		!['11', '12'].includes(qr.getTagValue('01') ?? '') ||
		qr.getTagValue('53') !== '764' ||
		qr.getTagValue('58') !== 'TH'
	)
		throw new Error('This is not a Thai PromptPay payment QR.');
	if (!qr.getTag('29') || qr.getTag('30'))
		throw new Error('Upload a PromptPay transfer QR, not a bill-payment or receipt QR.');
	const merchant = qr.getTag('29')!.subTags;
	if (!merchant) throw new Error('Malformed QR fields.');
	validateFields(merchant, qr.getTagValue('29')!);
	if (qr.getTagValue('29', '00') !== aid) throw new Error('Unsupported PromptPay QR scheme.');
	const targets = Object.entries(proxyTags).filter(([, tag]) => qr.getTag('29', tag));
	if (targets.length !== 1 || merchant.some((tag) => !['00', '01', '02', '03'].includes(tag.id))) {
		throw new Error(
			'QR must contain exactly one mobile number, national / tax ID, or e-wallet ID.'
		);
	}
	const [type, tag] = targets[0];
	const value = qr.getTagValue('29', tag)!;
	if (type === 'MSISDN' && !/^0066[689]\d{8}$/.test(value))
		throw new Error('Invalid QR mobile number.');
	return validateTarget({
		target_type: type as PromptPayTarget['target_type'],
		target_info: value
	});
}

// Slip providers can redact digits with x/*; check every visible digit and require
// at least four visible trailing digits. A masked match cannot prove the full ID.
export function matchesPromptPayRecipient(
	target: PromptPayTarget,
	proxy: { type: string; value: string } | null | undefined
): boolean {
	if (!proxy || proxy.type !== target.target_type || typeof proxy.value !== 'string') return false;
	const expected = validateTarget(target).target_info;
	let received = proxy.value.replace(/[\s-]/g, '');
	if (target.target_type === 'MSISDN') received = normalizeMobile(received);
	if (
		!/^[\dxX*]+$/.test(received) ||
		received.length !== expected.length ||
		!/\d{4}$/.test(received)
	)
		return false;
	return [...received].every((digit, index) => /[xX*]/.test(digit) || digit === expected[index]);
}
