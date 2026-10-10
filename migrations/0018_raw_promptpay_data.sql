-- Migration number: 0018 	 2026-10-07T05:25:24.135Z\
-- this is basically for making our own QR Code.
CREATE TABLE transfer_promptpay (
    -- stuff like mobile number, ID or "E-Wallet"
    target_type TEXT NOT NULL,
    -- identifier for said target
    target_info TEXT NOT NULL
);
