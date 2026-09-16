import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, HelpCircle, Info } from "lucide-react";

export type DialogTone = "info" | "warning" | "question";

export interface DialogRequest {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  /** true → Confirm/Cancel pair resolving to a boolean; false → a single Close button. */
  isConfirm: boolean;
}

type Resolver = (value: boolean) => void;

/**
 * In-app replacement for window.alert / window.confirm.
 *
 * The browser dialogs are chrome we cannot style: they announce the host ("localhost:8080 says"),
 * ignore the app's theme, and on some browsers offer to suppress further dialogs - which silently
 * disables validation prompts for the rest of the session. These render as the app's own modal
 * instead, and keep the same call shape so a call site only has to `await`.
 *
 * If the host component is not mounted (an early module-level call, or a test), we fall back to
 * the native dialog rather than dropping the prompt on the floor.
 */
let openDialog: ((req: DialogRequest, resolve: Resolver) => void) | null = null;

const request = (req: DialogRequest): Promise<boolean> => {
  if (!openDialog) {
    if (typeof window === "undefined") return Promise.resolve(!req.isConfirm);
    const text = req.title ? `${req.title}\n\n${req.message}` : req.message;
    return Promise.resolve(req.isConfirm ? window.confirm(text) : (window.alert(text), true));
  }
  return new Promise<boolean>(resolve => openDialog!(req, resolve));
};

/** Message box with a single Close button. Resolves when it is dismissed. */
export const showAlert = (
  message: string,
  opts: { title?: string; tone?: DialogTone; confirmLabel?: string } = {},
): Promise<boolean> => request({ ...opts, message, isConfirm: false });

/** Confirm box. Resolves true when the user confirms, false when they cancel or dismiss it. */
export const showConfirm = (
  message: string,
  opts: { title?: string; tone?: DialogTone; confirmLabel?: string; cancelLabel?: string } = {},
): Promise<boolean> => request({ ...opts, message, isConfirm: true });

const TONE_ICON: Record<DialogTone, JSX.Element> = {
  info: <Info className="w-5 h-5 text-blue-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  question: <HelpCircle className="w-5 h-5 text-blue-500" />,
};

/** Mounted once at the app root; renders whatever showAlert / showConfirm asks for. */
export const AppDialogHost = () => {
  const [state, setState] = useState<{ req: DialogRequest; resolve: Resolver } | null>(null);

  useEffect(() => {
    openDialog = (req, resolve) => setState({ req, resolve });
    return () => { openDialog = null; };
  }, []);

  const close = (value: boolean) => {
    setState(prev => {
      prev?.resolve(value);
      return null;
    });
  };

  const req = state?.req;
  const tone: DialogTone = req?.tone || (req?.isConfirm ? "question" : "warning");

  return (
    <AlertDialog open={!!state} onOpenChange={open => { if (!open) close(false); }}>
      <AlertDialogContent className="max-w-md w-[90%] rounded-xl bg-white dark:bg-slate-900 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            {TONE_ICON[tone]}
            {req?.title || (req?.isConfirm ? "Please confirm" : "Note")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 dark:text-slate-300 mt-2 text-sm whitespace-pre-line">
            {req?.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-5 gap-2 sm:gap-0">
          {req?.isConfirm && (
            <AlertDialogCancel
              onClick={e => { e.preventDefault(); close(false); }}
              className="border-slate-200 dark:border-slate-700"
            >
              {req?.cancelLabel || "Cancel"}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={e => { e.preventDefault(); close(true); }}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6"
          >
            {req?.confirmLabel || (req?.isConfirm ? "OK" : "Close")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
