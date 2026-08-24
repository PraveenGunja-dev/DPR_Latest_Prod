import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../contexts/AuthContext";
import { getPasswordStatus, type PasswordStatus } from "@/services/authSecurityService";

const DISMISS_KEY = "password_expiry_dismissed";

/**
 * In-app warning shown to email-login users as their password nears expiry.
 *
 * Appears at the thresholds the backend reports (7, 3 and 1 days by default).
 * Dismissal is remembered per threshold per day, so closing the 7-day notice
 * does not also silence the 3-day and 1-day ones.
 *
 * SSO users never see it: the status endpoint reports NOT_APPLICABLE for them.
 */
export const PasswordExpiryBanner: React.FC = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuth();
    const [status, setStatus] = useState<PasswordStatus | null>(null);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) { setStatus(null); return; }
        let cancelled = false;
        getPasswordStatus()
            .then((data) => { if (!cancelled) setStatus(data); })
            .catch(() => { /* the banner is advisory - a failure just hides it */ });
        return () => { cancelled = true; };
    }, [isAuthenticated]);

    if (!status || !status.warn || status.state !== "OK") return null;
    if (status.daysRemaining === null) return null;

    const dismissToken = `${status.daysRemaining}:${new Date().toDateString()}`;
    if (dismissed || localStorage.getItem(DISMISS_KEY) === dismissToken) return null;

    const urgent = status.daysRemaining <= 1;

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, dismissToken);
        setDismissed(true);
    };

    return (
        <div
            role="status"
            className={`flex items-center gap-3 border-b px-4 py-2.5 text-sm ${
                urgent
                    ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
            }`}
        >
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">
                Your password will expire in{" "}
                <span className="font-semibold">
                    {status.daysRemaining} day{status.daysRemaining === 1 ? "" : "s"}
                </span>
                . Please change your password.
            </span>
            <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => navigate("/profile/security")}>
                Change Password
            </Button>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss"
                className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
};

export default PasswordExpiryBanner;
