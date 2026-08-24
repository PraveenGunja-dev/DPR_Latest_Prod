// src/lib/passwordPolicy.ts
//
// Browser mirror of backend/app/auth/password_policy.py.
//
// This exists purely so the strength meter and the checklist can update on
// every keystroke without a round-trip. It is NOT a security boundary: every
// password is re-validated server side, so editing this file - or the DOM -
// gains an attacker nothing.
//
// Keep the rules here in step with the Python module. The live values are also
// served by GET /api/auth/email/policy for anything that must not be hardcoded.

export const PASSWORD_MIN_LENGTH = 9;

export const STRENGTH_LEVELS = ["Weak", "Fair", "Good", "Strong", "Very Strong"] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

const COMMON_PASSWORDS = new Set([
    "password", "password1", "password123", "passw0rd", "p@ssword", "p@ssw0rd",
    "welcome", "welcome1", "welcome123", "qwerty", "qwerty123", "qwertyuiop",
    "letmein", "iloveyou", "admin", "admin123", "administrator", "root",
    "abc123", "abcd1234", "a1b2c3d4", "123456", "1234567", "12345678",
    "123456789", "1234567890", "monkey", "dragon", "sunshine", "princess",
    "football", "baseball", "superman", "trustno1", "master", "shadow",
    "changeme", "change123", "default", "secret", "temp123", "test123",
    "india123", "adani", "adani123", "adani@123", "dpr123", "dpr@123",
]);

const CONTEXT_WORDS = ["adani", "dpr", "digitalized", "agel", "renewable"];

const SEQUENCES = [
    "abcdefghijklmnopqrstuvwxyz",
    "0123456789",
    "qwertyuiop",
    "asdfghjkl",
    "zxcvbnm",
];

export interface PasswordChecks {
    minLength: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
}

export interface PasswordEvaluation {
    checks: PasswordChecks;
    valid: boolean;
    score: number;          // 0..4, index into STRENGTH_LEVELS
    level: StrengthLevel;
    errors: string[];
    minLength: number;
}

/** The five mandatory rules, in the order the checklist renders them. */
export const CHECK_LABELS: { key: keyof PasswordChecks; label: string }[] = [
    { key: "minLength", label: `Minimum ${PASSWORD_MIN_LENGTH} characters` },
    { key: "uppercase", label: "Uppercase letter" },
    { key: "lowercase", label: "Lowercase letter" },
    { key: "number", label: "Number" },
    { key: "special", label: "Special character" },
];

const stripNonAlnum = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const hasSequentialRun = (password: string, runLength = 4) => {
    const lowered = password.toLowerCase();
    return SEQUENCES.some((seq) => {
        for (let i = 0; i <= seq.length - runLength; i += 1) {
            const window = seq.slice(i, i + runLength);
            const reversed = window.split("").reverse().join("");
            if (lowered.includes(window) || lowered.includes(reversed)) return true;
        }
        return false;
    });
};

const hasRepeatedRun = (password: string, runLength = 4) =>
    new RegExp(`(.)\\1{${runLength - 1},}`).test(password);

const isCommon = (password: string) => {
    const lowered = password.toLowerCase();
    if (COMMON_PASSWORDS.has(lowered)) return true;
    const stem = lowered.replace(/[^a-z]+$/, "");
    return stem.length > 0 && COMMON_PASSWORDS.has(stem);
};

/**
 * Score a candidate password and report which rules it satisfies.
 * Mirrors evaluate_password() in the Python policy module.
 */
export function evaluatePassword(
    password: string,
    email?: string,
    name?: string,
): PasswordEvaluation {
    const pwd = password || "";

    const checks: PasswordChecks = {
        minLength: pwd.length >= PASSWORD_MIN_LENGTH,
        uppercase: /[A-Z]/.test(pwd),
        lowercase: /[a-z]/.test(pwd),
        number: /[0-9]/.test(pwd),
        special: /[^A-Za-z0-9]/.test(pwd),
    };

    const errors: string[] = [];
    if (!checks.minLength) errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
    if (!checks.uppercase) errors.push("Password must contain at least one uppercase letter");
    if (!checks.lowercase) errors.push("Password must contain at least one lowercase letter");
    if (!checks.number) errors.push("Password must contain at least one number");
    if (!checks.special) errors.push("Password must contain at least one special character");

    const normalised = stripNonAlnum(pwd);

    if (email) {
        const localPart = email.split("@")[0];
        for (const candidate of [email, localPart]) {
            const stripped = stripNonAlnum(candidate);
            if (stripped && (stripped === normalised || (stripped.length >= 4 && normalised.includes(stripped)))) {
                errors.push("Password must not contain your email address");
                break;
            }
        }
    }

    if (name) {
        for (const word of name.trim().split(/\s+/)) {
            const stripped = stripNonAlnum(word);
            if (stripped.length >= 4 && normalised.includes(stripped)) {
                errors.push("Password must not contain your name");
                break;
            }
        }
    }

    if (CONTEXT_WORDS.some((word) => normalised.includes(word))) {
        errors.push("Password must not contain the organisation or application name");
    }
    if (isCommon(pwd)) {
        errors.push("Password is too common. Choose something less predictable");
    }
    if (hasSequentialRun(pwd)) {
        errors.push("Password must not contain sequential characters such as 'abcd' or '1234'");
    }
    if (hasRepeatedRun(pwd)) {
        errors.push("Password must not repeat the same character four or more times");
    }

    const uniqueErrors = Array.from(new Set(errors));
    const valid = uniqueErrors.length === 0;

    // A password that fails any rule can never score above "Weak" - the meter
    // must not encourage something the server will reject.
    let score = 0;
    if (valid) {
        score = 1;
        if (pwd.length >= PASSWORD_MIN_LENGTH + 3) score += 1;
        if (pwd.length >= PASSWORD_MIN_LENGTH + 7) score += 1;
        const variety = [
            (pwd.match(/[A-Z]/g) || []).length >= 2,
            (pwd.match(/[0-9]/g) || []).length >= 2,
            (pwd.match(/[^A-Za-z0-9]/g) || []).length >= 2,
            new Set(pwd).size >= PASSWORD_MIN_LENGTH,
        ].filter(Boolean).length;
        if (variety >= 2) score += 1;
        score = Math.min(score, STRENGTH_LEVELS.length - 1);
    }

    return {
        checks,
        valid,
        score,
        level: STRENGTH_LEVELS[score],
        errors: uniqueErrors,
        minLength: PASSWORD_MIN_LENGTH,
    };
}

/** Tailwind colour tokens per strength level, shared by the bar and the label. */
export const STRENGTH_COLORS: Record<StrengthLevel, { bar: string; text: string }> = {
    Weak: { bar: "bg-red-500", text: "text-red-600 dark:text-red-400" },
    Fair: { bar: "bg-orange-500", text: "text-orange-600 dark:text-orange-400" },
    Good: { bar: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-500" },
    Strong: { bar: "bg-lime-500", text: "text-lime-600 dark:text-lime-400" },
    "Very Strong": { bar: "bg-green-600", text: "text-green-600 dark:text-green-400" },
};
