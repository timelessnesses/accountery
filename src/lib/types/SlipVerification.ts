export type SlipVerification = {
	configured: boolean;
	recipientTypeMatches: boolean;
	recipientValueMatches: boolean;
	recipientValueMasked: boolean;
	amountMatches: boolean;
	duplicateSlip: boolean;
	allChecksPassed: boolean;
};
