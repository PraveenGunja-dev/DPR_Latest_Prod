import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, MailCheck, RotateCw } from "lucide-react";
import { resendOtp, AuthApiError, type OtpChallenge } from "@/services/authSecurityService";

interface OtpVerificationStepProps {
    challenge: OtpChallenge;
    /** Called with the entered code. Throw an AuthApiError to show an inline error. */
    onVerify: (otp: string) => Promise<void>;
    /** Lets the parent track the challenge id after a resend rotates it. */
    onChallengeChange?: (challenge: OtpChallenge) => void;
    onBack?: () => void;
    title?: string;
    description?: string;
    submitLabel?: string;
}

const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
};

/**
 * Six-digit OTP entry with a live expiry countdown and a throttled resend.
 *
 * The code itself only ever exists in this component's state and in the
 * request body - it is never written to localStorage or logged.
 */
export const OtpVerificationStep: React.FC<OtpVerificationStepProps> = ({
    challenge,
    onVerify,
    onChallengeChange,
    onBack,
    title = "Enter Verification Code",
    description,
    submitLabel = "Verify",
}) => {
    const [otp, setOtp] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [info, setInfo] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [resending, setResending] = useState(false);
    const [expiresIn, setExpiresIn] = useState(challenge.expiresInSeconds);
    const [cooldown, setCooldown] = useState(challenge.resendCooldownSeconds);
    const activeChallenge = useRef(challenge);

    useEffect(() => {
        activeChallenge.current = challenge;
        setExpiresIn(challenge.expiresInSeconds);
        setCooldown(challenge.resendCooldownSeconds);
        setOtp("");
    }, [challenge.challengeId]);

    // One timer drives both countdowns.
    useEffect(() => {
        const timer = setInterval(() => {
            setExpiresIn((v) => (v > 0 ? v - 1 : 0));
            setCooldown((v) => (v > 0 ? v - 1 : 0));
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleVerify = useCallback(async (code: string) => {
        if (code.length < 6 || verifying) return;
        setVerifying(true);
        setError(null);
        setInfo(null);
        try {
            await onVerify(code);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Verification failed";
            setError(message);
            setOtp("");
            // An exhausted or expired challenge cannot be retried - the user
            // must request a fresh code.
            if (err instanceof AuthApiError && ["OTP_ATTEMPTS_EXCEEDED", "OTP_EXPIRED"].includes(err.code)) {
                setExpiresIn(0);
            }
        } finally {
            setVerifying(false);
        }
    }, [onVerify, verifying]);

    const handleResend = async () => {
        if (cooldown > 0 || resending) return;
        setResending(true);
        setError(null);
        setInfo(null);
        try {
            const next = await resendOtp(activeChallenge.current.challengeId);
            activeChallenge.current = next;
            onChallengeChange?.(next);
            setOtp("");
            setExpiresIn(next.expiresInSeconds);
            setCooldown(next.resendCooldownSeconds);
            setInfo(`A new code has been sent to ${next.maskedEmail}.`);
        } catch (err) {
            const message = err instanceof Error ? err.message : "Could not resend the code";
            setError(message);
            if (err instanceof AuthApiError && typeof err.details.retryAfterSeconds === "number") {
                setCooldown(err.details.retryAfterSeconds);
            }
        } finally {
            setResending(false);
        }
    };

    const expired = expiresIn <= 0;

    return (
        <div className="space-y-5">
            <div className="space-y-2 text-center">
                <MailCheck className="mx-auto h-8 w-8 text-primary" aria-hidden />
                <h2 className="text-lg font-semibold">{title}</h2>
                <p className="text-sm text-muted-foreground">
                    {description ?? (
                        <>We sent a 6-digit code to <span className="font-medium text-foreground">{challenge.maskedEmail}</span>.</>
                    )}
                </p>
            </div>

            <div className="flex justify-center">
                <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => {
                        setOtp(value);
                        setError(null);
                        if (value.length === 6) void handleVerify(value);
                    }}
                    disabled={verifying || expired}
                    autoFocus
                >
                    <InputOTPGroup className="gap-2">
                        {[0, 1, 2, 3, 4, 5].map((i) => (
                            <InputOTPSlot key={i} index={i} className="h-12 w-11 rounded-lg border text-lg" />
                        ))}
                    </InputOTPGroup>
                </InputOTP>
            </div>

            <p className="text-center text-xs text-muted-foreground">
                {expired ? (
                    <span className="text-destructive">This code has expired. Request a new one below.</span>
                ) : (
                    <>Code expires in <span className="font-medium text-foreground">{formatCountdown(expiresIn)}</span></>
                )}
            </p>

            {error && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
                    {error}
                </div>
            )}
            {info && (
                <div className="rounded-lg bg-primary/10 px-3 py-2 text-center text-sm text-primary">
                    {info}
                </div>
            )}

            <Button
                type="button"
                className="w-full"
                disabled={otp.length < 6 || verifying || expired}
                onClick={() => void handleVerify(otp)}
            >
                {verifying ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                ) : (
                    submitLabel
                )}
            </Button>

            <div className="flex items-center justify-between text-xs">
                <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldown > 0 || resending}
                    className="flex items-center gap-1.5 text-primary transition-colors hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                >
                    <RotateCw className={`h-3 w-3 ${resending ? "animate-spin" : ""}`} aria-hidden />
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
                {onBack && (
                    <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
                        Back
                    </button>
                )}
            </div>
        </div>
    );
};

export default OtpVerificationStep;
