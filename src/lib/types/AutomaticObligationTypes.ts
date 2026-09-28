export type ObligationCreationPause = {
	id: number;
	/** Inclusive ISO calendar dates (YYYY-MM-DD). */
	start_date: string;
	end_date: string;
	reason: string;
};
