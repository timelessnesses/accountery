import { env } from '$env/dynamic/private';
import jsQR from 'jsqr';

type BankInfoObject = {
	displayName: string;
	name: string;
	proxy: {
		type: 'NATID' | 'MSISDN' | 'EWALLETID' | 'EMAIL' | 'BILLERID';
		value: string;
	};
	account: {
		type: 'BANKAC' | 'TOKEN' | 'DUMMY';
		value: string;
	};
};

type SlipOkResponseObject = {
	// Valid QR code
	success: boolean;
	// Verification message
	message: string;
	receivingBank: string;
	sendingBank: string;
	transRef: string;
	// yyyyMMdd
	transDate: string;
	// HH:mm:ss
	transTime: string;
	// Timestamp based from ISO 8601 format
	transTimeStamp: string;
	sender: BankInfoObject;
	receiver: BankInfoObject;
	amount: number;
	paidLocalAmount: number;
	paidLocalCurrency: string;
	countryCode: string;
	transFeeAmount: number;
	ref1: string;
	ref2: string;
	ref3: string;
	toMerchantId: string;
};

export type SlipOkResponse =
	| {
			// Request Success
			success?: false;
			data?: SlipOkResponseObject;
			code?: number;
			message?: string;
	  }
	| {
			success: true;
			data: SlipOkResponseObject;
	  };

/** Verify receipt bytes with SlipOK; recipient and duplicate checks live in D1. */
export async function checkSlip({slipImage, amount, imageBinding}:{slipImage: ArrayBuffer, amount?: number, imageBinding: ImagesBinding}): Promise<SlipOkResponse> {
	const apiKey = env.SLIP_OK_API_KEY;
	const apiEndpoint = env.SLIP_OK_API_ENDPOINT;
	if (!apiKey || !apiEndpoint) {
		throw new Error('SlipOK API key or endpoint is not set in environment variables.');
	}
	const body = new FormData();
	// log:true also enforces the receiving account configured in SlipOK's LIFF.
	// Our receiving account is configured in transfer_promptpay instead.
	const streamable = new Blob([slipImage]).stream();
	const info = await imageBinding.info(streamable);
	if (!("width" in info && "height" in info)) {
		throw new Error('Failed to retrieve image dimensions from SlipOK API.');
	}
	const streamable2 = new Blob([slipImage]).stream();
	const pixels = await imageBinding.input(streamable2)
		.output({ format: "rgba"});
	const data = jsQR(new Uint8ClampedArray((await (new Response(await pixels.image()).arrayBuffer()))), info.width, info.height);
	if (!data) {
		throw new Error('Failed to decode QR code from the provided slip image.');
	}
	body.set('log', 'false');
	body.set('data', data.data);
	if (amount !== undefined) body.set('amount', String(amount));
	const a = await fetch(apiEndpoint, {
		method: 'POST',
		signal: AbortSignal.timeout(15000),
		headers: {
			'X-Authorization': apiKey
		},
		body
	});
	if (!a.ok) throw new Error(`SlipOK returned HTTP ${a.status}\n${await a.text()}`);
	const response = await a.json<SlipOkResponse>();
	return response;
}
