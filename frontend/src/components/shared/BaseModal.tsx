import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
  fullScreen?: boolean;
}

/**
 * BaseModal - A reusable modal component with themed header, body, and footer sections.
 * Uses Adani theming with gradient header background.
 */
export const BaseModal: React.FC<BaseModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  children,
  footer,
  maxWidth = "max-w-2xl",
  showCloseButton = true,
  fullScreen = false
}) => {
  const modalClasses = fullScreen
    ? "max-w-[100vw] w-screen h-screen max-h-screen rounded-none"
    : `${maxWidth} max-h-[90vh] rounded-lg`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={`${modalClasses} flex flex-col p-0 gap-0 overflow-hidden border-none shadow-2xl transition-all duration-300`}>
        {/* Header with gradient background */}
        <DialogHeader className={`flex-shrink-0 px-6 py-4 gradient-adani ${fullScreen ? '' : 'rounded-t-lg'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white">
                  {icon}
                </div>
              )}
              <div>
                <DialogTitle className="text-lg font-semibold text-white">
                  {title}
                </DialogTitle>
                {description && (
                  <DialogDescription className="text-white/80 text-sm mt-0.5">
                    {description}
                  </DialogDescription>
                )}
              </div>
            </div>
            {showCloseButton && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20 rounded-full h-8 w-8"
              >
                <X size={18} />
              </Button>
            )}
          </div>
          {/* Hidden description for accessibility */}
          <div className="sr-only">
            <DialogDescription>
              {description || `${title} modal`}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Body - scrollable content area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 bg-background">
          {children}
        </div>

        {/* Footer - optional action buttons */}
        {footer && (
          <div className="flex-shrink-0 px-6 py-4 border-t border-border bg-muted/30">
            {footer}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
