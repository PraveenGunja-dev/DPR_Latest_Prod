import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MailPlus, MoreVertical, RotateCcw, ScrollText, ShieldAlert, Unlock } from "lucide-react";
import { toast } from "sonner";
import { evaluatePassword } from "@/lib/passwordPolicy";
import PasswordStrengthMeter from "@/modules/auth/components/PasswordStrengthMeter";
import {
    adminForcePasswordChange, adminResendSetupNotification,
    adminResetPassword, adminUnlockUser,
} from "@/services/authSecurityService";
import type { ManagedUser } from "@/types";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface UserSecurityActionsMenuProps {
    user: ManagedUser;
    onChanged: () => void;
    onViewEvents: (user: ManagedUser) => void;
}

/**
 * Per-row security actions for an email-login user.
 *
 * SSO rows get a disabled menu with an explanation instead of controls that
 * would fail: their password lives in Entra ID, and the backend rejects every
 * one of these calls for an SSO account.
 */
export const UserSecurityActionsMenu: React.FC<UserSecurityActionsMenuProps> = ({
    user, onChanged, onViewEvents,
}) => {
    const [busy, setBusy] = useState(false);
    const [resetOpen, setResetOpen] = useState(false);
    const [tempPassword, setTempPassword] = useState("");
    const isSso = user.AuthenticationType === "SSO";

    useBodyScrollLock(resetOpen);

    const run = async (action: () => Promise<any>, successMessage: string) => {
        setBusy(true);
        try {
            await action();
            toast.success(successMessage);
            onChanged();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Action failed");
        } finally {
            setBusy(false);
        }
    };

    const evaluation = evaluatePassword(tempPassword, user.Email, user.Name);

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" title="Security actions" disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Security &mdash; {user.Name}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />

                    {isSso ? (
                        <div className="px-2 py-2 text-xs text-muted-foreground">
                            This account signs in with Microsoft SSO. Its password and MFA are
                            managed by Entra ID, not by Digitalized DPR.
                        </div>
                    ) : (
                        <>
                            <DropdownMenuItem onClick={() => { setTempPassword(""); setResetOpen(true); }}>
                                <RotateCcw className="mr-2 h-4 w-4" /> Reset password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => run(() => adminForcePasswordChange(user.ObjectId), "The user must change their password at next login.")}
                            >
                                <ShieldAlert className="mr-2 h-4 w-4" /> Force password change
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => run(() => adminResendSetupNotification(user.ObjectId), "Setup notification sent.")}
                            >
                                <MailPlus className="mr-2 h-4 w-4" /> Resend setup notification
                            </DropdownMenuItem>
                            {user.IsLocked && (
                                <DropdownMenuItem
                                    onClick={() => run(() => adminUnlockUser(user.ObjectId), "Account unlocked.")}
                                >
                                    <Unlock className="mr-2 h-4 w-4" /> Unlock account
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                        </>
                    )}

                    <DropdownMenuItem onClick={() => onViewEvents(user)}>
                        <ScrollText className="mr-2 h-4 w-4" /> View security events
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Reset password dialog. The value entered here is TEMPORARY: the
                backend forces the user to replace it at their next login, and
                it is never emailed. */}
            {resetOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
                        <h3 className="text-lg font-semibold">Reset Password</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Set a temporary password for <span className="font-medium text-foreground">{user.Email}</span>.
                            They will be required to replace it at their next login.
                        </p>

                        <div className="mt-4 space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="tempPassword">Temporary Password</Label>
                                <Input
                                    id="tempPassword"
                                    type="text"
                                    value={tempPassword}
                                    onChange={(e) => setTempPassword(e.target.value)}
                                    autoComplete="off"
                                    autoFocus
                                />
                            </div>

                            <PasswordStrengthMeter evaluation={evaluation} show={tempPassword.length > 0} />

                            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                                This password is never sent by email. Share it with the user through a
                                secure channel. Existing passwords cannot be viewed by anyone &mdash; they
                                are stored only as one-way hashes.
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <Button variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
                            <Button
                                disabled={!evaluation.valid || busy}
                                onClick={async () => {
                                    await run(
                                        () => adminResetPassword(user.ObjectId, tempPassword),
                                        "Temporary password set. The user must change it at next login.",
                                    );
                                    setResetOpen(false);
                                    setTempPassword("");
                                }}
                            >
                                {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Reset Password"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default UserSecurityActionsMenu;
