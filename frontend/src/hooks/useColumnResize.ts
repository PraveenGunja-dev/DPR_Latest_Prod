import { useState, useCallback, useRef } from 'react';

/**
 * Reusable hook for column resizing via drag handles.
 * Mirrors the resize behaviour in StyledExcelTable so every grid in the app
 * feels consistent.
 *
 * Usage:
 *   const { colWidths, handleResizeStart } = useColumnResize({ Activity: 280 });
 *   // In header <th>: add a resize handle div with onMouseDown={e => handleResizeStart(e, 'Activity')}
 *   // On <th>/<td>:  style={{ width: colWidths['Activity'] ?? 280 }}
 */
export function useColumnResize(initialWidths: Record<string, number> = {}) {
  const [colWidths, setColWidths] = useState<Record<string, number>>(initialWidths);

  const resizingRef = useRef<{
    colName: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { colName, startX, startWidth } = resizingRef.current;
    const diff = e.clientX - startX;
    const newWidth = Math.max(40, startWidth + diff); // min 40px
    setColWidths(prev => ({ ...prev, [colName]: newWidth }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, colName: string) => {
      e.preventDefault();
      e.stopPropagation();
      const currentWidth = colWidths[colName] ?? initialWidths[colName] ?? 100;
      resizingRef.current = {
        colName,
        startX: e.clientX,
        startWidth: Number(currentWidth),
      };
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [colWidths, initialWidths, handleResizeMove, handleResizeEnd],
  );

  return { colWidths, handleResizeStart };
}
