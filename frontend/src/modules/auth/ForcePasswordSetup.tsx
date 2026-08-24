import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, KeyRound, ShieldCheck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "./contexts/AuthContext";
import CreatePasswordForm from "./components/CreatePasswordForm";
import OtpVerificationStep from "./components/OtpVerificationStep";
import {
    submitPasswordSetup,
    verifyPasswordSetup,
    type OtpChallenge,
} from "@/services/authSecurityService";

type Stage = "password" | "otp";

/**
 * Create New Password screen, used for both first-time setup and an expired
 * or administrator-forced password change.
 *
 * The screen cannot be reached without a challenge token, which the login
 * endpoint only issues after the current password has been verified. That
 * token is held in navigation state (never localStorage) so a stale tab or a
 * bookmarked URL lands back on the login page rather than into a half-open
 * flow. The backend enforces the same rule independently: an account in this
 * state has no access token at all, so no application route will answer it.
 */
const ForcePasswordSetup: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { applySession } = useAuth();

    const challenge = (location.state || {}) as {
        challengeToken?: string;
        reason?: "PASSWORD_SETUP_REQUIRED" | "PASSWORD_EXPIRED";
        email?: string;
        name?: string;
    };

    const [stage, setStage] = useState<Stage>("password");
    const [otpChallenge, setOtpChallenge] = useState<OtpChallenge | null>(null);
    const [error, setError] = useState<string | null>(null);

    // No challenge token means the user did not arrive through login.
    useEffect(() => {
        if (!challenge.challengeToken) navigate("/", { replace: true });
    }, [challenge.challengeToken, navigate]);

    if (!challenge.challengeToken) return null;

    const isExpired = challenge.reason === "PASSWORD_EXPIRED";

    const handlePasswordSubmit = async ({ newPassword, confirmPassword }: { newPassword: string; confirmPassword: string }) => {
        setError(null);
        const result = await submitPasswordSetup(challenge.challengeToken!, newPassword, confirmPassword);

        // With PASSWORD_SETUP_REQUIRE_OTP disabled the backend commits at once
        // and hands back a full session instead of an OTP challenge.
        if (result.status === "SUCCESS" && result.accessToken) {
            applySession(result);
            navigate(result.user?.Role === "Super Admin" ? "/superadmin" : "/projects", { replace: true });
            return;
        }

        setOtpChallenge({
            challengeId: result.challengeId!,
            maskedEmail: result.maskedEmail!,
            expiresInSeconds: result.expiresInSeconds!,
            resendCooldownSeconds: result.resendCooldownSeconds!,
            maxAttempts: result.maxAttempts!,
        });
        setStage("otp");
    };

    const handleOtpVerify = async (otp: string) => {
        const result = await verifyPasswordSetup(otpChallenge!.challengeId, otp);
        applySession(result);
        navigate(result.user?.Role === "Super Admin" ? "/superadmin" : "/projects", { replace: true });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="absolute right-6 top-6"><ThemeToggle /></div>

            <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-lg">
                <div className="space-y-3 text-center">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="mx-auto h-8 object-contain" />
                    {stage === "password" && (
                        <>
                            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                                {isExpired ? (
                                    <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden />
                                ) : (
                                    <KeyRound className="h-5 w-5 text-primary" aria-hidden />
                                )}
                            </div>
                            <h1 className="text-xl font-semibold">Create New Password</h1>
                            <p className="text-sm text-muted-foreground">
                                {isExpired
                                    ? "Your password has expired. Set a new one to continue."
                                    : "For your security, please create your own password before continuing."}
                            </p>
                            {challenge.email && (
                                <p className="text-xs text-muted-foreground">
                                    Signed in as <span className="font-medium text-foreground">{challenge.email}</span>
                                </p>
                            )}
                        </>
                    )}
                </div>

                {stage === "password" ? (
                    <CreatePasswordForm
                        email={challenge.email}
                        name={challenge.name}
                        onSubmit={handlePasswordSubmit}
                        submitLabel="Create Password"
                        error={error}
                    />
                ) : (
                    <OtpVerificationStep
                        challenge={otpChallenge!}
                        onVerify={handleOtpVerify}
                        onChallengeChange={setOtpChallenge}
                        onBack={() => { setStage("password"); setError(null); }}
                        title="Confirm Your New Password"
                        submitLabel="Complete Setup"
                    />
                )}

                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>
                        Your password is stored only as a secure one-way hash. Nobody, including
                        administrators, can read it.
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ForcePasswordSetup;
