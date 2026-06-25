import { SLIP_OK_API_ENDPOINT, SLIP_OK_API_KEY } from '$env/static/private';

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
type SlipOkResponse =
	| {
			// Request Success
			success: false;
	  }
	| {
			success: true;
			data: {
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
	  };

/**
 *
 * @param slipImage - A URL to R2's direct path
 */
export async function checkSlip(slipImage: string, amount: number): Promise<SlipOkResponse> {
	const apiKey = SLIP_OK_API_KEY;
	const apiEndpoint = SLIP_OK_API_ENDPOINT;
	const a = await fetch(apiEndpoint, {
		method: 'POST',
		headers: {
			'X-Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			url: slipImage,
			log: true,
			amount
		})
	});
	const response = await a.json<SlipOkResponse>();
	return response;
}
