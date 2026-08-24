import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { evaluatePassword } from "@/lib/passwordPolicy";
import PasswordStrengthMeter from "./PasswordStrengthMeter";

interface CreatePasswordFormProps {
    /** Used only to warn when the password contains the user's own identity. */
    email?: string;
    name?: string;
    /** Renders a "Current Password" field above the new-password fields. */
    requireCurrentPassword?: boolean;
    onSubmit: (values: { newPassword: string; confirmPassword: string; currentPassword?: string }) => Promise<void>;
    submitLabel?: string;
    error?: string | null;
}

/**
 * New-password entry with the live strength meter.
 *
 * The submit button stays disabled until the policy is satisfied and the
 * confirmation matches - but the backend re-validates everything regardless,
 * so this is a usability guard rather than a security one.
 */
export const CreatePasswordForm: React.FC<CreatePasswordFormProps> = ({
    email,
    name,
    requireCurrentPassword = false,
    onSubmit,
    submitLabel = "Create Password",
    error,
}) => {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const evaluation = useMemo(
        () => evaluatePassword(newPassword, email, name),
        [newPassword, email, name],
    );

    const confirmTouched = confirmPassword.length > 0;
    const confirmMatches = confirmPassword === newPassword;
    const canSubmit =
        evaluation.valid &&
        confirmMatches &&
        confirmTouched &&
        (!requireCurrentPassword || currentPassword.length > 0) &&
        !submitting;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setLocalError(null);
        try {
            await onSubmit({
                newPassword,
                confirmPassword,
                currentPassword: requireCurrentPassword ? currentPassword : undefined,
            });
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {requireCurrentPassword && (
                <div className="space-y-1.5">
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                        id="currentPassword"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                    />
                </div>
            )}

            <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                    <Input
                        id="newPassword"
                        type={showNew ? "text" : "password"}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pr-10"
                        required
                    />
                    <button
                        type="button"
                        onClick={() => setShowNew((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showNew ? "Hide password" : "Show password"}
                    >
                        {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <PasswordStrengthMeter evaluation={evaluation} show={newPassword.length > 0} />

            <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
                {confirmTouched && !confirmMatches && (
                    <p className="text-xs text-destructive">Passwords do not match</p>
                )}
            </div>

            {(error || localError) && (
                <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error || localError}
                </div>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit}>
                {submitting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait...</>
                ) : (
                    submitLabel
                )}
            </Button>
        </form>
    );
};

export default CreatePasswordForm;
