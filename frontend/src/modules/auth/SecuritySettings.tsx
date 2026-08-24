import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    ArrowLeft, BadgeCheck, CalendarClock, KeyRound, Loader2, MailQuestion, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useAuth } from "./contexts/AuthContext";
import CreatePasswordForm from "./components/CreatePasswordForm";
import OtpVerificationStep from "./components/OtpVerificationStep";
import {
    getPasswordStatus,
    setRecoveryEmail,
    submitPasswordChange,
    verifyPasswordChange,
    verifyRecoveryEmail,
    type OtpChallenge,
    type PasswordStatus,
} from "@/services/authSecurityService";

/**
 * Profile > Security.
 *
 * Change Password and Recovery Email, both gated by an emailed OTP. For SSO
 * users the page explains that their credentials live in Entra ID rather than
 * offering controls that would do nothing - the backend rejects those calls
 * for SSO accounts anyway.
 */
const SecuritySettings: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    const [status, setStatus] = useState<PasswordStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const [passwordChallenge, setPasswordChallenge] = useState<OtpChallenge | null>(null);
    const [recoveryChallenge, setRecoveryChallenge] = useState<OtpChallenge | null>(null);
    const [recoveryInput, setRecoveryInput] = useState("");
    const [savingRecovery, setSavingRecovery] = useState(false);

    const authType = (user as any)?.AuthenticationType || (user as any)?.authenticationType;
    const isSsoUser = authType === "SSO" || status?.authenticationType === "SSO";

    const loadStatus = async () => {
        try {
            const data = await getPasswordStatus();
            setStatus(data);
            setRecoveryInput(data.recoveryEmail || "");
        } catch {
            // A failure here only costs the summary panel; the forms still work.
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void loadStatus(); }, []);

    const handlePasswordSubmit = async ({ currentPassword, newPassword, confirmPassword }: any) => {
        const result = await submitPasswordChange(currentPassword, newPassword, confirmPassword);
        if (result.status === "SUCCESS") {
            toast.success("Password changed successfully");
            await loadStatus();
            return;
        }
        setPasswordChallenge(result as OtpChallenge);
    };

    const handlePasswordOtp = async (otp: string) => {
        await verifyPasswordChange(passwordChallenge!.challengeId, otp);
        setPasswordChallenge(null);
        toast.success("Password changed successfully");
        await loadStatus();
    };

    const handleRecoverySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingRecovery(true);
        try {
            const result = await setRecoveryEmail(recoveryInput.trim());
            setRecoveryChallenge(result);
            toast.info(`Verification code sent to ${result.maskedEmail}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not save the recovery email");
        } finally {
            setSavingRecovery(false);
        }
    };

    const handleRecoveryOtp = async (otp: string) => {
        await verifyRecoveryEmail(recoveryChallenge!.challengeId, otp);
        setRecoveryChallenge(null);
        toast.success("Recovery email verified");
        await loadStatus();
    };

    return (
        <div className="min-h-screen bg-background p-4 md:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
                        <ArrowLeft className="h-4 w-4" /> Back
                    </Button>
                    <div>
                        <h1 className="text-2xl font-semibold">Security</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage your password and account recovery options.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex h-40 items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
                    </div>
                ) : isSsoUser ? (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-primary" /> Managed by Single Sign-On
                            </CardTitle>
                            <CardDescription>
                                You sign in to Digitalized DPR with your Microsoft account.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-muted-foreground">
                            <p>
                                Your password and multi-factor authentication are managed by your
                                organisation's Microsoft Entra ID directory, not by this application.
                                Digitalized DPR never sets, stores or expires an SSO password.
                            </p>
                            <p>
                                To change your password or update your authenticator, use your
                                organisation's Microsoft account settings.
                            </p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* ── Account summary ───────────────────────────── */}
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-base">Account</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Login Email</p>
                                    <p className="text-sm font-medium">{user?.email || user?.Email}</p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Sign-in Method</p>
                                    <Badge variant="secondary">Email + OTP</Badge>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Recovery Email</p>
                                    <p className="flex items-center gap-2 text-sm font-medium">
                                        {status?.recoveryEmail || <span className="text-muted-foreground">Not set</span>}
                                        {status?.recoveryEmail && (
                                            status.recoveryEmailVerified ? (
                                                <Badge className="gap-1 bg-green-600 hover:bg-green-600">
                                                    <BadgeCheck className="h-3 w-3" /> Verified
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-amber-600">Unverified</Badge>
                                            )
                                        )}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Password Status</p>
                                    <p className={`flex items-center gap-1.5 text-sm font-medium ${status?.warn ? "text-amber-600 dark:text-amber-400" : ""}`}>
                                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                                        {status?.label}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* ── Change password ───────────────────────────── */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <KeyRound className="h-4 w-4 text-primary" /> Change Password
                                </CardTitle>
                                <CardDescription>
                                    You will be asked for a verification code sent to your login email.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {passwordChallenge ? (
                                    <OtpVerificationStep
                                        challenge={passwordChallenge}
                                        onVerify={handlePasswordOtp}
                                        onChallengeChange={setPasswordChallenge}
                                        onBack={() => setPasswordChallenge(null)}
                                        title="Confirm Password Change"
                                        submitLabel="Change Password"
                                    />
                                ) : (
                                    <CreatePasswordForm
                                        email={user?.email || (user as any)?.Email}
                                        name={user?.name || (user as any)?.Name}
                                        requireCurrentPassword
                                        onSubmit={handlePasswordSubmit}
                                        submitLabel="Change Password"
                                    />
                                )}
                            </CardContent>
                        </Card>

                        {/* ── Recovery email ────────────────────────────── */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <MailQuestion className="h-4 w-4 text-primary" /> Recovery Email
                                </CardTitle>
                                <CardDescription>
                                    Used to recover your account if you forget your password. It must be
                                    verified before it can be used.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {recoveryChallenge ? (
                                    <OtpVerificationStep
                                        challenge={recoveryChallenge}
                                        onVerify={handleRecoveryOtp}
                                        onChallengeChange={setRecoveryChallenge}
                                        onBack={() => setRecoveryChallenge(null)}
                                        title="Verify Recovery Email"
                                        submitLabel="Verify Email"
                                    />
                                ) : (
                                    <form onSubmit={handleRecoverySubmit} className="space-y-4">
                                        <div className="space-y-1.5">
                                            <Label htmlFor="recoveryEmail">Recovery Email Address</Label>
                                            <Input
                                                id="recoveryEmail"
                                                type="email"
                                                value={recoveryInput}
                                                onChange={(e) => setRecoveryInput(e.target.value)}
                                                placeholder="you@personal-email.com"
                                                required
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                A personal address is fine. We will send a code there to confirm you own it.
                                            </p>
                                        </div>
                                        <Button
                                            type="submit"
                                            disabled={savingRecovery || !recoveryInput.trim() || recoveryInput.trim() === status?.recoveryEmail && status?.recoveryEmailVerified}
                                        >
                                            {savingRecovery ? (
                                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending...</>
                                            ) : status?.recoveryEmail ? "Update Recovery Email" : "Add Recovery Email"}
                                        </Button>
                                    </form>
                                )}
                            </CardContent>
                        </Card>
                    </>
                )}
            </div>
        </div>
    );
};

export default SecuritySettings;
