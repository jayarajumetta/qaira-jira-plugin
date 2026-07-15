import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

export function VirtualList<T>({
  items,
  itemHeight,
  height,
  fillHeight = false,
  itemKey,
  renderItem,
  emptyState,
  ariaLabel,
  className = "",
  itemClassName = "",
  overscan = 4
}: {
  items: T[];
  itemHeight: number;
  height?: number;
  fillHeight?: boolean;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
  itemClassName?: string;
  overscan?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(height || 0);

  useEffect(() => {
    if (!fillHeight) {
      setMeasuredHeight(height || 0);
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const updateHeight = () => {
      setMeasuredHeight(node.clientHeight);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);

    return () => observer.disconnect();
  }, [fillHeight, height]);

  const viewportHeight = Math.max(fillHeight ? measuredHeight : height || 0, itemHeight);

  const visibleItems = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length,
      Math.ceil((scrollTop + viewportHeight) / itemHeight) + overscan
    );

    return {
      startIndex,
      endIndex,
      rows: items.slice(startIndex, endIndex)
    };
  }, [itemHeight, items, overscan, scrollTop, viewportHeight]);

  if (!items.length) {
    return emptyState ? <>{emptyState}</> : null;
  }

  return (
    <div
      aria-label={ariaLabel}
      className={`virtual-list ${className}`.trim()}
      ref={containerRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ height: fillHeight ? "100%" : `${height || viewportHeight}px` }}
    >
      <div className="virtual-list-spacer" style={{ height: `${items.length * itemHeight}px` }}>
        {visibleItems.rows.map((item, offset) => {
          const index = visibleItems.startIndex + offset;

          return (
            <div
              className={`virtual-list-item ${itemClassName}`.trim()}
              key={itemKey(item, index)}
              style={{
                height: `${itemHeight}px`,
                transform: `translateY(${index * itemHeight}px)`
              }}
            >
              {renderItem(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
