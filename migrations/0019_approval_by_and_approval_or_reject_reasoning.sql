-- Migration number: 0019 	 2026-10-07T05:26:11.781Z
-- there will be one processor and that's backend if the option's on so no links here
-- but defaults to link but checks for "Application Approved"
-- Existing payments have no recorded processor or reasoning. Keep them empty
-- rather than attributing historical decisions to a person or the application.
ALTER TABLE "transactions" ADD COLUMN "processor" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transactions" ADD COLUMN "reject_reason" TEXT NOT NULL DEFAULT '';
ALTER TABLE "transactions" ADD COLUMN "void_reason" TEXT NOT NULL DEFAULT '';
