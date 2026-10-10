export type PreApproveSlipsForPassedChecks = "preapprove_with_slips_passed_checks";
export type EnableManualPaymentQRGenerationForAutofillingAmount = "enable_manual_qr_gen_for_autofill";
export type PublicObligationsEnabled = "public_obligations_enabled";

export type BooleanAppSettings = PreApproveSlipsForPassedChecks | EnableManualPaymentQRGenerationForAutofillingAmount | PublicObligationsEnabled;
export type AppSettingsMap = {
    [key in BooleanAppSettings]: boolean;
};