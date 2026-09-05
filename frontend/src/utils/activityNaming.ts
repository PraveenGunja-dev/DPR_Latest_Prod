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
 * A row's physical progress as a 0-100 percentage, whichever scale it was stored in.
 *
 * P6 gives percent_complete as a fraction (0-1, verified across 346,924 activities: min 0, max 1),
 * but a saved draft can hold either that fraction or the already-multiplied percentage - the
 * sheets write one and parts of the rebuild write the other. Multiplying blindly by 100, as every
 * sheet used to, is right for 0.96 and turns a stored 96 into 9600; on one entry alone 396 of
 * 2,988 rows rendered as 9600 / 9800 / 10000.
 *
 * So the scale is inferred rather than assumed: BELOW 1 it is a fraction, 1 or above it is already
 * a percentage.
 *
 * The boundary sits at 1 rather than above it because both meanings of a bare 1 exist in the data
 * and only one of them can win. A draft stores 100%-complete as the fraction 1, while the API now
 * sends 1 for an activity that is 1% done (32 activities sit at exactly 0.01). Reading 1 as 100%
 * would turn those 32 into "complete"; reading it as 1% understates a finished activity by the
 * same margin. 1% is chosen because the API is the live path every sheet loads through, and
 * because a finished activity is also identifiable from its status and its Completed-vs-Scope
 * figures, where a 1% one is not. The honest fix is a single agreed scale on the wire rather than
 * two producers guessing - worth doing when the API contract is next touched.
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

        const pct = num < 1 ? num * 100 : num;
        return String(Math.round(Math.min(Math.max(pct, 0), 100)));
    }
    // Nothing usable, but an explicit zero anywhere still means zero rather than blank.
    const hasExplicitZero = candidates.some((c) => {
        if (c === null || c === undefined || c === "") return false;
        const n = typeof c === "number" ? c : parseFloat(String(c));
        return Number.isFinite(n) && n === 0;
    });
    return hasExplicitZero ? "0" : "";
};
