import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Copy, Loader2, Plus, ShieldOff, X } from "lucide-react";
import { toast } from "sonner";
import {
    listExternalClients,
    createExternalClient,
    revokeExternalClient,
    type ExternalApiClient,
    type CreatedExternalApiClient,
} from "@/services/externalClientService";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import type { ManagedUser } from "@/types";

interface ExternalClientsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: ManagedUser | null;
}

const copyToClipboard = (value: string, what: string) => {
    navigator.clipboard.writeText(value)
        .then(() => toast.success(`${what} copied`))
        .catch(() => toast.error(`Could not copy ${what.toLowerCase()}`));
};

/**
 * OAuth2 client-credentials for one External-role account (POST /api/external/token). This is
 * the "issue a secret" screen: creating shows the secret exactly once, in a box the admin has to
 * explicitly dismiss, and it is never retrievable again after that - not from this screen, not
 * from the API. Losing it means creating a new credential and revoking the old one.
 */
export const ExternalClientsModal: React.FC<ExternalClientsModalProps> = ({ isOpen, onClose, user }) => {
    const [clients, setClients] = useState<ExternalApiClient[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [label, setLabel] = useState("");
    const [justCreated, setJustCreated] = useState<CreatedExternalApiClient | null>(null);
    const [revokingId, setRevokingId] = useState<number | null>(null);

    useBodyScrollLock(isOpen);

    const load = useCallback(() => {
        if (!user) return;
        setLoading(true);
        setError(null);
        listExternalClients(user.ObjectId)
            .then(setClients)
            .catch((err) => setError(err instanceof Error ? err.message : "Could not load client credentials"))
            .finally(() => setLoading(false));
    }, [user]);

    useEffect(() => {
        if (!isOpen || !user) return;
        setJustCreated(null);
        setLabel("");
        load();
    }, [isOpen, user, load]);

    if (!isOpen || !user) return null;

    const handleCreate = async () => {
        setCreating(true);
        try {
            const result = await createExternalClient(user.ObjectId, label.trim() || undefined);
            setJustCreated(result);
            setLabel("");
            load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not create the client credential");
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (client: ExternalApiClient) => {
        if (!window.confirm(`Revoke "${client.label || client.client_id}"? Anything using it will stop working immediately.`)) return;
        setRevokingId(client.id);
        try {
            await revokeExternalClient(client.id);
            toast.success("Credential revoked");
            load();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not revoke the credential");
        } finally {
            setRevokingId(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl">
                <div className="flex items-start justify-between border-b p-5">
                    <div>
                        <h2 className="text-lg font-semibold">External API Clients</h2>
                        <p className="text-sm text-muted-foreground">{user.Name} &mdash; {user.Email}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex-1 overflow-auto p-5 space-y-5">
                    {justCreated && (
                        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
                            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                                Save this secret now &mdash; it will not be shown again
                            </p>
                            <div className="space-y-2">
                                <div>
                                    <Label className="text-xs">Client ID</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="flex-1 rounded bg-background border px-2 py-1.5 text-xs break-all">{justCreated.clientId}</code>
                                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(justCreated.clientId, "Client ID")}>
                                            <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                                <div>
                                    <Label className="text-xs">Client Secret</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <code className="flex-1 rounded bg-background border px-2 py-1.5 text-xs break-all">{justCreated.clientSecret}</code>
                                        <Button variant="outline" size="sm" onClick={() => copyToClipboard(justCreated.clientSecret, "Client secret")}>
                                            <Copy className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button size="sm" onClick={() => setJustCreated(null)}>
                                    I've saved this &mdash; done
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1.5">
                            <Label htmlFor="clientLabel" className="text-xs">New credential label (optional)</Label>
                            <Input
                                id="clientLabel"
                                placeholder="e.g. Production integration"
                                value={label}
                                onChange={(e) => setLabel(e.target.value)}
                                disabled={creating}
                            />
                        </div>
                        <Button onClick={handleCreate} disabled={creating}>
                            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Create credential
                        </Button>
                    </div>

                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Existing credentials
                        </p>
                        {loading ? (
                            <div className="flex h-24 items-center justify-center text-muted-foreground">
                                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
                            </div>
                        ) : error ? (
                            <div className="flex h-24 items-center justify-center text-destructive text-sm">{error}</div>
                        ) : clients.length === 0 ? (
                            <div className="flex h-24 items-center justify-center text-muted-foreground text-sm">
                                No client credentials yet.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <th className="pb-2 pr-4 font-medium">Client ID</th>
                                            <th className="pb-2 pr-4 font-medium">Label</th>
                                            <th className="pb-2 pr-4 font-medium">Status</th>
                                            <th className="pb-2 pr-4 font-medium">Last used</th>
                                            <th className="pb-2 font-medium"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clients.map((c) => (
                                            <tr key={c.id} className="border-b last:border-0 align-top">
                                                <td className="py-2.5 pr-4 font-mono text-xs">{c.client_id}</td>
                                                <td className="py-2.5 pr-4 text-xs">{c.label || "-"}</td>
                                                <td className="py-2.5 pr-4">
                                                    <Badge variant={c.is_active ? "secondary" : "destructive"} className="text-[10px]">
                                                        {c.is_active ? "Active" : "Revoked"}
                                                    </Badge>
                                                </td>
                                                <td className="py-2.5 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                                                    {c.last_used_at ? new Date(c.last_used_at).toLocaleString() : "Never"}
                                                </td>
                                                <td className="py-2.5 text-right">
                                                    {c.is_active && (
                                                        <Button
                                                            variant="ghost" size="sm"
                                                            className="text-destructive hover:text-destructive"
                                                            disabled={revokingId === c.id}
                                                            onClick={() => handleRevoke(c)}
                                                        >
                                                            {revokingId === c.id
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <ShieldOff className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                <div className="border-t p-4 text-xs text-muted-foreground">
                    A secret is shown once, at creation, and stored only as a one-way hash after that.
                    Rotate a credential by creating a new one and revoking the old &mdash; there is no
                    window with zero valid credentials if you create the replacement first.
                </div>
            </div>
        </div>
    );
};

export default ExternalClientsModal;
