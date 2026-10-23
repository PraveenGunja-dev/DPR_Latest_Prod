// src/services/friendlyErrors.ts
// A page left open for a while (30 min, an hour) comes back with its connection or session gone stale, and every
// screen then reports its own red "Failed to fetch ..." message. Those are not faults the user can act on - a
// refresh fixes them - so this turns them into one calm "please refresh" prompt instead.

import { toast } from 'sonner';

const IDLE_MS = 20 * 60 * 1000;   // no mouse / keyboard for this long counts as "left open"
const RECENT_MS = 30 * 1000;      // a connection problem this recent explains a failed load

let lastActivity = Date.now();
let lastConnectionIssue = 0;

/** Called by the API client when a request failed for a reason a refresh may cure (network, timeout, 5xx). */
export const noteConnectionIssue = () => {
    lastConnectionIssue = Date.now();
};

// "Failed to fetch projects", "Error loading data", "Unable to load ..." - load failures, not save failures.
const LOAD_FAILURE = /^(failed to (fetch|load|get|retrieve|refresh)|error (fetching|loading)|unable to (fetch|load)|could not (fetch|load))/i;

let installed = false;

export const installFriendlyErrors = () => {
    if (installed) return;
    installed = true;

    const touch = () => { lastActivity = Date.now(); };
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(ev =>
        window.addEventListener(ev, touch, { passive: true, capture: true })
    );

    const original = toast.error.bind(toast);
    (toast as any).error = (message: any, data?: any) => {
        const text = typeof message === 'string' ? message.trim() : '';
        const staleSession = Date.now() - lastActivity > IDLE_MS;
        const recentIssue = Date.now() - lastConnectionIssue < RECENT_MS;

        if (text && LOAD_FAILURE.test(text) && (staleSession || recentIssue)) {
            return toast.info('Please refresh the page to continue', {
                id: 'please-refresh',
                description: 'This page has been open for a while. Refreshing loads your latest data.',
                duration: 15000,
                action: { label: 'Refresh', onClick: () => window.location.reload() },
            });
        }
        return original(message, data);
    };
};
