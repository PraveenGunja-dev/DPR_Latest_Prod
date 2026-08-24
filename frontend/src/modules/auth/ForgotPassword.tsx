import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import CreatePasswordForm from "./components/CreatePasswordForm";
import OtpVerificationStep from "./components/OtpVerificationStep";
import {
    completePasswordReset,
    requestPasswordReset,
    verifyPasswordReset,
    type OtpChallenge,
} from "@/services/authSecurityService";

type Stage = "email" | "otp" | "password" | "done";

/**
 * Forgot-password recovery for email-login users.
 *
 * The first step always reports the same generic message whether or not the
 * address exists, so the screen cannot be used to discover accounts. The
 * destination is chosen by the server - a verified recovery address if one is
 * set, otherwise the registered login address - so a user can never nominate
 * an arbitrary inbox here.
 */
const ForgotPassword: React.FC = () => {
    const navigate = useNavigate();

    const [stage, setStage] = useState<Stage>("email");
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
    const [resetToken, setResetToken] = useState<string | null>(null);

    const handleRequest = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
            const result = await requestPasswordReset(email);
            setNotice(result.message);
            // An unknown address still returns 200 with the generic message but
            // carries no challenge, so the flow simply stops here.
            if (result.challengeId) {
                setChallenge(result as OtpChallenge);
                setStage("otp");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not start password recovery");
        } finally {
            setSubmitting(false);
        }
    };

    const handleOtpVerify = async (otp: string) => {
        const result = await verifyPasswordReset(challenge!.challengeId, otp);
        setResetToken(result.resetToken);
        setEmail(result.email);
        setStage("password");
    };

    const handleReset = async ({ newPassword, confirmPassword }: { newPassword: string; confirmPassword: string }) => {
        await completePasswordReset(resetToken!, newPassword, confirmPassword);
        setStage("done");
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="absolute right-6 top-6"><ThemeToggle /></div>

            <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-8 shadow-lg">
                <div className="space-y-3 text-center">
                    <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Adani" className="mx-auto h-8 object-contain" />
                    {stage === "email" && (
                        <>
                            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                                <Mail className="h-5 w-5 text-primary" aria-hidden />
                            </div>
                            <h1 className="text-xl font-semibold">Forgot Password</h1>
                            <p className="text-sm text-muted-foreground">
                                Enter your registered email address and we will send a verification code.
                            </p>
                        </>
                    )}
                    {stage === "password" && (
                        <>
                            <h1 className="text-xl font-semibold">Create New Password</h1>
                            <p className="text-sm text-muted-foreground">
                                Choose a new password for <span className="font-medium text-foreground">{email}</span>.
                            </p>
                        </>
                    )}
                </div>

                {stage === "email" && (
                    <form onSubmit={handleRequest} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="recoveryLoginEmail">Email Address</Label>
                            <Input
                                id="recoveryLoginEmail"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@company.com"
                                autoFocus
                                required
                            />
                        </div>

                        {notice && !challenge && (
                            <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">{notice}</div>
                        )}
                        {error && (
                            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
                        )}

                        <Button type="submit" className="w-full" disabled={submitting || !email}>
                            {submitting ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                            ) : (
                                "Send Verification Code"
                            )}
                        </Button>
                    </form>
                )}

                {stage === "otp" && challenge && (
                    <OtpVerificationStep
                        challenge={challenge}
                        onVerify={handleOtpVerify}
                        onChallengeChange={setChallenge}
                        onBack={() => { setStage("email"); setChallenge(null); setNotice(null); }}
                        title="Verify Your Identity"
                        submitLabel="Verify Code"
                    />
                )}

                {stage === "password" && (
                    <CreatePasswordForm
                        email={email}
                        onSubmit={handleReset}
                        submitLabel="Reset Password"
                    />
                )}

                {stage === "done" && (
                    <div className="space-y-4 text-center">
                        <CheckCircle2 className="mx-auto h-10 w-10 text-green-600 dark:text-green-400" aria-hidden />
                        <h2 className="text-lg font-semibold">Password Reset</h2>
                        <p className="text-sm text-muted-foreground">
                            Your password has been changed and all existing sessions were signed out.
                            Please sign in with your new password.
                        </p>
                        <Button className="w-full" onClick={() => navigate("/")}>Back to Login</Button>
                    </div>
                )}

                {stage !== "done" && (
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3 w-3" aria-hidden /> Back to Login
                    </button>
                )}
            </div>
        </div>
    );
};

export default ForgotPassword;
