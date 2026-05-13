import React, { useEffect, useState } from "react";
import { getSyncStatus } from "@/services/p6ActivityService";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SyncProgressModalProps {
    isOpen: boolean;
    projectId: string | number | null;
    projectName: string;
    onClose: () => void;
    onSyncComplete: () => void;
}

export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
    isOpen,
    projectId,
    projectName,
    onClose,
    onSyncComplete
}) => {
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState("Initializing sync...");
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (!isOpen || !projectId) {
            setProgress(0);
            setMessage("Initializing sync...");
            setIsComplete(false);
            return;
        }

        let pollInterval: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const status = await getSyncStatus(projectId);
                
                if (status.isSyncing) {
                    setProgress(status.syncProgress || 0);
                    setMessage(status.syncMessage || "Syncing...");
                } else if (!status.isSyncing && (status.syncProgress === 100 || (status.syncProgress && status.syncProgress > 0))) {
                    // Sync finished!
                    setProgress(100);
                    setMessage("Sync complete!");
                    setIsComplete(true);
                    clearInterval(pollInterval);
                    
                    // Automatically close and notify parent after a short delay
                    setTimeout(() => {
                        onSyncComplete();
                        onClose();
                    }, 1500);
                } else if (!status.isSyncing) {
                    // Initial state or sync hasn't started registering yet.
                    setMessage("Waiting for sync to start...");
                }
            } catch (error) {
                console.error("Error polling sync status:", error);
            }
        };

        // Poll every 2 seconds
        pollInterval = setInterval(checkStatus, 2000);
        
        // Initial check
        checkStatus();

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isOpen, projectId]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            // Prevent closing if not complete by clicking outside
            if (!open && isComplete) {
                onClose();
            }
        }}>
            <DialogContent className="sm:max-w-md p-0 flex flex-col overflow-hidden">
                <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
                    <DialogTitle className="text-white">Syncing P6 Data</DialogTitle>
                    <DialogDescription className="text-white/80">
                        Updating records for {projectName}. Please wait...
                    </DialogDescription>
                </DialogHeader>
                <div className="p-6">
                <div className="flex flex-col space-y-4 py-4">
                    <div className="flex justify-between text-sm font-medium">
                        <span className="text-muted-foreground">{message}</span>
                        <span>{progress}%</span>
                    </div>
                    <Progress value={progress} className="w-full h-3" />
                </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
