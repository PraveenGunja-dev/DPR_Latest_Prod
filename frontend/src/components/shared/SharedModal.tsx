import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface SharedModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const SharedModal: React.FC<SharedModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = "max-w-md"
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${maxWidth} max-h-[85vh] p-0 flex flex-col overflow-hidden`}>
        <DialogHeader className="gradient-adani px-6 py-4 flex-shrink-0 border-b border-white/10">
          <DialogTitle className="text-white">{title}</DialogTitle>
          <div className="sr-only">
            <DialogDescription>
              {title} modal
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
