/**
 * How an activity's block and name are turned into something comparable.
 *
 * P6 does not enforce a spelling, so the same block and the same activity arrive under several
 * forms and any exact comparison splits them apart. Real examples from the live schedule:
 *
 *   block, same project:   "Block-46"  "BLOCK46"          <- separator dropped
 *                          "Block 04"  "Block 4"          <- zero padding comes and goes
 *   activity, same work:   "LT Cable Terminations - LT Panel To IDT"
 *                          "LT Cable Terminations - LT Panel to IDT"     <- case
 *                          "Array Earthing Layout  For Block-24"         <- double space
 *                          "Array Layout \nOverall Plant Layout"         <- embedded newline
 *
 * 817 activity names across the database differ from another name ONLY by case or whitespace, and
 * eight solar projects hold one block number under more than one spelling. Grouped or filtered by
 * the raw text, one block renders as two partial groups and half its rows look missing.
 *
 * Everything that needs to ask "are these the same block / the same activity?" should come
 * through here, so the answer cannot differ between two screens.
 */

/** Dashes P6 exports that mean the same thing as "-". */
const DASHES = /[‐‑‒–—―]/g;

/**
 * A block's identity, independent of how it was typed.
 *
 * "Block-4", "BLOCK 04", "Blk-4", "block4" and "BLOCK-4" all answer "BLOCK-04". Two digits are
 * used because P6 mixes padded and unpadded forms for the same block; padding everything makes
 * them equal and sorts correctly as text. Numbers beyond 99 keep their own width.
 *
 * Anything that is not recognisably a block is returned trimmed and upper-cased rather than
 * discarded - a site may label an area in a way this does not model, and losing the label
 * silently is worse than passing it through.
 */
export const canonicalBlockKey = (value: string): string => {
    if (!value) return "";
    const cleaned = value.replace(DASHES, "-").replace(/\s+/g, " ").trim();

    // "Block", "Blk" or "Plot", any separator (or none), then the number.
    const m = cleaned.match(/^(?:block|blk|plot)\s*[-_]?\s*(\d+)\b/i);
    if (!m) return cleaned.toUpperCase();

    const n = parseInt(m[1], 10);
    return `BLOCK-${String(n).padStart(2, "0")}`;
};

/**
 * Strip a leading or trailing block/plot label from an activity name.
 *
 * Covers the forms P6 actually produces: "Block-01 - X", "Block 01 - X", "Blk 1 - X",
 * "Plot-3 - X" and the trailing "X - Block-01". The separator after the label may be a hyphen,
 * an en/em dash, or nothing at all.
 */
export const stripBlockPrefix = (name: string): string => {
    if (!name) return "";
    return name
        .replace(DASHES, "-")
        .replace(/^\s*(?:block|blk|plot)\s*[-_]?\s*\w+\s*-?\s*/i, "")
        .replace(/\s*-?\s*(?:block|blk|plot)\s*[-_]?\s*\d+\s*$/i, "")
        .trim();
};

/**
 * The comparison key for an activity name: case-, whitespace- and dash-insensitive.
 *
 * Whitespace is removed rather than collapsed so that "LT Panel To IDT" and "LT Panel  to  IDT"
 * agree, and so a newline inside a name behaves like the space it was meant to be. Use this for
 * lookups, grouping and equality - never for display.
 */
export const normalizeActivityKey = (name: string): string => {
    if (!name) return "";
    return name
        .replace(DASHES, "-")
        .replace(/Instalaltion/gi, "Installation")   // recurring P6 typo
        .toLowerCase()
        .replace(/\s+/g, "");
};

/**
 * The same key, with the block label removed first - for matching an activity against a master
 * list, whose entries are stored without any block prefix.
 */
export const activityMatchKey = (name: string): string => normalizeActivityKey(stripBlockPrefix(name));

/**
 * Round to at most PERCENT_DECIMALS places without leaving a trailing ".00".
 *
 * 99.409 -> "99.41", 99 -> "99", 0.5 -> "0.5". Progress is a typed measurement, so a whole
 * number must not acquire decimals it was never given.
 */
export const PERCENT_DECIMALS = 2;

const formatPercent = (value: number): string => {
    const clamped = Math.min(Math.max(value, 0), 100);
    // Number() drops the trailing zeros toFixed adds, and toFixed first avoids the binary
    // representation noise that makes 0.994 * 100 come out as 99.40000000000001.
    return String(Number(clamped.toFixed(PERCENT_DECIMALS)));
};

/**
 * A row's physical progress as a 0-100 percentage.
 *
 * Every producer is on the 0-100 scale, so nothing is inferred here:
 *
 *   - The API normalises P6's native 0-1 fraction on the way out - see the
 *     `CASE WHEN percent_complete <= 1 THEN percent_complete * 100` in routers/activities.py.
 *   - The sheets store `percentComplete` and `completionPercentage` as the 0-100 figure the
 *     supervisor typed.
 *   - Drafts written before that was true held `percentComplete` as a 0-1 fraction. They are
 *     converted once by the percent_scale_0_100_v1 data migration, so no fraction reaches here.
 *
 * This used to guess the scale with `num < 1 ? num * 100 : num`, which could not be made correct.
 * A draft stored 100% as exactly 1, and 1 is not below 1, so every finished activity read back as
 * 1% - the "progress keeps changing to 1" bug. The same guess made any value under 1% impossible
 * to store: 0.99 came back as 99, and 0.5 as 50. One agreed scale is what removes both.
 *
 * Callers still pass completionPercentage FIRST: it is the field the P6 push reads
 * (_PERCENT_FIELDS_0_100 in p6_push_service.py), so it is the one that must win a disagreement.
 *
 * A zero falls through to the caller's other field, because a row can carry 0 in one column and
 * the real figure in the other.
 *
 * Returns "" when there is no usable number, so an empty cell stays empty rather than showing 0.
 */
export const toPercentComplete = (...candidates: unknown[]): string => {
    for (const raw of candidates) {
        if (raw === null || raw === undefined || raw === "") continue;
        const num = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (!Number.isFinite(num) || num === 0) continue;

        return formatPercent(num);
    }
    // Nothing usable, but an explicit zero anywhere still means zero rather than blank.
    const hasExplicitZero = candidates.some((c) => {
        if (c === null || c === undefined || c === "") return false;
        const n = typeof c === "number" ? c : parseFloat(String(c));
        return Number.isFinite(n) && n === 0;
    });
    return hasExplicitZero ? "0" : "";
};

/**
 * Physical progress implied by a completed quantity against its scope, as a 0-100 string.
 *
 * The other half of the two-way binding between the Completed and Physical Progress % columns:
 * `percentToCompleted` goes one way, this goes the other. Both keep PERCENT_DECIMALS places, so
 * 6060 of 6096 reads 99.41 rather than being rounded to 99 and pushed back to P6 as a different
 * quantity than the one that was typed.
 */
export const completedToPercent = (completed: number, scope: number): string => {
    if (!Number.isFinite(completed) || !Number.isFinite(scope) || scope <= 0) return "0";
    return formatPercent((completed / scope) * 100);
};

/**
 * Completed quantity implied by a physical progress percentage against its scope.
 *
 * Kept to 2 decimals to match how the Completed column is already stored, and clamped to 0-100 so
 * a typo cannot push a quantity above scope.
 */
export const percentToCompleted = (percent: number, scope: number): number => {
    if (!Number.isFinite(percent) || !Number.isFinite(scope)) return 0;
    const clamped = Math.min(Math.max(percent, 0), 100);
    return Number(((clamped / 100) * scope).toFixed(2));
};

/**
 * The Physical Progress % cell for a sheet row - the ONE definition of that cell.
 *
 * Both the rendered cell and the edit-detection that compares against it must call this. They used
 * not to: the AC / DC / Testing sheets rendered
 * `toPercentComplete(completionPercentage, percentComplete, progress)` but compared against
 * `toPercentComplete(completionPercentage, percentComplete)`, without the third candidate. Any row
 * whose figure came from `progress` therefore showed one value and compared as another, so
 * `progChanged` was true on *every* edit, the handler took the "user changed the percentage" branch
 * and recomputed Completed from it. Typing 5547 into Completed on a row displaying 100% silently
 * produced 6096 - the whole scope - and the typed number was never stored.
 *
 * A stored zero next to a non-zero Completed is treated as missing rather than as "0% done".
 * P6 leaves the percentage at 0 on rows whose quantities are maintained through resource units, and
 * showing 0 beside "5986 of 6096 complete, 110 balance" contradicts the two columns either side of
 * it. The quantities are what the supervisor maintains, so they win.
 */
export const rowPercentComplete = (row: any): string => {
    const stored = toPercentComplete(row?.completionPercentage, row?.percentComplete, row?.progress);

    const scope = Number(row?.scope) || 0;
    const completed = Number(row?.actual ?? row?.cumulative) || 0;
    if ((stored === "" || stored === "0") && scope > 0 && completed > 0) {
        return completedToPercent(completed, scope);
    }
    return stored;
};
