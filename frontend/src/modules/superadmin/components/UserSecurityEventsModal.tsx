import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, X } from "lucide-react";
import { adminGetSecurityEvents, type SecurityEvent } from "@/services/authSecurityService";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { ManagedUser } from "@/types";

interface UserSecurityEventsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: ManagedUser | null;
}

/** Short, readable device label from a raw User-Agent string. */
const describeDevice = (ua: string | null): string => {
    if (!ua) return "-";
    const browser =
        /Edg\//.test(ua) ? "Edge" :
        /Chrome\//.test(ua) ? "Chrome" :
        /Firefox\//.test(ua) ? "Firefox" :
        /Safari\//.test(ua) ? "Safari" : "Browser";
    const os =
        /Windows/.test(ua) ? "Windows" :
        /Macintosh|Mac OS/.test(ua) ? "macOS" :
        /Android/.test(ua) ? "Android" :
        /iPhone|iPad/.test(ua) ? "iOS" :
        /Linux/.test(ua) ? "Linux" : "";
    return os ? `${browser} on ${os}` : browser;
};

const FAILURE_ACTIONS = new Set(["LOGIN_FAILED", "OTP_FAILED", "ACCOUNT_LOCKED", "PASSWORD_EXPIRED"]);

/**
 * Security audit timeline for one account.
 *
 * Shows what happened, when, from where and who did it. It never contains a
 * password, an OTP value or any other secret - the audit writer records only
 * action names and free-text remarks.
 */
export const UserSecurityEventsModal: React.FC<UserSecurityEventsModalProps> = ({
    isOpen, onClose, user,
}) => {
    const [events, setEvents] = useState<SecurityEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useBodyScrollLock(isOpen);

    useEffect(() => {
        if (!isOpen || !user) return;
        setLoading(true);
        setError(null);
        adminGetSecurityEvents(user.ObjectId)
            .then((data) => setEvents(data.events))
            .catch((err) => setError(err instanceof Error ? err.message : "Could not load security events"))
            .finally(() => setLoading(false));
    }, [isOpen, user?.ObjectId]);

    if (!isOpen || !user) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-lg border bg-background shadow-xl">
                <div className="flex items-start justify-between border-b p-5">
                    <div>
                        <h2 className="text-lg font-semibold">Security Audit Events</h2>
                        <p className="text-sm text-muted-foreground">{user.Name} &mdash; {user.Email}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-auto p-5">
                    {loading ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading events...
                        </div>
                    ) : error ? (
                        <div className="flex h-40 items-center justify-center text-destructive">{error}</div>
                    ) : events.length === 0 ? (
                        <div className="flex h-40 items-center justify-center text-muted-foreground">
                            No security events recorded for this user yet.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <th className="pb-2 pr-4 font-medium">Action</th>
                                        <th className="pb-2 pr-4 font-medium">Timestamp</th>
                                        <th className="pb-2 pr-4 font-medium">Result</th>
                                        <th className="pb-2 pr-4 font-medium">IP Address</th>
                                        <th className="pb-2 pr-4 font-medium">Device</th>
                                        <th className="pb-2 pr-4 font-medium">Performed By</th>
                                        <th className="pb-2 font-medium">Details</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((event) => (
                                        <tr key={event.id} className="border-b last:border-0 align-top">
                                            <td className="py-2.5 pr-4">
                                                <span className="font-mono text-xs font-medium">{event.action}</span>
                                            </td>
                                            <td className="whitespace-nowrap py-2.5 pr-4 text-muted-foreground">
                                                {new Date(event.timestamp).toLocaleString()}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                <Badge
                                                    variant={event.result === "FAILURE" || FAILURE_ACTIONS.has(event.action) ? "destructive" : "secondary"}
                                                    className="text-[10px]"
                                                >
                                                    {event.result}
                                                </Badge>
                                            </td>
                                            <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                                                {event.ipAddress || "-"}
                                            </td>
                                            <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                                                {describeDevice(event.device)}
                                            </td>
                                            <td className="py-2.5 pr-4 text-xs">{event.performedBy}</td>
                                            <td className="py-2.5 text-xs text-muted-foreground">{event.remarks || "-"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="border-t p-4 text-xs text-muted-foreground">
                    Audit records never contain passwords, one-time codes or reset secrets.
                </div>
            </div>
        </div>
    );
};

export default UserSecurityEventsModal;
