import React from "react";
import { Check, X } from "lucide-react";
import {
    CHECK_LABELS,
    STRENGTH_COLORS,
    STRENGTH_LEVELS,
    type PasswordEvaluation,
} from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

interface PasswordStrengthMeterProps {
    evaluation: PasswordEvaluation;
    /** Hide the whole block until the user starts typing. */
    show?: boolean;
    className?: string;
}

/**
 * Live password strength indicator: a five-segment bar plus the mandatory
 * rule checklist. Re-renders on every keystroke because the parent passes a
 * freshly computed evaluation.
 *
 * The bar shows how good an *acceptable* password is; anything that still
 * fails a rule stays at "Weak" so the meter never encourages a password the
 * server will reject.
 */
export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({
    evaluation,
    show = true,
    className,
}) => {
    if (!show) return null;

    const colors = STRENGTH_COLORS[evaluation.level];
    const filledSegments = evaluation.valid ? evaluation.score + 1 : 1;

    // The five mandatory rules already have a checklist row each; only the
    // extra disqualifiers (own name, common password, sequential run, ...)
    // need to be spelled out below it.
    const extraErrors = evaluation.errors.filter(
        (e) => !e.startsWith("Password must contain at least one") && !e.includes("characters long"),
    );

    return (
        <div className={cn("space-y-3", className)} aria-live="polite">
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Password Strength
                    </span>
                    <span className={cn("text-xs font-semibold", colors.text)}>
                        {evaluation.level}
                    </span>
                </div>
                <div
                    className="flex gap-1"
                    role="progressbar"
                    aria-valuemin={1}
                    aria-valuemax={STRENGTH_LEVELS.length}
                    aria-valuenow={filledSegments}
                    aria-valuetext={evaluation.level}
                >
                    {STRENGTH_LEVELS.map((_, index) => (
                        <div
                            key={index}
                            className={cn(
                                "h-1.5 flex-1 rounded-full transition-colors duration-300",
                                index < filledSegments ? colors.bar : "bg-muted",
                            )}
                        />
                    ))}
                </div>
            </div>

            <ul className="space-y-1">
                {CHECK_LABELS.map(({ key, label }) => {
                    const passed = evaluation.checks[key];
                    return (
                        <li
                            key={key}
                            className={cn(
                                "flex items-center gap-2 text-xs transition-colors",
                                passed ? "text-green-600 dark:text-green-400" : "text-muted-foreground",
                            )}
                        >
                            {passed ? (
                                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            ) : (
                                <X className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                            )}
                            <span>{label}</span>
                        </li>
                    );
                })}
            </ul>

            {/* Disqualifiers beyond the five checklist rules - reused password
                patterns, the user's own name, sequential runs and so on. */}
            {extraErrors.length > 0 && (
                <ul className="space-y-1">
                    {extraErrors.map((error) => (
                        <li key={error} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                            <X className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>{error}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PasswordStrengthMeter;
