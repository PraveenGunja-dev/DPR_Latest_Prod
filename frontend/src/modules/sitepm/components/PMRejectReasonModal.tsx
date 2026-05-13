import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface PMRejectReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  entryId: number;
  sheetType: string;
}

export const PMRejectReasonModal: React.FC<PMRejectReasonModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  entryId,
  sheetType
}) => {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!rejectionReason.trim()) {
      alert("Please provide a rejection reason");
      return;
    }
    
    setIsLoading(true);
    try {
      await onConfirm(rejectionReason);
      setRejectionReason("");
      onClose();
    } catch (error) {
      console.error("Error rejecting entry:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setRejectionReason("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-md p-0 flex flex-col overflow-hidden">
        <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
          <DialogTitle className="text-white">Reject Sheet</DialogTitle>
        </DialogHeader>
        
        <div className="p-6 space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              You are rejecting Entry #{entryId} ({sheetType.replace(/_/g, ' ')}).
            </p>
            <p className="text-sm mt-2">
              Please provide a clear reason for rejection so the supervisor understands what needs to be corrected.
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="rejectionReason">Rejection Reason</Label>
            <Textarea
              id="rejectionReason"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why this sheet is being rejected..."
              rows={4}
              disabled={isLoading}
            />
          </div>
          
          <div className="flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !rejectionReason.trim()}
            >
              {isLoading ? "Rejecting..." : "Reject Sheet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};