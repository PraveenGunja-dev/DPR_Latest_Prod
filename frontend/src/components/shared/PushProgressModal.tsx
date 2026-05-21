import React, { useEffect, useState } from "react";
import { getPushStatus } from "@/services/dprService";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PushProgressModalProps {
    isOpen: boolean;
    entryId: number | null;
    sheetName: string;
    onClose: () => void;
    onPushComplete: () => void;
}

export const PushProgressModal: React.FC<PushProgressModalProps> = ({
    isOpen,
    entryId,
    sheetName,
    onClose,
    onPushComplete
}) => {
    const [progress, setProgress] = useState(0);
    const [message, setMessage] = useState("Initializing push...");
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (!isOpen || !entryId) {
            setProgress(0);
            setMessage("Initializing push...");
            setIsComplete(false);
            return;
        }

        let pollInterval: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const status = await getPushStatus(entryId);
                
                if (status.is_pushing) {
                    const pct = status.total > 0 ? Math.round((status.progress / status.total) * 100) : 0;
                    setProgress(pct);
                    setMessage(status.message || "Pushing to P6...");
                } else if (!status.is_pushing && (status.progress === status.total && status.total > 0)) {
                    // Push finished!
                    setProgress(100);
                    setMessage("Push complete!");
                    setIsComplete(true);
                    clearInterval(pollInterval);
                    
                    // Automatically close and notify parent after a short delay
                    setTimeout(() => {
                        onPushComplete();
                        onClose();
                    }, 1500);
                } else if (!status.is_pushing) {
                    // Initial state or push hasn't started registering yet.
                    setMessage("Waiting for push to start...");
                }
            } catch (error) {
                console.error("Error polling push status:", error);
            }
        };

        // Poll every 1 seconds (faster since push is relatively quick)
        pollInterval = setInterval(checkStatus, 1000);
        
        // Initial check
        checkStatus();

        return () => {
            if (pollInterval) clearInterval(pollInterval);
        };
    }, [isOpen, entryId]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            // Prevent closing if not complete by clicking outside
            if (!open && isComplete) {
                onClose();
            }
        }}>
            <DialogContent className="sm:max-w-md p-0 flex flex-col overflow-hidden">
                <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
                    <DialogTitle className="text-white">Pushing {sheetName} to P6</DialogTitle>
                    <DialogDescription className="text-white/80">
                        Updating records for Entry #{entryId}. Please wait...
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
