import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';

/**
 * Progressive row rendering for the hand-rolled BESS grids.
 *
 * The PSS sheets go through StyledExcelTable, which only ever mounts an initial chunk of rows and
 * extends it as the user scrolls - that is why they stay responsive. The BESS grids render every
 * row (and every controlled input in it) up front, so a long sheet blocks the main thread. This
 * hook gives them the same chunked behaviour.
 */
export const useProgressiveRows = (
  totalRows: number,
  initialCount = 50,
  chunkSize = 100,
) => {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const containerRef = useRef<HTMLDivElement>(null);

  // Collapse back to the first chunk when the sheet is emptied (date / draft switch).
  useEffect(() => {
    if (totalRows === 0) setVisibleCount(initialCount);
  }, [totalRows, initialCount]);

  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Extend a chunk early (800px before the end) so scrolling never hits a blank gap.
    if (el.scrollHeight - el.scrollTop - el.clientHeight > 800) return;
    setVisibleCount(c => (c < totalRows ? Math.min(c + chunkSize, totalRows) : c));
  }, [totalRows, chunkSize]);

  /** Mount the next chunk on demand (the "show more rows" control under the grid). */
  const loadMore = useCallback(() => {
    setVisibleCount(c => Math.min(c + chunkSize, totalRows));
  }, [chunkSize, totalRows]);

  /** Force rows up to `count` to be mounted - used after appending a row so the user can see it. */
  const revealUpTo = useCallback((count: number) => {
    setVisibleCount(c => Math.max(c, count));
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  return { visibleCount, containerRef, handleScroll, loadMore, revealUpTo, scrollToBottom };
};
